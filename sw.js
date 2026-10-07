// Service worker: red primero (festivos siempre frescos) y caché como respaldo sin conexión.
const V = "vacgc-v1";
const SHELL = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "icon.svg",
  "lib/util.mjs", "lib/festivos.mjs", "lib/motor.mjs", "lib/ics.mjs",
  "data/festivos.json", "data/manual.json", "data/cambios.json", "data/salud.json"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((x) => x.put(r, c)); } return res; }).catch(() => caches.match(r).then((m) => m || caches.match("index.html"))));
});
