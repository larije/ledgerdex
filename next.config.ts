import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@prisma/client", "exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  outputFileTracingExcludes: {
    "*": ["./next.config.ts"],
  },
};

export default nextConfig;
