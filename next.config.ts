import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.24", "192.168.1.8"],
  env: {
    NEXT_PUBLIC_DEPLOYED_AT: new Date().toISOString(),
  },
};

export default nextConfig;
