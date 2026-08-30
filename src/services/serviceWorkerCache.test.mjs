import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

/*
 * `public/sw.js` ships to the CDN verbatim as a classic worker script:
 * it has no exports and cannot be imported, so there is no module seam
 * to test through. This harness evaluates the real source — the exact
 * bytes that deploy — against stub globals, which is the only way to
 * assert on the caching guards themselves rather than on a copy of
 * them. `src/services/serviceWorkerRegistration.test.mjs` covers the
 * page-side registration seam.
 */
const SW_SOURCE_PATH = fileURLToPath(
  new URL("../../public/sw.js", import.meta.url)
);
const HEADERS_PATH = fileURLToPath(
  new URL("../../public/_headers", import.meta.url)
);
const ORIGIN = "https://aura.test";

const SHELL_V1 =
  '<!doctype html><html><head>' +
  '<link rel="stylesheet" href="/assets/index-V1.css">' +
  '<script type="module" src="/assets/index-V1.js"></script>' +
  "</head><body>v1</body></html>";
const SHELL_V2 =
  '<!doctype html><html><head>' +
  '<script type="module" src="/assets/index-V2.js"></script>' +
  "</head><body>v2</body></html>";

function respondWithHtml(body) {
  return () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
}

function respondWithJavascript(body) {
  return () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
}

function respondWithCss(body) {
  return () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/css; charset=utf-8" },
    });
}

function respondWithJson(body) {
  return () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "application/manifest+json" },
    });
}

function pathOf(requestOrUrl) {
  const raw =
    typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.url;
  const url = new URL(raw, ORIGIN);
  return `${url.pathname}${url.search}`;
}

function createCacheStorageStub(fetchImpl) {
  const stores = new Map();

  function createCache(name) {
    const entries = new Map();
    return {
      name,
      entries,
      async match(requestOrUrl) {
        return entries.get(pathOf(requestOrUrl)) ?? null;
      },
      async put(requestOrUrl, response) {
        entries.set(pathOf(requestOrUrl), response);
      },
      async add(url) {
        // Modelled faithfully so the harness stays fair to the
        // pre-fix worker, which reached the cache through add().
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new TypeError(`add failed for ${url}`);
        }
        entries.set(pathOf(url), response);
      },
      async addAll(urls) {
        const responses = await Promise.all(urls.map((url) => fetchImpl(url)));
        responses.forEach((response, index) => {
          // The real Cache API rejects addAll wholesale on a bad
          // response; the worker's fallback path depends on that.
          if (!response.ok) {
            throw new TypeError(`addAll failed for ${urls[index]}`);
          }
        });
        responses.forEach((response, index) => {
          entries.set(pathOf(urls[index]), response);
        });
      },
      async keys() {
        return [...entries.keys()].map((key) => ({ url: `${ORIGIN}${key}` }));
      },
      async delete(requestOrUrl) {
        return entries.delete(pathOf(requestOrUrl));
      },
    };
  }

  return {
    stores,
    caches: {
      async open(name) {
        if (!stores.has(name)) {
          stores.set(name, createCache(name));
        }
        return stores.get(name);
      },
      async keys() {
        return [...stores.keys()];
      },
      async delete(name) {
        return stores.delete(name);
      },
    },
  };
}

async function loadServiceWorker(routes) {
  const source = await readFile(SW_SOURCE_PATH, "utf8");
  const fetchCalls = [];

  const fetchImpl = async (requestOrUrl) => {
    const path = pathOf(requestOrUrl);
    fetchCalls.push(path);
    const route = routes[path];
    if (!route) {
      throw new TypeError(`stub fetch: no route for ${path}`);
    }
    return route();
  };

  const cacheStorage = createCacheStorageStub(fetchImpl);
  const listeners = new Map();
  const workerGlobal = {
    location: { origin: ORIGIN },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    skipWaiting() {},
    clients: {
      async claim() {},
      async matchAll() {
        return [];
      },
    },
    registration: { async showNotification() {} },
  };

  const evaluate = new Function("self", "caches", "fetch", source);
  evaluate(workerGlobal, cacheStorage.caches, fetchImpl);

  function findStore(suffix) {
    for (const [name, store] of cacheStorage.stores) {
      if (name.endsWith(suffix)) {
        return store;
      }
    }
    return null;
  }

  return {
    fetchCalls,
    appShell: () => findStore("-app-shell"),
    runtime: () => findStore("-runtime"),
    async install() {
      let pending = null;
      listeners.get("install")({
        waitUntil(promise) {
          pending = promise;
        },
      });
      await pending;
    },
    handleFetch(request) {
      let responsePromise = null;
      listeners.get("fetch")({
        request,
        respondWith(promise) {
          responsePromise = promise;
        },
      });
      return responsePromise;
    },
  };
}

function assetRequest(path, destination) {
  return {
    method: "GET",
    url: `${ORIGIN}${path}`,
    mode: "no-cors",
    destination,
  };
}

function navigationRequest(path = "/") {
  return {
    method: "GET",
    url: `${ORIGIN}${path}`,
    mode: "navigate",
    destination: "document",
  };
}

async function cachedText(store, path) {
  const response = store?.entries.get(path);
  return response ? await response.clone().text() : null;
}

