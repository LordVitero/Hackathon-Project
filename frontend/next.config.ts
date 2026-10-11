import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Allow the computer's Wi-Fi hostname/IP when testing from a phone.
  allowedDevOrigins: process.env.LENNY_DEV_ALLOWED_ORIGINS?.split(",").map(host => host.trim()).filter(Boolean),
};
export default config;
