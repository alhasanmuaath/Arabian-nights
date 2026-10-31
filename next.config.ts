import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page is personal to the logged-in user, so render on each request
  // and never cache one person's page for another.
  cacheComponents: false,
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
