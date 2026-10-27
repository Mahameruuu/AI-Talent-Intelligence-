"""OpenAI-compatible LLM adapter (Groq, Ollama, OpenRouter, Gemini) and provider selection."""

from types import SimpleNamespace

import httpx2 as httpx
import openai
import pytest
from pydantic import BaseModel

from app.llm.adapter import ClaudeAdapter, LLMAdapter, LLMError, OpenAICompatibleAdapter, init_llm


class Answer(BaseModel):
    verdict: str
    score: int | None


def reply(content: str, finish_reason: str = "stop"):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content), finish_reason=finish_reason)])


def adapter_with(responses):
    adapter = OpenAICompatibleAdapter("key", "llama-3.3-70b-versatile", "https://api.groq.com/openai/v1", 10, provider="groq")
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        item = responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    adapter._client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return adapter, calls


def test_valid_json_is_parsed_and_schema_is_in_prompt():
    adapter, calls = adapter_with([reply('{"verdict": "ok", "score": 4}')])
    out = adapter.generate_json(system="Be strict.", prompt="Evaluate.", schema=Answer)
    assert out == Answer(verdict="ok", score=4)
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert '"verdict"' in calls[0]["messages"][0]["content"]  # schema given to the model
    assert adapter.describe() == "groq:llama-3.3-70b-versatile"


def test_invalid_json_gets_one_corrective_retry():
    adapter, calls = adapter_with([reply("not json"), reply('```json\n{"verdict": "fixed", "score": null}\n```')])
    assert adapter.generate_json(system="s", prompt="p", schema=Answer).verdict == "fixed"
    assert len(calls) == 2 and "invalid" in calls[1]["messages"][-1]["content"]


def test_still_invalid_after_retry_raises():
    adapter, _ = adapter_with([reply('{"verdict": 1}'), reply('{"nope": true}')])
    with pytest.raises(LLMError) as err:
        adapter.generate_json(system="s", prompt="p", schema=Answer)
    assert err.value.code == "invalid_response"


def _status_error(cls, status):
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    return cls("error", response=httpx.Response(status, request=request), body=None)


@pytest.mark.parametrize("exc,code", [
    (lambda: _status_error(openai.RateLimitError, 429), "rate_limited"),
    (lambda: _status_error(openai.AuthenticationError, 401), "provider_error"),
    (lambda: openai.APITimeoutError(request=httpx.Request("POST", "https://x")), "timeout"),
])
def test_provider_errors_map_to_llm_errors(exc, code):
    adapter, _ = adapter_with([exc()])
    with pytest.raises(LLMError) as err:
        adapter.generate_json(system="s", prompt="p", schema=Answer)
    assert err.value.code == code


def test_truncated_reply_is_rejected():
    adapter, _ = adapter_with([reply('{"verdict": "o', finish_reason="length")])
    with pytest.raises(LLMError) as err:
        adapter.generate_json(system="s", prompt="p", schema=Answer)
    assert err.value.code == "invalid_response"


def test_provider_selection():
    assert type(init_llm("", "m", 5, provider="anthropic")) is LLMAdapter  # no key -> disabled
    assert isinstance(init_llm("sk-ant", "m", 5, provider="anthropic"), ClaudeAdapter)
    groq = init_llm("", "llama", 5, provider="groq", openai_api_key="gsk_x")
    assert isinstance(groq, OpenAICompatibleAdapter) and groq.base_url == "https://api.groq.com/openai/v1"
    assert type(init_llm("", "llama", 5, provider="groq")) is LLMAdapter  # missing key -> rule-based only
    ollama = init_llm("", "qwen2.5:7b", 5, provider="ollama")  # local: no key needed
    assert isinstance(ollama, OpenAICompatibleAdapter) and ollama.base_url.startswith("http://localhost:11434")
    assert type(init_llm("", "m", 5, provider="none")) is LLMAdapter
    init_llm("", "m", 5, provider="none")


class Scripted(LLMAdapter):
    def __init__(self, name, outcome):
        self.name, self.outcome, self.calls = name, outcome, 0

    @property
    def enabled(self):
        return True

    def describe(self):
        return self.name

    def generate_json(self, **kwargs):
        self.calls += 1
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def test_fallback_uses_backup_when_primary_quota_is_exhausted():
    from app.llm.adapter import FallbackAdapter

    primary = Scripted("groq:gpt-oss-120b", LLMError("rate_limited", "quota"))
    backup = Scripted("gemini:gemini-2.5-flash", Answer(verdict="backup", score=3))
    chain = FallbackAdapter([primary, backup])
    assert chain.generate_json(system="s", prompt="p", schema=Answer).verdict == "backup"
    assert primary.calls == 1 and backup.calls == 1
    assert chain.describe() == "gemini:gemini-2.5-flash"  # records who actually answered


def test_fallback_prefers_primary_and_reports_when_all_fail():
    from app.llm.adapter import FallbackAdapter

    primary = Scripted("groq", Answer(verdict="primary", score=5))
    backup = Scripted("gemini", Answer(verdict="backup", score=1))
    chain = FallbackAdapter([primary, backup])
    assert chain.generate_json(system="s", prompt="p", schema=Answer).verdict == "primary" and backup.calls == 0

    failing = FallbackAdapter([Scripted("groq", LLMError("rate_limited", "q")), Scripted("gemini", LLMError("provider_error", "bad key"))])
    with pytest.raises(LLMError) as err:
        failing.generate_json(system="s", prompt="p", schema=Answer)
    assert "groq: rate_limited" in err.value.message and "gemini: provider_error" in err.value.message


def test_init_llm_builds_fallback_chain():
    from app.llm.adapter import FallbackAdapter

    chain = init_llm("", "gpt-oss", 5, provider="groq", openai_api_key="gsk_x",
                     fallback={"provider": "gemini", "api_key": "AIza_x", "model": "gemini-2.5-flash", "base_url": ""})
    assert isinstance(chain, FallbackAdapter) and [a.provider for a in chain.adapters] == ["groq", "gemini"]
    assert chain.adapters[1].base_url.startswith("https://generativelanguage.googleapis.com")
    # Backup alone still works when the primary isn't configured.
    only_backup = init_llm("", "gpt-oss", 5, provider="groq", fallback={"provider": "gemini", "api_key": "AIza_x",
                                                                        "model": "gemini-2.5-flash"})
    assert isinstance(only_backup, OpenAICompatibleAdapter) and only_backup.provider == "gemini"
    init_llm("", "m", 5, provider="none")
