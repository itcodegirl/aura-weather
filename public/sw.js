// Bump the version when the static APP_SHELL_URLS list changes so
// existing installs evict the previous shell on next activation.
// v3 adds best-effort precache (atomic addAll → per-URL add) so a
// single missing asset can no longer break offline install.
const CACHE_VERSION = "aura-weather-v4";
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
// CRITICAL_APP_SHELL_URLS must succeed for offline to be useful — if
// any of these fail to cache the install still completes, but the
// navigation fallback flow will not have an index document. The other
// URLs are convenience: a missing apple-touch-icon or og-image should
// not break offline launch.
const CRITICAL_APP_SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest"];
const OPTIONAL_APP_SHELL_URLS = [
  "/favicon.svg",
  "/atmosphere-ring.svg",
  "/apple-touch-icon.png",
  "/og-image.png",
  "/fonts/manrope-v20-latin.woff2",
  "/fonts/manrope-v20-latin-ext.woff2",
  "/fonts/space-grotesk-v22-latin.woff2",
  "/fonts/space-grotesk-v22-latin-ext.woff2",
];
const RUNTIME_CACHE_MAX_ENTRIES = 80;
const CACHEABLE_DESTINATIONS = new Set([
  "document",
  "font",
  "image",
  "manifest",
  "script",
  "style",
  "worker",
]);
const INDEX_ASSET_PATTERN = /\b(?:href|src)="([^"]+)"/g;
const BUILD_ASSET_PATTERN = /["'](assets\/[^"']+\.(?:css|js))["']/g;

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isBuildAssetRequest(requestUrl) {
  return isSameOrigin(requestUrl) && requestUrl.pathname.startsWith("/assets/");
}

function isCacheableRequest(request) {
  if (request.method !== "GET") {
    return false;
  }

  const requestUrl = new URL(request.url);
  return (
    isBuildAssetRequest(requestUrl) ||
    (isSameOrigin(requestUrl) && CACHEABLE_DESTINATIONS.has(request.destination))
  );
}

function getSameOriginAppAsset(path) {
  try {
    const assetUrl = new URL(path, self.location.origin);
    if (!isSameOrigin(assetUrl) || !assetUrl.pathname.startsWith("/assets/")) {
      return null;
    }

    return `${assetUrl.pathname}${assetUrl.search}`;
  } catch {
    return null;
  }
}

function findIndexAssetUrls(indexHtml) {
  return [
    ...new Set(
      Array.from(indexHtml.matchAll(INDEX_ASSET_PATTERN), (match) =>
        getSameOriginAppAsset(match[1])
      ).filter(Boolean)
    ),
  ];
}

function findBuildAssetUrls(javascript) {
  return Array.from(javascript.matchAll(BUILD_ASSET_PATTERN), (match) =>
    getSameOriginAppAsset(`/${match[1]}`)
  ).filter(Boolean);
}

async function cacheResponse(cacheName, request, response) {
  if (!response || response.status >= 400) {
    return;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
}

async function trimCache(cacheName, maxEntries) {
  if (!Number.isFinite(maxEntries) || maxEntries <= 0) {
    return;
  }
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) {
    return;
  }
  // Drop oldest first (cache.keys() returns insertion order in
  // Chromium/WebKit). Keep this bounded so a long-lived install does
  // not accumulate stale runtime entries indefinitely.
  const overflow = keys.length - maxEntries;
  for (let index = 0; index < overflow; index += 1) {
    await cache.delete(keys[index]);
  }
}

async function bestEffortCacheAdd(cache, url) {
  try {
    await cache.add(url);
    return true;
  } catch {
    // A single missing asset must not abort the install. Offline
    // launch still works as long as the critical shell URLs landed.
    return false;
  }
}

async function matchCachedRequest(cache, request) {
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const requestUrl = new URL(request.url);
  if (!isSameOrigin(requestUrl)) {
    return null;
  }

  return (
    (await cache.match(`${requestUrl.pathname}${requestUrl.search}`)) ||
    (await cache.match(requestUrl.pathname)) ||
    null
  );
}

async function readAssetText(cache, assetUrl) {
  const response = (await cache.match(assetUrl)) || (await fetch(assetUrl));
  if (!response || !response.ok) {
    return "";
  }

  await cache.put(assetUrl, response.clone());
  return response.clone().text();
}

