import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dukascopy's Node package has optional dynamic requires in its validator.
  // Keep it external to the Next.js server bundle and load it in the Node runtime.
  serverExternalPackages: ["dukascopy-node"],
};

export default nextConfig;
