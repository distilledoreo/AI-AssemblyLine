import { describe, expect, it, vi } from "vitest";
import { runRunwaySmoke } from "@/providers/runwaySmoke";

describe("Runway smoke helper", () => {
  it("requires a real API key", async () => {
    await expect(runRunwaySmoke({ apiKey: " mOcK " })).rejects.toThrow(/RUNWAYML_API_SECRET/);
    await expect(runRunwaySmoke({ apiKey: "" })).rejects.toThrow(/RUNWAYML_API_SECRET/);
  });

  it("submits a low-duration Runway video task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "task-runway-smoke", status: "PENDING" }));

    const result = await runRunwaySmoke({
      apiKey: "key_runway_live",
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      provider: "runway",
      modelId: "gen4.5",
      providerJobId: "task-runway-smoke",
      status: "submitted",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dev.runwayml.com/v1/image_to_video",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer key_runway_live",
          "X-Runway-Version": "2024-11-06",
        }),
      }),
    );
  });
});
