import { getQueueHealthSnapshot } from "@/server/queue";

export async function GET() {
  const queues = await getQueueHealthSnapshot();
  const degraded = queues.some((queue) => queue.healthError);
  return Response.json({
    status: degraded ? "degraded" : "ok",
    queues,
  }, { status: degraded ? 503 : 200 });
}
