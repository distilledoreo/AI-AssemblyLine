# Provider OAuth Notes

## OpenAI and ChatGPT

OpenAI's official OAuth documentation for ChatGPT is for GPT Actions: ChatGPT can authenticate individual users against an external API that the GPT calls. That is useful if AI AssemblyLine exposes actions to a custom GPT, because ChatGPT can send the user's OAuth token to AI AssemblyLine.

That is different from letting AI AssemblyLine sign a user in with ChatGPT and spend the user's ChatGPT Plus/Pro subscription quota through the OpenAI API. The production-safe path for this app remains OpenAI API keys or an organization-owned OpenAI Platform integration unless OpenAI publishes a supported OAuth flow for third-party API quota delegation.

## Google AI and Gemini

For Google generative AI production use, the supported options depend on the product surface:

- Gemini API / Google AI Studio: API key-based developer access.
- Vertex AI: Google Cloud API keys for testing or Application Default Credentials for production.

Google's Vertex AI documentation recommends Application Default Credentials for production. It also notes that AI Studio API keys are not supported in Vertex AI. For AI AssemblyLine, the production path should be a Google provider adapter that supports Vertex AI credentials or service-account-backed deployment credentials rather than trying to use a consumer Google AI Pro subscription as an OAuth quota source.
