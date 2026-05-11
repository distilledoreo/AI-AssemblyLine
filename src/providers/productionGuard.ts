import { AppError } from "@/server/errors";

export function assertMockProviderAllowed(providerSlug: string) {
  if (process.env.NODE_ENV === "production") {
    throw new AppError(
      `${providerSlug} is not configured for live production provider calls.`,
      500,
      "provider_not_configured",
    );
  }
}
