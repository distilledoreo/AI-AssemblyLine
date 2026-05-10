import {
  formatHeartbeat,
  formatSseEvent,
  subscribeToProjectEvents,
} from "@/server/queue";
import { getProjectRole, listProjectEvents } from "@/server/repository";
import { assertProjectPermission } from "@/server/rbac";
import { requireCurrentUser } from "@/server/session";
import { toErrorResponse } from "@/server/errors";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { projectId } = await context.params;
    assertProjectPermission(await getProjectRole(user.id, projectId), "view_project_dashboard");

    const encoder = new TextEncoder();
    const lastEventId = request.headers.get("last-event-id") ?? undefined;

    const stream = new ReadableStream({
      start(controller) {
        const send = (payload: string) => controller.enqueue(encoder.encode(payload));
        listProjectEvents(projectId, lastEventId).forEach((event) => send(formatSseEvent(event)));
        send(`event: connected\ndata: ${JSON.stringify({ projectId })}\n\n`);

        const unsubscribe = subscribeToProjectEvents(projectId, (event) => send(formatSseEvent(event)));
        const heartbeat = setInterval(() => send(formatHeartbeat()), 30000);
        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
