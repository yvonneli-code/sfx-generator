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
    proxyTimeout: 600_000, // 10 minutes — SFX generation with quality gate retries can be slow
  },
};

export default nextConfig;
