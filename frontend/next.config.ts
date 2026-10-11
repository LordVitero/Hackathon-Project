import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // CPU inference may exceed Next.js default 30-second proxy timeout.
  experimental: { proxyTimeout: 180000, proxyClientMaxBodySize: "26mb" },
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/:path*" }];
  },
  // Allow the computer's Wi-Fi hostname/IP when testing from a phone.
  allowedDevOrigins: process.env.LENNY_DEV_ALLOWED_ORIGINS?.split(",").map(host => host.trim()).filter(Boolean),
};
export default config;
