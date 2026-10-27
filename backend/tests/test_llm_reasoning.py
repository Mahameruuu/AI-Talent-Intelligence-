from app.llm.adapter import OpenAICompatibleAdapter


def _adapter(model: str, provider: str) -> OpenAICompatibleAdapter:
    return OpenAICompatibleAdapter("k", model, "http://localhost:1", 5, provider=provider)


def test_reasoning_effort_only_sent_to_reasoning_models():
    # Without it, gpt-oss / Gemini spend short token budgets on thinking and return truncated JSON.
    assert _adapter("openai/gpt-oss-120b", "groq")._reasoning_effort("low") == "low"
    assert _adapter("gemini-3.5-flash", "gemini")._reasoning_effort("minimal") == "low"
    assert _adapter("gemini-3.5-flash", "gemini")._reasoning_effort("high") == "high"
    assert _adapter("llama-3.3-70b-versatile", "groq")._reasoning_effort("low") is None
