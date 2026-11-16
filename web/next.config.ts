import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// .env dùng chung nằm ở gốc dự án (crawler + web).
loadEnvConfig(path.resolve(process.cwd(), ".."));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
