import { getCurrentUser } from "@/server/session";

export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ user: user ?? null });
}
