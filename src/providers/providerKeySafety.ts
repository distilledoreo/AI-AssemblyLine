export function normalizeProviderApiKey(apiKey: string | undefined) {
  return apiKey?.trim() ?? "";
}

export function isMockProviderApiKey(apiKey: string | undefined) {
  return normalizeProviderApiKey(apiKey).toLowerCase() === "mock";
}

export function isPlaceholderProviderApiKey(apiKey: string | undefined) {
  const normalized = normalizeProviderApiKey(apiKey).toLowerCase();
  return [
    "mock",
    "test",
    "dummy",
    "none",
    "null",
    "undefined",
    "placeholder",
    "changeme",
    "change-me",
    "replace-me",
    "example",
    "api-key",
    "apikey",
    "your-api-key",
    "your-openai-api-key",
    "your-stability-api-key",
    "your-runway-api-key",
    "your-google-ai-api-key",
    "sk-live-test",
    "sk-stability-live-test",
    "key_runway_live",
  ].includes(normalized);
}

export function hasLiveProviderApiKeyShape(apiKey: string | undefined) {
  const normalized = normalizeProviderApiKey(apiKey);
  return normalized.length >= 12 && /[a-z]/i.test(normalized) && /\d/.test(normalized);
}

export function isLiveProviderApiKey(apiKey: string | undefined) {
  const normalized = normalizeProviderApiKey(apiKey);
  return Boolean(normalized && !isPlaceholderProviderApiKey(normalized) && hasLiveProviderApiKeyShape(normalized));
}
