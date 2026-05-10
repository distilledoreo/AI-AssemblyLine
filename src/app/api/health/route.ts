import { getAppHealthSnapshot } from "@/server/health";

export async function GET() {
  const snapshot = await getAppHealthSnapshot();
  return Response.json(snapshot, { status: snapshot.status === "ok" ? 200 : 503 });
}
