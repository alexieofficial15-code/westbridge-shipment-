import type { NextConfig } from "next";

// The browser always calls the relative path /api/... so the same code works everywhere:
// - Local development: the rewrite below forwards /api to the backend on port 4000.
// - Docker / production: the load balancer routes /api to the backend pool before
//   the request ever reaches Next.js.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Small self-contained server build, used by the Dockerfile.
  output: "standalone",
  // Pin the project root to this folder (there is another lockfile higher up in D:\PROJECT).
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  // Development only: let phones and other devices on the home/office network open the dev
  // server (e.g. http://192.168.1.165:3000). Has no effect on the live site.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiTarget}/api/:path*` }];
  },
};

export default nextConfig;
