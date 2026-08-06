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
  // serverExternalPackages alone wasn't enough (confirmed live: the same
  // "cannot open shared object file" error persisted after adding it) —
  // Vercel's own file-tracing step, which decides what actually ships in
  // the deployed function, is separate from Next's bundling step and still
  // wasn't picking up onnxruntime-node's native .so files since they're
  // dlopen'd at runtime rather than referenced by a traceable require().
  // Both routes below call retrieve() against the RAG corpora.
  outputFileTracingIncludes: {
    "/api/anchor": ["./node_modules/onnxruntime-node/bin/napi-v6/linux/**/*"],
    "/api/humangate/deny-check": ["./node_modules/onnxruntime-node/bin/napi-v6/linux/**/*"],
  },
};

export default nextConfig;
