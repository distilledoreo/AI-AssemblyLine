import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionCookieName } from "@/shared/session";
import { AuthRequiredError } from "@/server/errors";
import { resetStoreForTests, signInWithCredentials } from "@/server/repository";

const authMocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  getServerSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === sessionCookieName && authMocks.cookieValue ? { value: authMocks.cookieValue } : undefined),
  })),
}));

vi.mock("next-auth", () => ({
  getServerSession: authMocks.getServerSession,
}));

describe("server session resolution", () => {
  beforeEach(() => {
    resetStoreForTests();
    authMocks.cookieValue = undefined;
    authMocks.getServerSession.mockReset();
  });

  it("uses the local credentials session cookie when present", async () => {
    const { getCurrentUser } = await import("@/server/session");
    const { user, session } = await signInWithCredentials({
      email: "cookie-user@example.com",
      password: "assemblyline",
    });
    authMocks.cookieValue = session.token;

    await expect(getCurrentUser()).resolves.toMatchObject({ id: user.id, email: "cookie-user@example.com" });
    expect(authMocks.getServerSession).not.toHaveBeenCalled();
  });

  it("falls back to the database-backed NextAuth session for OAuth users", async () => {
    const { getCurrentUser, requireCurrentUser } = await import("@/server/session");
    const { user } = await signInWithCredentials({
      email: "oauth-user@example.com",
      password: "assemblyline",
    });
    authMocks.getServerSession.mockResolvedValue({ user: { id: user.id, email: user.email } });

    await expect(getCurrentUser()).resolves.toMatchObject({ id: user.id, email: "oauth-user@example.com" });
    await expect(requireCurrentUser()).resolves.toMatchObject({ id: user.id });
  });

  it("rejects requests with neither credentials nor NextAuth sessions", async () => {
    const { requireCurrentUser } = await import("@/server/session");
    authMocks.getServerSession.mockResolvedValue(null);

    await expect(requireCurrentUser()).rejects.toBeInstanceOf(AuthRequiredError);
  });
});
