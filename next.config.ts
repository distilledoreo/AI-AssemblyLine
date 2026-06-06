import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.googleusercontent.com", "*.colab.googleusercontent.com"],
  reactStrictMode: true,
  outputFileTracingExcludes: {
    "*": ["./storage/**"],
  },
};

export default nextConfig;
