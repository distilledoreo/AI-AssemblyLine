import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { sessionCookieName } from "@/shared/session";

function request(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("request proxy", () => {
  it("redirects unauthenticated protected routes to sign in", () => {
    const response = proxy(request("/projects/project-id/storyboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/signin?next=%2Fprojects%2Fproject-id%2Fstoryboard");
  });

  it("allows public routes and authenticated protected routes", () => {
    expect(proxy(request("/signin")).status).toBe(200);
    expect(proxy(request("/dashboard", `${sessionCookieName}=session-token`)).status).toBe(200);
  });
});
