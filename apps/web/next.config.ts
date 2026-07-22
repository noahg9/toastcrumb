import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing the shared workspace package without pre-compilation.
  transpilePackages: ["@toastcrumb/types"],
  // Explicitly trace content files into serverless bundles — dynamic readFile/readdir
  // paths aren't statically analyzable by nft. prebuild copies /content here first.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
