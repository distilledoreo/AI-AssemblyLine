import { describe, expect, it } from "vitest";
import { formatOperationsLoadError } from "@/app/projects/[projectId]/operationsStatus";

describe("operations panel status helpers", () => {
  it("formats HTTP operations load failures for operator-visible UI", () => {
    expect(formatOperationsLoadError(503, "Database health check failed.")).toBe(
      "Operations panel unavailable. HTTP 503 Database health check failed.",
    );
  });

  it("formats network operations load failures without a status code", () => {
    expect(formatOperationsLoadError(undefined, "fetch failed")).toBe("Operations panel unavailable. fetch failed");
  });
});
