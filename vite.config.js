import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
 * Stamps the built service worker with a version derived from the build's
 * own output.
 *
 * public/sw.js is copied verbatim, and CACHE_VERSION was a hand-edited
 * constant — bumped three times in ~200 commits. Browsers decide whether to
 * install a new worker by byte-comparing sw.js, so across almost every
 * deploy the file was identical: install never re-ran, activate never
 * evicted the old shell, and — because the "New version available" prompt is
 * driven by an updatefound/waiting worker — that banner could never fire. A
 * long-lived tab or installed PWA could sit on stale JS indefinitely.
 *
 * The version is a hash of the emitted asset filenames, which are
 * content-hashed by Rollup. Identical output therefore produces an identical
 * worker (no spurious update prompts), while any real code change produces a
 * new one. Caveat: a change confined to an unhashed public/ asset will not
 * move the hash.
 */
function serviceWorkerVersion() {
  return {
    name: "aura-service-worker-version",
    apply: "build",
    writeBundle(options, bundle) {
      const outDir = options.dir;
      if (!outDir) return;
      const swPath = join(outDir, "sw.js");
      if (!existsSync(swPath)) return;

      const fingerprint = Object.keys(bundle).sort().join("|");
      const hash = createHash("sha256")
        .update(fingerprint)
        .digest("hex")
        .slice(0, 12);

      const source = readFileSync(swPath, "utf8");
      const stamped = source.replace(
        /const CACHE_VERSION = "[^"]*";/,
        `const CACHE_VERSION = "aura-weather-${hash}";`
      );
      if (stamped === source) {
        this.warn(
          "sw.js: CACHE_VERSION not found; the worker will not update across deploys"
        );
        return;
      }
      writeFileSync(swPath, stamped);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerVersion()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    hmr: false,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split the rarely-changing dependencies into their own
        // long-cache chunks. A deploy that only touches app code then
        // re-downloads just the app bundle; React, the scheduler, and
        // the icon set keep their content hashes (and the browser's
        // cache entry).
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "react-vendor";
          }
          if (id.includes("node_modules/lucide-react/")) {
            return "lucide";
          }
          return undefined;
        },
      },
    },
  },
});
