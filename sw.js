/* Judy & Karma — service worker.
   v5 (2026-11-22): instant opens. Navigations are served from the
   cached shell immediately (stale-while-revalidate) and refreshed
   from the network in the background, so the app opens at once even
   on a very slow connection; new builds are announced by the in-app
   update banner (version.json, never cached) and applied on tap.
   On activate the worker still wipes old caches and force-reloads
   open windows once, into the freshly precached shell. */
var CACHE = "judy-karma-v5";
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
    }).then(function () { return self.clients.claim(); }).then(function () {
      // Self-healing: push every open window into the fresh shell once.
      return self.clients.matchAll({ type: "window" }).then(function (list) {
        return Promise.all(list.map(function (c) {
          try {
            if (typeof c.navigate !== "function") return null;
            var u = new URL(c.url);
            u.searchParams.set("u", "2026.11.22-5");
            return c.navigate(u.toString()).catch(function () {});
          } catch (err) { return null; }
        }));
      });
    })
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
  // Documents: instant from cache, refreshed in the background.
  if (e.request.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html", { ignoreSearch: true }).then(function (cached) {
        var network = fetch(url, { cache: "no-store", credentials: "same-origin" }).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
          return res;
        });
        if (cached) {
          // Background refresh; errors are fine, the cache stays.
          network.catch(function () {});
          return cached;
        }
        return network.catch(function () {
          return caches.match("./", { ignoreSearch: true });
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
