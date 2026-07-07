// Service Worker — EDT Notifs + Cache versioning
// MIT

const SW_VERSION = "1.1"; // ← incrémenter à chaque déploiement pour vider le cache
const CACHE_NAME = "edt-cache-v" + SW_VERSION;

// Fichiers à mettre en cache pour l'offline
const ASSETS = ["./", "./index.html"];

const WARN_MIN = 5;
let _timeouts = [];

// ── Install : mise en cache des assets ──────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // activer immédiatement sans attendre fermeture des onglets
});

// ── Activate : supprime les anciens caches (sans toucher localStorage) ───────
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith("edt-cache-") && k !== CACHE_NAME)
          .map(k => {
            console.log("[SW] Vieux cache supprimé :", k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : sert depuis le cache, sinon réseau ───────────────────────────────
self.addEventListener("fetch", e => {
  // Ne cache que les requêtes GET de la même origine
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Mettre en cache les nouvelles ressources de l'app
        if (resp.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached); // offline fallback
    })
  );
});

// ── Notifications planifiées ─────────────────────────────────────────────────
self.addEventListener("message", e => {
  if (!e.data) return;

  if (e.data.type === "SCHEDULE_NOTIFS") {
    _timeouts.forEach(t => clearTimeout(t));
    _timeouts = [];
    const notifs = e.data.notifs || [];
    const now = Date.now();

    notifs.forEach(n => {
      const warnMs  = n.startMs - now - WARN_MIN * 60000;
      const startMs = n.startMs - now;

      if (warnMs > 0 && warnMs < 24 * 3600000) {
        _timeouts.push(setTimeout(() => {
          self.registration.showNotification(`⏰ Dans ${WARN_MIN} min — ${n.title}`, {
            body: `Commence à ${n.startTime}`,
            tag:     `warn_${n.tag}`,
            vibrate: [100, 50, 100],
            data:    { url: "./" }
          });
        }, warnMs));
      }

      if (startMs > -60000 && startMs < 24 * 3600000) {
        _timeouts.push(setTimeout(() => {
          self.registration.showNotification(`🟢 ${n.title} commence`, {
            body: `${n.startTime} → ${n.endTime}${n.note ? "\n" + n.note : ""}`,
            tag:     `start_${n.tag}`,
            vibrate: [200, 100, 200],
            data:    { url: "./" }
          });
        }, Math.max(0, startMs)));
      }
    });

    e.source && e.source.postMessage({ type: "SW_SCHEDULED", count: notifs.length, version: SW_VERSION });
  }

  if (e.data.type === "CLEAR_NOTIFS") {
    _timeouts.forEach(t => clearTimeout(t));
    _timeouts = [];
  }
});

// ── Clic notif → focus l'app ─────────────────────────────────────────────────
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const match = clients.find(c => c.url.includes("edt"));
      if (match) return match.focus();
      return self.clients.openWindow(url);
    })
  );
});
