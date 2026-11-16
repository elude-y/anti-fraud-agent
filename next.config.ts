import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  // dev 模式用 http://127.0.0.1:3000 访问时，HMR WebSocket 的 Origin 校验会拒绝握手导致不水合
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
