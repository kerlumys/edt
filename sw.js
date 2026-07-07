// Service Worker — EDT Notifs
// MIT — Notifications de changement d'activité

const WARN_MIN = 5; // avertissement X minutes avant

let _timeouts = [];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SCHEDULE_NOTIFS') {
    // Annuler les anciens timers
    _timeouts.forEach(t => clearTimeout(t));
    _timeouts = [];

    const notifs = e.data.notifs || [];
    const now    = Date.now();

    notifs.forEach(n => {
      // ── Avertissement (X min avant) ───────────────────────
      const warnMs = n.startMs - now - WARN_MIN * 60000;
      if (warnMs > 0 && warnMs < 24 * 3600000) {
        _timeouts.push(setTimeout(() => {
          self.registration.showNotification(`⏰ Dans ${WARN_MIN} min — ${n.title}`, {
            body:    `Commence à ${n.startTime}`,
            icon:    n.icon || './favicon.ico',
            tag:     `warn_${n.tag}`,
            vibrate: [100, 50, 100],
            silent:  false,
            data:    { url: './' }
          });
        }, warnMs));
      }

      // ── Démarrage exact ────────────────────────────────────
      const startMs = n.startMs - now;
      if (startMs > -60000 && startMs < 24 * 3600000) {
        const delay = Math.max(0, startMs);
        _timeouts.push(setTimeout(() => {
          self.registration.showNotification(`🟢 ${n.title} commence`, {
            body:    `${n.startTime} → ${n.endTime}${n.note ? '\n' + n.note : ''}`,
            icon:    n.icon || './favicon.ico',
            tag:     `start_${n.tag}`,
            vibrate: [200, 100, 200],
            silent:  false,
            data:    { url: './' }
          });
        }, delay));
      }
    });

    // Confirmer au client
    e.source && e.source.postMessage({ type: 'SW_SCHEDULED', count: notifs.length });
  }

  if (e.data.type === 'CLEAR_NOTIFS') {
    _timeouts.forEach(t => clearTimeout(t));
    _timeouts = [];
  }
});

// Clic sur notif → focus l'app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const match = clients.find(c => c.url.includes('edt'));
      if (match) return match.focus();
      return self.clients.openWindow(url);
    })
  );
});
