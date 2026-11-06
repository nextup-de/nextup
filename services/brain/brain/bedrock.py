"""Claude on Amazon Bedrock, through the Anthropic SDK's Mantle endpoint.

The only file that imports the SDK. Credentials come from the AWS chain (environment, role),
never from a request.
"""

from anthropic import AnthropicBedrockMantle

from brain.config import Settings
from brain.llm import OUTPUT_CAP, LLMClient


class BedrockLLMClient(LLMClient):
    def __init__(self, settings: Settings, region: str):
        self.settings = settings
        self.provider = "bedrock"
        self.region = region
        self.client = AnthropicBedrockMantle(aws_region=region, max_retries=1, timeout=settings.llm_timeout)
        self._reset_counters()

    def complete_json(self, system: str, user: str, schema: dict, name: str) -> str:
        # No temperature, top_p, top_k, thinking budget, prefill or forced tool_choice: each is a 400.
        resp = self.client.messages.create(
            model=self.settings.llm_model,
            max_tokens=OUTPUT_CAP.get(name, 1500),
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        )
        usage = getattr(resp, "usage", None)
        self.tokens_in += sum(getattr(usage, k, 0) or 0 for k in
                              ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
        self.tokens_out += getattr(usage, "output_tokens", 0) or 0
        self.answered_by = getattr(resp, "model", None) or self.answered_by
        if getattr(resp, "stop_reason", None) in ("refusal", "max_tokens"):
            return ""  # invalid output for the retry loop; a refusal has no server-side fallback here
        # Thinking blocks may come first: the answer is the first text block.
        return next((b.text for b in resp.content if getattr(b, "type", None) == "text"), "") or ""

    def health(self) -> dict:
        # Does not call the model: built means reachable as far as we can tell without paying.
        return {"reachable": True, "model_available": True}
