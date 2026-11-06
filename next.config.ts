import type { NextConfig } from "next";

// Cache Components is intentionally OFF: almost every page in this app is per-user and
// permission-checked, so pages render dynamically per request (PROJECT_SCOPE.md §3.3).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
