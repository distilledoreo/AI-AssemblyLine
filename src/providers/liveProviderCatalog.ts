export const LIVE_PROVIDER_SLUGS = ["openai", "stability", "runway", "google-ai"] as const;
export type LiveProviderSlug = (typeof LIVE_PROVIDER_SLUGS)[number];

export function isLiveProviderSlug(value: string): value is LiveProviderSlug {
  return (LIVE_PROVIDER_SLUGS as readonly string[]).includes(value);
}
