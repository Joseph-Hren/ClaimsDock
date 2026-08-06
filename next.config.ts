import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @huggingface/transformers loads onnxruntime-node's native shared library
  // (libonnxruntime.so.1) dynamically at runtime, not via a static import —
  // Next.js's automatic file tracing doesn't reliably catch that, so the
  // .so file gets left out of the deployed serverless bundle (found live on
  // Vercel 2026-08-06: "cannot open shared object file"). Marking these as
  // external packages tells Next.js to ship them whole, native binaries
  // included, instead of tracing/bundling them.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
};

export default nextConfig;
