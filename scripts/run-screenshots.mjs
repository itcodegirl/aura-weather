import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const previewPort = "45173";

const viteCli = resolve(projectRoot, "node_modules", "vite", "bin", "vite.js");
const playwrightCli = resolve(
  projectRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js"
);

function runNodeCli(cliPath, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(child);
        return;
      }
      rejectPromise(new Error(`${cliPath} exited with code ${code ?? 1}`));
    });
  });
}

function startPreviewServer() {
  return spawn(
    process.execPath,
    [
      viteCli,
      "preview",
      "--configLoader",
      "runner",
      "--host",
      "127.0.0.1",
      "--port",
      previewPort,
      "--strictPort",
    ],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    }
  );
}

async function waitForPreview(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the preview server is ready.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`Preview server did not become ready within ${timeoutMs}ms.`);
}

function stopPreviewServer(previewProcess) {
  if (!previewProcess || previewProcess.killed) {
    return;
  }

  previewProcess.kill();
}

async function main() {
  let previewProcess = null;

  try {
    await runNodeCli(viteCli, ["build", "--configLoader", "runner"]);

    previewProcess = startPreviewServer();
    previewProcess.on("error", (error) => {
      throw error;
    });

    await waitForPreview(`http://127.0.0.1:${previewPort}/`);

    const env = {
      ...process.env,
      PLAYWRIGHT_PREVIEW_PORT: previewPort,
      PLAYWRIGHT_SKIP_WEBSERVER: "1",
    };

    await runNodeCli(
      playwrightCli,
      [
        "test",
        "e2e/readme-screenshots.spec.js",
        "e2e/trust-contract-screenshot.spec.js",
        "e2e/social-pwa-assets.spec.js",
      ],
      { env }
    );
  } finally {
    stopPreviewServer(previewProcess);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
