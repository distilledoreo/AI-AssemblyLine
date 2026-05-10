import { getQueueHealthSnapshot } from "@/server/queue";

export async function GET() {
  return Response.json({
    status: "ok",
    queues: await getQueueHealthSnapshot(),
  });
}
