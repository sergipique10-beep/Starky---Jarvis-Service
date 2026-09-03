import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['puppeteer', 'node-ssh'],
};

export default nextConfig;
