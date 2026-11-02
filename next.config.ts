import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";

// Local secrets live in env/ rather than the project root.
loadEnvConfig(path.join(process.cwd(), "env"));

const nextConfig: NextConfig = {};

export default nextConfig;
