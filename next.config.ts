import type { NextConfig } from "next";

// Cache Components is intentionally OFF: almost every page in this app is per-user and
// permission-checked, so pages render dynamically per request (PROJECT_SCOPE.md §3.3).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Safe defaults for every page: no framing (clickjacking), no content sniffing, HTTPS only, minimal referrer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
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
