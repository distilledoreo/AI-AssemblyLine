import { describe, expect, it } from "vitest";
import {
  getConfiguredOAuthProviderSummaries,
  getConfiguredOAuthProviders,
} from "@/auth";

describe("auth provider configuration", () => {
  it("enables OAuth providers only when both client id and secret are configured", () => {
    const providers = getConfiguredOAuthProviderSummaries({
      AUTH_GOOGLE_ID: "google-client",
      AUTH_GOOGLE_SECRET: "google-secret",
      GITHUB_CLIENT_ID: "github-client",
    });

    expect(providers).toEqual([{ id: "google", name: "Google" }]);
  });

  it("accepts Auth.js and common provider-specific environment variable aliases", () => {
    const providers = getConfiguredOAuthProviders({
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
      AUTH_GITHUB_ID: "github-client",
      AUTH_GITHUB_SECRET: "github-secret",
    });

    expect(providers.map((provider) => provider.id)).toEqual(["github", "google"]);
    expect(providers.find((provider) => provider.id === "google")).toMatchObject({
      clientId: "google-client",
      clientSecret: "google-secret",
    });
  });
});
