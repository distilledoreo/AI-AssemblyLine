import { cookies } from "next/headers";
import { sessionCookieName } from "@/shared/session";
import {
  getOptionalSessionUser,
  requireSessionUser,
} from "@/server/repository";

export async function getSessionTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(sessionCookieName)?.value;
}

export async function getCurrentUser() {
  const token = await getSessionTokenFromCookies();
  return getOptionalSessionUser(token);
}

export async function requireCurrentUser() {
  const token = await getSessionTokenFromCookies();
  return requireSessionUser(token);
}
