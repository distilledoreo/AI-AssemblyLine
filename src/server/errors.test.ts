import { describe, expect, it, vi } from "vitest";
import { AppError, toErrorResponse } from "@/server/errors";

const captureErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/observability", () => ({
  captureError: captureErrorMock,
}));

describe("error responses", () => {
  it("does not report expected application errors", async () => {
    const response = toErrorResponse(new AppError("Bad input.", 400, "bad_input"));

    await expect(response.json()).resolves.toEqual({
      error: { code: "bad_input", message: "Bad input." },
    });
    expect(response.status).toBe(400);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("captures unexpected errors before returning a 500 response", async () => {
    const error = new Error("database exploded");
    const response = toErrorResponse(error, { route: "/api/projects" });

    await expect(response.json()).resolves.toEqual({
      error: { code: "internal_error", message: "database exploded" },
    });
    expect(response.status).toBe(500);
    expect(captureErrorMock).toHaveBeenCalledWith(error, {
      route: "/api/projects",
      source: "toErrorResponse",
    });
  });
});