async function findBuildDependencies(cache, entryAssetUrls) {
  const discoveredAssetUrls = new Set();
  const visitedJavascriptUrls = new Set();
  const pendingJavascriptUrls = entryAssetUrls.filter((assetUrl) =>
    assetUrl.endsWith(".js")
  );

  while (pendingJavascriptUrls.length > 0) {
    const javascriptUrl = pendingJavascriptUrls.pop();
    if (visitedJavascriptUrls.has(javascriptUrl)) {
      continue;
    }

    visitedJavascriptUrls.add(javascriptUrl);
    const javascript = await readAssetText(cache, javascriptUrl);
    for (const assetUrl of findBuildAssetUrls(javascript)) {
      if (discoveredAssetUrls.has(assetUrl)) {
        continue;
      }

      discoveredAssetUrls.add(assetUrl);
      if (assetUrl.endsWith(".js")) {
        pendingJavascriptUrls.push(assetUrl);
      }
    }
  }

  return [...discoveredAssetUrls];
}

// How long a navigation waits on the network before the cached shell
// takes over. Healthy connections answer well inside this window; on
// lie-fi the fetch can hang for 30s+ before the browser gives up,
// which reads as "the app is broken" when a fully cached shell was
// sitting right there.
const NAVIGATION_NETWORK_TIMEOUT_MS = 3500;

async function getCachedNavigationFallback(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const requestPath = new URL(request.url).pathname;
  return (
    (await matchCachedRequest(cache, request)) ||
    (await cache.match(requestPath)) ||
    (await cache.match("/")) ||
    (await cache.match("/index.html")) ||
    null
  );
}

async function networkFirstNavigation(request) {
  const networkPromise = (async () => {
    const response = await fetch(request);
    await Promise.all([
      cacheResponse(APP_SHELL_CACHE, request, response),
      cacheResponse(APP_SHELL_CACHE, "/", response),
    ]);
    return response;
  })();

  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), NAVIGATION_NETWORK_TIMEOUT_MS);
  });

  try {
    const networkResponse = await Promise.race([
      // A fast rejection (e.g. airplane mode) should fall through to
      // the cache immediately rather than waiting out the timeout.
      networkPromise.catch(() => null),
      timeoutPromise,
    ]);
    if (networkResponse) {
      return networkResponse;
    }

    const cachedResponse = await getCachedNavigationFallback(request);
    if (cachedResponse) {
      // The slow network fetch keeps running and settles into the
      // cache for next time; swallow its eventual rejection so it
      // never surfaces as an unhandled-rejection console error.
      networkPromise.catch(() => {});
      return cachedResponse;
    }

    // Nothing cached (first visit, or the cache was evicted): the
    // slow network response is still the best answer available.
    return await networkPromise;
  } catch {
    return (await getCachedNavigationFallback(request)) || Response.error();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function staleWhileRevalidate(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const appShellCache = await caches.open(APP_SHELL_CACHE);
  const cachedResponse =
    (await matchCachedRequest(runtimeCache, request)) ||
    (await matchCachedRequest(appShellCache, request));
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        void runtimeCache.put(request, response.clone());
        // Trim asynchronously so we never block the response. The
        // ceiling keeps the runtime cache bounded over time.
        void trimCache(RUNTIME_CACHE, RUNTIME_CACHE_MAX_ENTRIES);
      }
      return response;
    })
    .catch(() => cachedResponse || Response.error());

  return cachedResponse || fetchPromise;
}

async function cacheAppShell() {
  const cache = await caches.open(APP_SHELL_CACHE);

  // Critical URLs go through addAll so a failure surfaces the install
  // problem in the SW console; without an index document offline mode
  // is meaningless.
  try {
    await cache.addAll(CRITICAL_APP_SHELL_URLS);
  } catch {
    // Fall back to per-URL adds so we still cache whatever we can
    // — a single bad response should not block the rest of the
    // install lifecycle.
    for (const url of CRITICAL_APP_SHELL_URLS) {
      await bestEffortCacheAdd(cache, url);
    }
  }

  // Optional URLs (icons, og-image) are best-effort. A missing or
  // renamed icon must not break offline support.
  await Promise.all(
    OPTIONAL_APP_SHELL_URLS.map((url) => bestEffortCacheAdd(cache, url))
  );

  const indexResponse =
    (await cache.match("/index.html")) ||
    (await cache.match("/")) ||
    (await fetch("/index.html").catch(() => null));
  if (!indexResponse) {
    // No index document anywhere — the dependency walk has nothing
    // to follow. The install still completes; the runtime cache will
    // pick up assets on first online navigation.
    return;
  }
  const indexHtml = await indexResponse.clone().text();
  const assetUrls = findIndexAssetUrls(indexHtml);
  const dependencyUrls = await findBuildDependencies(cache, assetUrls);
  const urlsToCache = [...new Set([...assetUrls, ...dependencyUrls])];

  // Per-URL best-effort: missing chunks (e.g. a stale hashed name in
  // an older deployment) should not abort the precache walk.
  await Promise.all(
    urlsToCache.map((url) => bestEffortCacheAdd(cache, url))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => !cacheName.startsWith(CACHE_VERSION))
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableRequest(request)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
