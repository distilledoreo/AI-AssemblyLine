import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { sessionCookieName } from "@/shared/session";
import {
  getUserById,
  getOptionalSessionUser,
  requireSessionUser,
} from "@/server/repository";

export async function getSessionTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(sessionCookieName)?.value;
}

export async function getCurrentUser() {
  const token = await getSessionTokenFromCookies();
  const localUser = await getOptionalSessionUser(token);
  if (localUser) {
    return localUser;
  }
  return getNextAuthSessionUser();
}

export async function requireCurrentUser() {
  const token = await getSessionTokenFromCookies();
  const localUser = await getOptionalSessionUser(token);
  if (localUser) {
    return localUser;
  }
  const authUser = await getNextAuthSessionUser();
  if (authUser) {
    return authUser;
  }
  return requireSessionUser(undefined);
}

async function getNextAuthSessionUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user && "id" in session.user ? String(session.user.id) : undefined;
  return getUserById(userId);
}
