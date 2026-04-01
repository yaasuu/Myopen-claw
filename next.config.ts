import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["13.48.59.80", "localhost", "0.0.0.0"],
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
};

export default nextConfig;
