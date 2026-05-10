import { cookies } from "next/headers";
import { z } from "zod";
import { toErrorResponse } from "@/server/errors";
import { sessionCookieName } from "@/shared/session";
import { signInWithCredentials } from "@/server/repository";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  name: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const { user, session } = await signInWithCredentials(body);
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(session.expiresAt),
      path: "/",
    });
    return Response.json({ user });
  } catch (error) {
    return toErrorResponse(error);
  }
}
