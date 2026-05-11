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
    "placeholder",
    "changeme",
    "change-me",
    "replace-me",
    "example",
    "sk-live-test",
    "sk-stability-live-test",
    "key_runway_live",
  ].includes(normalized);
}

export function isLiveProviderApiKey(apiKey: string | undefined) {
  const normalized = normalizeProviderApiKey(apiKey);
  return Boolean(normalized && !isPlaceholderProviderApiKey(normalized));
}
