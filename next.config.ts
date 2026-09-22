import type { NextConfig } from "next";

// Dev server is shared over the LAN, so browsers reach it by IP instead of localhost.
// Comma-separated hosts/patterns in .env, e.g. ALLOWED_DEV_ORIGINS=192.168.1.10,192.168.1.*
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  async rewrites() {
    return [
      { source: "/executive-report", destination: "/executive-report/index.html" },
      { source: "/executive-report/", destination: "/executive-report/index.html" }
    ];
  }
};

export default nextConfig;
