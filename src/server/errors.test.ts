import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, toErrorResponse } from "@/server/errors";

const captureErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/observability", () => ({
  captureError: captureErrorMock,
}));

describe("error responses", () => {
  beforeEach(() => {
    captureErrorMock.mockClear();
  });

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

  it("returns validation errors without reporting them as unexpected failures", async () => {
    const error = z.object({ assetId: z.string().uuid() }).safeParse({ assetId: "not-a-uuid" }).error!;
    const response = toErrorResponse(error, { route: "/api/projects/project/asset-bible" });

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "validation_error",
        message: "Request validation failed.",
        issues: [
          {
            path: "assetId",
            message: expect.any(String),
          },
        ],
      },
    });
    expect(response.status).toBe(400);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });
});
