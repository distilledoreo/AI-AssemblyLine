export function normalizeProviderApiKey(apiKey: string | undefined) {
  return apiKey?.trim() ?? "";
}

export function isMockProviderApiKey(apiKey: string | undefined) {
  return normalizeProviderApiKey(apiKey).toLowerCase() === "mock";
}

export function isLiveProviderApiKey(apiKey: string | undefined) {
  const normalized = normalizeProviderApiKey(apiKey);
  return Boolean(normalized && !isMockProviderApiKey(normalized));
}
