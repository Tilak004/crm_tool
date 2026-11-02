import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Room for uploading the GST portal's HSN directory (~0.7 MB).
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
