// Module loader hook used by `npm run test:render` to give node:test
// the two affordances Vite normally provides during dev:
//   1. CSS imports become an empty module so React components can
//      import their stylesheets without crashing the test runner.
//   2. .jsx files are transformed to plain ESM JavaScript via esbuild
//      (already a transitive dep through Vite). The transform runs
//      in-memory; nothing is written to disk.

import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const EXTENSIONLESS_RESOLVE_CANDIDATES = [".js", ".jsx", ".mjs", "/index.js", "/index.jsx"];

async function fileExists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  // Vite resolves bare relative imports without an extension. node:test
  // does not, so try common JS/JSX extensions before giving up.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[a-z]+$/i.test(specifier)
  ) {
    const parentURL = context.parentURL ? new URL(context.parentURL) : null;
    if (parentURL) {
      for (const candidate of EXTENSIONLESS_RESOLVE_CANDIDATES) {
        const candidateUrl = new URL(specifier + candidate, parentURL);
        if (await fileExists(fileURLToPath(candidateUrl))) {
          return nextResolve(specifier + candidate, context);
        }
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default {};",
    };
  }

  if (url.endsWith(".jsx")) {
    const filePath = fileURLToPath(url);
    const source = await readFile(filePath, "utf8");
    const result = await transform(source, {
      loader: "jsx",
      format: "esm",
      jsx: "automatic",
      target: "es2022",
      sourcefile: filePath,
    });
    return {
      format: "module",
      shortCircuit: true,
      source: result.code,
    };
  }

  return nextLoad(url, context);
}
