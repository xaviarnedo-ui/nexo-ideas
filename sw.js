var CACHE = "nexo-ideas-v3";
// Todo el esqueleto de la app: si falta un solo .js, offline no arranca.
// Mantener en sync con los <script> de index.html (incluido el ?v=N).
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=3",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./supabase-js.min.js?v=3",
  "./supabase-client.js?v=3",
  "./db.js?v=3",
  "./state.js?v=3",
  "./auth-gate.js?v=3",
  "./capture.js?v=3",
  "./board.js?v=3",
  "./detail.js?v=3",
  "./map.js?v=3",
  "./settings.js?v=3",
  "./app.js?v=3"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
