# Provider OAuth Notes

## OpenAI and ChatGPT

OpenAI's official OAuth documentation for ChatGPT is for GPT Actions: ChatGPT can authenticate individual users against an external API that the GPT calls. That is useful if AI AssemblyLine exposes actions to a custom GPT, because ChatGPT can send the user's OAuth token to AI AssemblyLine.

That is different from letting AI AssemblyLine sign a user in with ChatGPT and spend the user's ChatGPT Plus/Pro subscription quota through the OpenAI API. The production-safe path for this app remains OpenAI API keys or an organization-owned OpenAI Platform integration unless OpenAI publishes a supported OAuth flow for third-party API quota delegation.

## Google AI and Gemini

For Google generative AI production use, the supported options depend on the product surface:

- Gemini API / Google AI Studio: API key-based developer access.
- Gemini API OAuth: Google documents OAuth support for the Gemini API when stricter access control is required.
- Vertex AI: Google Cloud API keys for testing or Application Default Credentials for production.

AI AssemblyLine now has a live Google AI / Veo adapter through the Gemini API using encrypted workspace keys or `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY`. OAuth-backed Gemini credentials remain a future hardening path because production OAuth needs token refresh, consent scopes, and project attribution; it should not be treated as a consumer Google AI Pro subscription quota bridge until Google documents that flow for third-party app delegation.
