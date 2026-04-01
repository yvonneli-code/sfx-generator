import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
  experimental: {
    proxyTimeout: 120_000, // 2 minutes — Gemini analysis can take 30-60s
  },
};

export default nextConfig;
