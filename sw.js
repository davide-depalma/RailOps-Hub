/* RailOps Hub – service worker
   - La pagina viene sempre scaricata dalla rete quando c'è connessione (così gli aggiornamenti arrivano subito);
     senza connessione si apre l'ultima versione salvata.
   - I dati (Supabase) NON passano da qui: restano sempre in tempo reale.
   Quando si pubblica una nuova versione basta cambiare CACHE_VERSION. */
const CACHE_VERSION = "railops-v55.5";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js";
const SHELL = [
  "./",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
  "./favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(SHELL);
    try { await cache.add(new Request(SUPABASE_JS, { mode: "cors" })); } catch (e) { /* verrà salvata al primo utilizzo */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("railops-") && k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Pagina dell'app: prima la rete, poi la copia salvata
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        // "no-cache": chiede sempre al sito se c'è una versione nuova (senza aspettare la cache del browser)
        const fresh = await fetch(request.url, { cache: "no-cache", credentials: "same-origin" });
        if (fresh && fresh.ok) cache.put("./", fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match("./")) || (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  // Libreria Supabase (versione fissa) e file statici dell'app: prima la copia salvata
  if (url.href === SUPABASE_JS || (url.origin === self.location.origin && /\.(png|svg|webmanifest|ico)$/.test(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })());
  }
  // Tutto il resto (API Supabase, realtime, allegati) va direttamente in rete.
});
