import { afterEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/errors";

const routeMocks = vi.hoisted(() => ({
  formatHeartbeat: vi.fn(() => "event: heartbeat\ndata: {}\n\n"),
  formatSseError: vi.fn((error: unknown) => `event: stream_error\ndata: ${JSON.stringify({ message: String(error) })}\n\n`),
  formatSseEvent: vi.fn((event: { id: string; eventType: string }) => `id: ${event.id}\nevent: ${event.eventType}\ndata: {}\n\n`),
  getProjectRole: vi.fn(),
  listProjectEvents: vi.fn(),
  requireCurrentUser: vi.fn(),
  subscribeToProjectEvents: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/server/queue", () => ({
  formatHeartbeat: routeMocks.formatHeartbeat,
  formatSseError: routeMocks.formatSseError,
  formatSseEvent: routeMocks.formatSseEvent,
  subscribeToProjectEvents: routeMocks.subscribeToProjectEvents,
}));

vi.mock("@/server/repository", () => ({
  getProjectRole: routeMocks.getProjectRole,
  listProjectEvents: routeMocks.listProjectEvents,
}));

vi.mock("@/server/session", () => ({ requireCurrentUser: routeMocks.requireCurrentUser }));

const context = { params: Promise.resolve({ projectId: "33333333-3333-4333-8333-333333333333" }) };

function eventRequest(signal?: AbortSignal) {
  return new Request("http://localhost/api/projects/33333333-3333-4333-8333-333333333333/events", {
    headers: { "last-event-id": "event-1" },
    signal,
  });
}

describe("project event stream route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    routeMocks.unsubscribe.mockReset();
  });

  it("authorizes the viewer and replays persisted events before subscribing", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "viewer-1" });
    routeMocks.getProjectRole.mockResolvedValue("viewer");
    routeMocks.listProjectEvents.mockResolvedValue([
      {
        id: "event-2",
        projectId: "33333333-3333-4333-8333-333333333333",
        jobId: "job-1",
        eventType: "progress",
        createdAt: "2026-05-11T18:00:00.000Z",
      },
    ]);
    routeMocks.subscribeToProjectEvents.mockReturnValue(routeMocks.unsubscribe);

    const abort = new AbortController();
    const { GET } = await import("@/app/api/projects/[projectId]/events/route");
    const response = await GET(eventRequest(abort.signal), context);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected SSE response body.");

    const decoder = new TextDecoder();
    let payload = "";
    while (!payload.includes("event: connected")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      payload += decoder.decode(chunk.value, { stream: true });
    }
    abort.abort();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(payload).toContain("id: event-2");
    expect(payload).toContain("event: connected");
    expect(routeMocks.listProjectEvents).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333", "event-1");
    expect(routeMocks.subscribeToProjectEvents).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      expect.any(Function),
      expect.any(Function),
    );
    expect(routeMocks.unsubscribe).toHaveBeenCalled();
  });

  it("rejects users without project view permission before opening the stream", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "outsider-1" });
    routeMocks.getProjectRole.mockResolvedValue(undefined);
    routeMocks.listProjectEvents.mockRejectedValue(new ForbiddenError("Should not replay events."));

    const { GET } = await import("@/app/api/projects/[projectId]/events/route");
    const response = await GET(eventRequest(), context);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(routeMocks.listProjectEvents).not.toHaveBeenCalled();
    expect(routeMocks.subscribeToProjectEvents).not.toHaveBeenCalled();
  });
});
