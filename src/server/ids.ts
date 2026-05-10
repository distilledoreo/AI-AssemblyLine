import { randomUUID } from "node:crypto";

export function createId() {
  return randomUUID();
}

export function createShortId() {
  return randomUUID().replaceAll("-", "");
}

export function nowIso() {
  return new Date().toISOString();
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
