import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

const JSX_EXTENSIONS = new Set([".jsx", ".tsx"]);
const STUBBED_EXTENSIONS = new Set([
  ".css",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
]);
const RESOLVE_EXTENSIONS = [".js", ".mjs", ".jsx", ".ts", ".tsx", ".cjs"];

function getExtension(url) {
  const path = url.toString();
  const queryIndex = path.indexOf("?");
  const cleanPath = queryIndex >= 0 ? path.slice(0, queryIndex) : path;
  const lastDot = cleanPath.lastIndexOf(".");
  const lastSlash = cleanPath.lastIndexOf("/");
  if (lastDot < lastSlash) return "";
  return lastDot >= 0 ? cleanPath.slice(lastDot).toLowerCase() : "";
}

async function tryStat(filePath) {
  try {
    const stats = await stat(filePath);
    return stats;
  } catch {
    return null;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !getExtension(specifier)) {
    const parentPath = context?.parentURL
      ? fileURLToPath(context.parentURL)
      : null;
    if (parentPath) {
      const parentDir = parentPath.replace(/\/[^/]*$/, "/");
      for (const ext of RESOLVE_EXTENSIONS) {
        const candidate = `${parentDir}${specifier}${ext}`;
        if (await tryStat(candidate)) {
          return {
            url: pathToFileURL(candidate).href,
            shortCircuit: true,
            format: ext === ".cjs" ? "commonjs" : "module",
          };
        }
      }
      const indexBase = `${parentDir}${specifier}/index`;
      for (const ext of RESOLVE_EXTENSIONS) {
        const candidate = `${indexBase}${ext}`;
        if (await tryStat(candidate)) {
          return {
            url: pathToFileURL(candidate).href,
            shortCircuit: true,
            format: ext === ".cjs" ? "commonjs" : "module",
          };
        }
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const ext = getExtension(url);

  if (STUBBED_EXTENSIONS.has(ext)) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default {};",
    };
  }

  if (!JSX_EXTENSIONS.has(ext)) {
    return nextLoad(url, context);
  }

  const filePath = fileURLToPath(url);
  const sourceText = await readFile(filePath, "utf8");
  const { code } = await transform(sourceText, {
    loader: ext === ".tsx" ? "tsx" : "jsx",
    format: "esm",
    sourcefile: filePath,
    sourcemap: "inline",
    target: "node20",
    jsx: "automatic",
  });

  return {
    format: "module",
    shortCircuit: true,
    source: code,
  };
}
