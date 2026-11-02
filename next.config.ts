import type { NextConfig } from "next";

// Single-player build: everything runs in the browser, so export plain static files.
const nextConfig: NextConfig = { output: "export" };

export default nextConfig;
