import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingExcludes: {
    "*": ["./storage/**"],
  },
};

export default nextConfig;
