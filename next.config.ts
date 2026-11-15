import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  // 关闭会导致 dev 模式页面不水合（HMR WebSocket 握手失败）的实验项：
  // instantInsights / cacheComponents / partialPrefetching
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
