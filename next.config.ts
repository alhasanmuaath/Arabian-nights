import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page is personal to the logged-in user, so render on each request
  // and never cache one person's page for another.
  cacheComponents: false,
  experimental: {
    // The main sections are prefetched in full (see Nav), and a visited page is
    // kept for a short time, so tapping a section shows it at once. Anything
    // you save clears these copies; other people's changes appear within 30 s.
    staleTimes: { dynamic: 30, static: 30 },
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
