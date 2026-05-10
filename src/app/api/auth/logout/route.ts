import { cookies } from "next/headers";
import { sessionCookieName } from "@/shared/session";
import { signOutSession } from "@/server/repository";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  await signOutSession(token);
  cookieStore.delete(sessionCookieName);
  return Response.json({ ok: true });
}
