"""External LLM adapter (Anthropic Claude).

The rest of the application depends only on :class:`LLMAdapter` and :class:`LLMError`, so another
provider can be added without touching business logic. All responses are requested as JSON matching
a schema and then validated again with Pydantic before use.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import TypeVar

from pydantic import BaseModel, ValidationError

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code  # disabled | timeout | rate_limited | provider_error | invalid_response | refused
        self.message = message


class LLMAdapter:
    provider: str | None = None
    model: str | None = None

    @property
    def enabled(self) -> bool:
        return False

    def describe(self) -> str:
        return "disabled"

    def generate_json(self, *, system: str, prompt: str, schema: type[T], max_tokens: int = 8000,
                      effort: str = "low", temperature: float | None = None) -> T:
        raise LLMError("disabled", "No LLM provider is configured (set ANTHROPIC_API_KEY).")


class ClaudeAdapter(LLMAdapter):
    provider = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float):
        import anthropic

        self._anthropic = anthropic
        # max_retries handles 429/5xx/connection errors with exponential backoff.
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=2)
        self.model = model

    @property
    def enabled(self) -> bool:
        return True

    def describe(self) -> str:
        return self.model or "claude"

    def generate_json(self, *, system: str, prompt: str, schema: type[T], max_tokens: int = 8000,
                      effort: str = "low", temperature: float | None = None) -> T:
        anthropic = self._anthropic
        json_schema = _strict_schema(schema.model_json_schema())
        try:
            response = self._client.beta.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}],
                output_config={"effort": effort, "format": {"type": "json_schema", "schema": json_schema}},
                # On a safety decline, let the API retry on its recommended fallback model.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.APITimeoutError as exc:
            raise LLMError("timeout", "The LLM provider did not respond in time.") from exc
        except anthropic.RateLimitError as exc:
            raise LLMError("rate_limited", "The LLM provider rate limit was reached. Try again later.") from exc
        except anthropic.AuthenticationError as exc:
            raise LLMError("provider_error", "The LLM API key was rejected.") from exc
        except anthropic.BadRequestError as exc:
            raise LLMError("provider_error", f"The LLM provider rejected the request: {exc.message}"[:300]) from exc
        except anthropic.APIStatusError as exc:
            raise LLMError("provider_error", f"LLM provider error (HTTP {exc.status_code}).") from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError("provider_error", "Could not connect to the LLM provider.") from exc

        if response.stop_reason == "refusal":
            raise LLMError("refused", "The LLM declined to process this request.")
        if response.stop_reason == "max_tokens":
            raise LLMError("invalid_response", "The LLM response was truncated.")
        text = next((b.text for b in response.content if b.type == "text"), None)
        if not text:
            raise LLMError("invalid_response", "The LLM returned no content.")
        try:
            return schema.model_validate(json.loads(text))
        except (json.JSONDecodeError, ValidationError) as exc:
            log.warning("LLM response failed schema validation: %s", type(exc).__name__)
            raise LLMError("invalid_response", "The LLM response did not match the expected structure.") from exc


def _strict_schema(schema: dict) -> dict:
    """Inline $defs and set additionalProperties=false / required=all on every object."""
    defs = schema.pop("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(dict(defs[node["$ref"].split("/")[-1]]))
            node = {k: resolve(v) for k, v in node.items() if k not in ("title", "default")}
            if node.get("type") == "object" and "properties" in node:
                node["additionalProperties"] = False
                node["required"] = list(node["properties"].keys())
            return node
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


class OpenAICompatibleAdapter(LLMAdapter):
    """Any provider exposing the OpenAI Chat Completions API: Groq, Ollama (local), OpenRouter, Gemini, …

    JSON mode is requested and the schema is given in the prompt; the reply is then validated with Pydantic.
    Smaller open models occasionally return invalid JSON, so one corrective retry is made before failing.
    """

    def __init__(self, api_key: str, model: str, base_url: str, timeout: float, provider: str = "openai_compatible"):
        import openai

        self._openai = openai
        # Ollama ignores the key but the SDK requires a non-empty value.
        self._client = openai.OpenAI(api_key=api_key or "not-needed", base_url=base_url, timeout=timeout, max_retries=2)
        self.model = model
        self.provider = provider
        self.base_url = base_url

    @property
    def enabled(self) -> bool:
        return True

    def describe(self) -> str:
        return f"{self.provider}:{self.model}"

    def _reasoning_effort(self, effort: str | None) -> str | None:
        """Reasoning models (Groq gpt-oss, Gemini 2.5+/3.x) otherwise spend the token budget on thinking, which
        truncates short JSON replies and slows every call. Other models reject the parameter, so only send it here."""
        model = (self.model or "").lower()
        if not effort or not ("gpt-oss" in model or self.provider == "gemini" or model.startswith("gemini")):
            return None
        effort = effort.lower()
        return effort if effort in ("low", "medium", "high") else "low"

    def generate_json(self, *, system: str, prompt: str, schema: type[T], max_tokens: int = 8000,
                      effort: str = "low", temperature: float | None = None) -> T:
        openai = self._openai
        json_schema = json.dumps(_strict_schema(schema.model_json_schema()), ensure_ascii=False)
        messages = [
            {"role": "system", "content": f"{system}\n\nRespond with a single JSON object only (no markdown, no "
                                          f"commentary) that conforms to this JSON Schema:\n{json_schema}"},
            {"role": "user", "content": prompt},
        ]
        last_error = "The LLM response did not match the expected structure."
        extra = {}
        reasoning = self._reasoning_effort(effort)
        if reasoning:
            extra["reasoning_effort"] = reasoning
        for attempt in range(2):
            try:
                response = self._client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.2 if temperature is None else temperature,
                    max_tokens=min(max_tokens, 8000),
                    **extra,
                )
            except openai.APITimeoutError as exc:
                raise LLMError("timeout", "The LLM provider did not respond in time.") from exc
            except openai.RateLimitError as exc:
                raise LLMError("rate_limited", "The LLM provider rate limit was reached (free-tier quota). "
                                               "Try again later.") from exc
            except openai.AuthenticationError as exc:
                raise LLMError("provider_error", "The LLM API key was rejected.") from exc
            except openai.NotFoundError as exc:
                raise LLMError("provider_error", f"Model '{self.model}' is not available at this provider.") from exc
            except openai.BadRequestError as exc:
                raise LLMError("provider_error", f"The LLM provider rejected the request: {exc.message}"[:300]) from exc
            except openai.APIStatusError as exc:
                raise LLMError("provider_error", f"LLM provider error (HTTP {exc.status_code}).") from exc
            except openai.APIConnectionError as exc:
                raise LLMError("provider_error", f"Could not connect to the LLM provider at {self.base_url}.") from exc

            choice = response.choices[0] if response.choices else None
            if choice is None or not choice.message.content:
                raise LLMError("invalid_response", "The LLM returned no content.")
            if choice.finish_reason == "length":
                raise LLMError("invalid_response", "The LLM response was truncated.")
            text = choice.message.content.strip()
            if text.startswith("```"):
                text = text.strip("`").removeprefix("json").strip()
            try:
                return schema.model_validate(json.loads(text))
            except (json.JSONDecodeError, ValidationError) as exc:
                log.warning("LLM JSON failed validation (attempt %s): %s", attempt + 1, type(exc).__name__)
                last_error = "The LLM response did not match the expected structure."
                messages = messages + [
                    {"role": "assistant", "content": choice.message.content},
                    {"role": "user", "content": f"That JSON was invalid ({type(exc).__name__}: {str(exc)[:300]}). "
                                                "Return only a corrected JSON object that matches the schema."},
                ]
        raise LLMError("invalid_response", last_error)


class FallbackAdapter(LLMAdapter):
    """Try the primary provider first; on quota, provider, timeout or bad-output errors use the next one.

    ``describe()`` reports the provider that actually served the most recent call on this thread, so stored
    results (e.g. an interview evaluation's ``method``) name the model that produced them.
    """

    def __init__(self, adapters: list[LLMAdapter]):
        self.adapters = [a for a in adapters if a.enabled]
        self.provider = "fallback"
        self.model = self.adapters[0].model if self.adapters else None
        self._local = threading.local()

    @property
    def enabled(self) -> bool:
        return bool(self.adapters)

    def describe(self) -> str:
        return getattr(self._local, "last", None) or " → ".join(a.describe() for a in self.adapters)

    def generate_json(self, *, system: str, prompt: str, schema: type[T], max_tokens: int = 8000,
                      effort: str = "low", temperature: float | None = None) -> T:
        errors: list[str] = []
        for adapter in self.adapters:
            try:
                result = adapter.generate_json(system=system, prompt=prompt, schema=schema, max_tokens=max_tokens,
                                               effort=effort, temperature=temperature)
                self._local.last = adapter.describe()
                return result
            except LLMError as exc:
                log.warning("LLM %s failed (%s); trying the next provider.", adapter.describe(), exc.code)
                errors.append(f"{adapter.describe()}: {exc.code}")
                last = exc
        raise LLMError(last.code if errors else "disabled", "All LLM providers failed (" + "; ".join(errors) + ").")


def _build(provider: str, *, model: str, timeout: float, api_key: str = "", base_url: str = "",
           anthropic_key: str = "") -> LLMAdapter:
    provider = (provider or "").lower()
    if provider == "anthropic":
        return ClaudeAdapter(anthropic_key, model, timeout) if anthropic_key else LLMAdapter()
    if provider in ("", "none", "disabled"):
        return LLMAdapter()
    url = base_url or PROVIDER_DEFAULT_URLS.get(provider, "")
    if not url or (provider != "ollama" and not api_key):
        log.warning("LLM provider '%s' is missing LLM_BASE_URL or its API key; skipping it.", provider)
        return LLMAdapter()
    return OpenAICompatibleAdapter(api_key, model, url, timeout, provider=provider)


PROVIDER_DEFAULT_URLS = {
    "groq": "https://api.groq.com/openai/v1",
    "ollama": "http://localhost:11434/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
}

_adapter: LLMAdapter = LLMAdapter()


def init_llm(api_key: str, model: str, timeout: float, provider: str = "anthropic", base_url: str = "",
             openai_api_key: str = "", fallback: dict | None = None) -> LLMAdapter:
    """Select the LLM provider (and an optional backup) from configuration.

    ``fallback`` = {"provider", "api_key", "model", "base_url"}. Without credentials the app runs rule-based only.
    """
    global _adapter
    primary = _build(provider or "anthropic", model=model, timeout=timeout, api_key=openai_api_key, base_url=base_url,
                     anthropic_key=api_key)
    backup = LLMAdapter()
    if fallback and fallback.get("provider"):
        backup = _build(fallback["provider"], model=fallback.get("model") or model, timeout=timeout,
                        api_key=fallback.get("api_key", ""), base_url=fallback.get("base_url", ""),
                        anthropic_key=fallback.get("api_key", ""))
    if primary.enabled and backup.enabled:
        _adapter = FallbackAdapter([primary, backup])
    else:
        _adapter = primary if primary.enabled else backup
    return _adapter


def get_llm() -> LLMAdapter:
    return _adapter


def set_llm(adapter: LLMAdapter) -> None:
    """Used by tests to inject a fake provider."""
    global _adapter
    _adapter = adapter
