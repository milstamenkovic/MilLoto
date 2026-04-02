// MilLoto Service Worker v1.0
const CACHE_NAME = 'MilLoto_cache';
const DATA_CACHE_NAME = 'MilLoto_dataCache';

const STATIC_ASSETS = [
  'index.html',
  'manifest.json',
  'Media/Icons/icon192.png',
  'Media/Icons/icon512.png',
  'Media/Icons/icon1024.png'
];

// =====================================================
// INSTALL
// =====================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// =====================================================
// ACTIVATE
// =====================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== DATA_CACHE_NAME)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// =====================================================
// FETCH — network-first for data, cache-first for static
// =====================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.hostname === 'stats247.com') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(DATA_CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// =====================================================
// MESSAGES FROM APP
// =====================================================
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Schedule alarms
  if (event.data?.type === 'SCHEDULE_ALARMS') {
    scheduleAlarms(event.data.alarms);
  }

  // Cancel all alarms
  if (event.data?.type === 'CANCEL_ALARMS') {
    cancelAllAlarms();
  }
});

// =====================================================
// ALARM STORAGE (IndexedDB-like via SW storage)
// =====================================================
let scheduledTimers = [];

function cancelAllAlarms() {
  scheduledTimers.forEach(t => clearTimeout(t));
  scheduledTimers = [];
}

function scheduleAlarms(alarms) {
  cancelAllAlarms();

  const now = Date.now();

  alarms.forEach(alarm => {
    const msUntil = alarm.fireAt - now;
    if (msUntil <= 0) return; // already passed

    const timer = setTimeout(() => {
      self.registration.showNotification('MilLoto 🎱', {
        body: alarm.message,
        icon: 'Media/Icons/icon192.png',
        badge: 'Media/Icons/icon192.png',
        tag: `milloto-alarm-${alarm.fireAt}`,
        requireInteraction: alarm.requireInteraction || false,
        data: { url: './' },
        actions: [
          { action: 'open', title: 'Отвори MilLoto' },
          { action: 'dismiss', title: 'Одбаци' }
        ]
      });
    }, msUntil);

    scheduledTimers.push(timer);
  });
}

// =====================================================
// NOTIFICATION CLICK
// =====================================================
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

// =====================================================
// KEEP SW ALIVE via periodic sync (if supported)
// =====================================================
self.addEventListener('periodicsync', event => {
  if (event.tag === 'milloto-alarm-check') {
    event.waitUntil(checkPendingAlarms());
  }
});

async function checkPendingAlarms() {
  // Re-read alarms from all clients and reschedule
  const allClients = await clients.matchAll();
  if (allClients.length > 0) {
    allClients[0].postMessage({ type: 'REQUEST_ALARMS' });
  }
}