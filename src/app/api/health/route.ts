import { getConfig } from "@/lib/config";

export async function GET() {
  const config = getConfig();
  return Response.json({
    status: "ok",
    database: {
      configured: Boolean(config.DATABASE_URL),
      provider: "postgresql",
    },
    redis: {
      configured: Boolean(config.REDIS_URL),
    },
    storageRoot: config.STORAGE_ROOT,
  });
}