describe("service worker asset-cache integrity", () => {
  test("refuses to cache the SPA shell under an /assets/*.js key", async () => {
    // Netlify's `/* /index.html 200` catch-all answers a purged hashed
    // chunk with the shell at HTTP 200 — status alone cannot tell them
    // apart, and nosniff makes a cached copy permanently unexecutable.
    const worker = await loadServiceWorker({
      "/assets/index-GONE.js": respondWithHtml(SHELL_V1),
    });

    const response = await worker.handleFetch(
      assetRequest("/assets/index-GONE.js", "script")
    );

    // The page still receives whatever the server said; only the write
    // is refused.
    assert.equal(await response.clone().text(), SHELL_V1);
    assert.equal(await cachedText(worker.runtime(), "/assets/index-GONE.js"), null);
  });

  test("refuses to cache the SPA shell under an /assets/*.css key", async () => {
    const worker = await loadServiceWorker({
      "/assets/index-GONE.css": respondWithHtml(SHELL_V1),
    });

    await worker.handleFetch(assetRequest("/assets/index-GONE.css", "style"));

    assert.equal(
      await cachedText(worker.runtime(), "/assets/index-GONE.css"),
      null
    );
  });

  test("still caches assets whose content-type matches the URL", async () => {
    const worker = await loadServiceWorker({
      "/assets/index-V1.js": respondWithJavascript("export const a = 1;"),
      "/assets/index-V1.css": respondWithCss(".a{color:red}"),
    });

    await worker.handleFetch(assetRequest("/assets/index-V1.js", "script"));
    await worker.handleFetch(assetRequest("/assets/index-V1.css", "style"));

    assert.equal(
      await cachedText(worker.runtime(), "/assets/index-V1.js"),
      "export const a = 1;"
    );
    assert.equal(
      await cachedText(worker.runtime(), "/assets/index-V1.css"),
      ".a{color:red}"
    );
  });

  test("precache walk skips a chunk that answers with HTML", async () => {
    const worker = await loadServiceWorker({
      "/": respondWithHtml(SHELL_V1),
      "/index.html": respondWithHtml(SHELL_V1),
      "/manifest.webmanifest": respondWithJson("{}"),
      "/assets/index-V1.css": respondWithCss(".a{color:red}"),
      "/assets/index-V1.js": respondWithHtml(SHELL_V1),
    });

    await worker.install();
    const shell = worker.appShell();

    assert.equal(await cachedText(shell, "/index.html"), SHELL_V1);
    assert.equal(await cachedText(shell, "/assets/index-V1.css"), ".a{color:red}");
    assert.equal(await cachedText(shell, "/assets/index-V1.js"), null);
  });

  test("precache walk still follows a healthy import graph", async () => {
    const worker = await loadServiceWorker({
      "/": respondWithHtml(SHELL_V1),
      "/index.html": respondWithHtml(SHELL_V1),
      "/manifest.webmanifest": respondWithJson("{}"),
      "/assets/index-V1.css": respondWithCss(".a{color:red}"),
      "/assets/index-V1.js": respondWithJavascript(
        'import("assets/lazy-V1.js");'
      ),
      "/assets/lazy-V1.js": respondWithJavascript("export const lazy = 1;"),
    });

    await worker.install();
    const shell = worker.appShell();

    assert.equal(
      await cachedText(shell, "/assets/index-V1.js"),
      'import("assets/lazy-V1.js");'
    );
    assert.equal(
      await cachedText(shell, "/assets/lazy-V1.js"),
      "export const lazy = 1;"
    );
  });
});

describe("service worker navigation shell persistence", () => {
  const installRoutes = () => ({
    "/": respondWithHtml(SHELL_V1),
    "/index.html": respondWithHtml(SHELL_V1),
    "/manifest.webmanifest": respondWithJson("{}"),
    "/assets/index-V1.css": respondWithCss(".a{color:red}"),
    "/assets/index-V1.js": respondWithJavascript("export const a = 1;"),
  });

  test("does not repaint an installed shell with a newer deploy's HTML", async () => {
    // The new HTML references /assets/index-V2.js, which this cache
    // generation has never seen. Storing it would leave an offline
    // launch booting a module graph that exists nowhere.
    const routes = installRoutes();
    const worker = await loadServiceWorker(routes);
    await worker.install();

    routes["/"] = respondWithHtml(SHELL_V2);
    const response = await worker.handleFetch(navigationRequest("/"));

    assert.equal(await response.clone().text(), SHELL_V2);
    assert.equal(await cachedText(worker.appShell(), "/"), SHELL_V1);
    assert.equal(await cachedText(worker.appShell(), "/index.html"), SHELL_V1);
  });

  test("still seeds a shell when the precache never landed one", async () => {
    const worker = await loadServiceWorker({
      "/": respondWithHtml(SHELL_V2),
    });

    await worker.handleFetch(navigationRequest("/"));

    assert.equal(await cachedText(worker.appShell(), "/"), SHELL_V2);
  });

  test("offline navigation still falls back to the cached shell", async () => {
    const routes = installRoutes();
    const worker = await loadServiceWorker(routes);
    await worker.install();

    delete routes["/"];
    delete routes["/index.html"];
    const response = await worker.handleFetch(navigationRequest("/"));

    assert.equal(await response.clone().text(), SHELL_V1);
  });
});

describe("deploy cache headers", () => {
  test("unversioned font files are not served as immutable", async () => {
    // public/fonts/Inter-Variable.woff2 carries no hash or version, so
    // `immutable` would make a replacement unreachable for a year.
    const headers = await readFile(HEADERS_PATH, "utf8");
    const fontBlock = headers.slice(headers.indexOf("/fonts/*"));
    const fontDirective = fontBlock
      .split("\n")
      .find((line) => line.includes("Cache-Control"));

    assert.ok(fontDirective, "expected a Cache-Control for /fonts/*");
    assert.ok(
      !fontDirective.includes("immutable"),
      `unversioned font path must not be immutable: ${fontDirective}`
    );
    assert.ok(
      headers.includes("/assets/*\n  Cache-Control: public, max-age=31536000, immutable"),
      "content-hashed assets should stay immutable"
    );
  });
});
