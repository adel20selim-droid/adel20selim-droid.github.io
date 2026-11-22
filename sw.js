/* Judy & Karma — service worker.
   Keeps the app opening offline and enables a real "Install" on
   Android. Network-first: updates arrive whenever there is a
   connection; the cache is only a fallback for offline opens.
   v2 (2026-11-22): cache name bumped so every device drops the old
   shell; document navigations are fetched with cache:"no-store" so a
   new build can never stick behind an HTTP-cached page; version.json
   (the in-app update check) is never cached. */
var CACHE = "judy-karma-v2";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // One by one: a file that is missing (e.g. an icon that has not
      // been uploaded yet) must not fail the whole install.
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = e.request.url;
  // The update check must always hit the network and never be cached.
  if (url.indexOf("version.json") !== -1) {
    e.respondWith(fetch(e.request, { cache: "no-store" }).catch(function () {
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    }));
    return;
  }
  // Documents: network-first, bypassing the HTTP cache entirely, so a
  // freshly published build lands on the next open. Cache is only the
  // offline fallback.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(url, { cache: "no-store", credentials: "same-origin" }).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html", { ignoreSearch: true }).then(function (m) {
          return m || caches.match("./", { ignoreSearch: true });
        });
      })
    );
    return;
  }
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (m) {
        return m || caches.match("./index.html");
      });
    })
  );
});
