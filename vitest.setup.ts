import { Buffer } from "node:buffer";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/assemblyline_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.NEXTAUTH_SECRET ??= "test-secret-that-is-long-enough-for-nextauth";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.STORAGE_ROOT ??= "./test-storage";
