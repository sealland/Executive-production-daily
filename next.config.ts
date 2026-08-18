import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server is shared over the LAN, so browsers reach it by IP instead of localhost.
  allowedDevOrigins: [
    "192.168.140.60",
    "192.168.140.53",
    "192.168.99.24",
    "192.168.140.*",
    "192.168.99.*"
  ]
};

export default nextConfig;
