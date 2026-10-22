// QueuePulse Service Worker - Web Push Notifications (Phase 7)
// Blueprint Section 6, 11 (F-07), 15

self.addEventListener('push', (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: 'QueuePulse',
        body: event.data.text(),
      };
    }
  }

  const title = data.title || 'QueuePulse';
  const options = {
    body: data.body || 'Your turn is near! 3 or fewer people ahead.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    data: {
      url: data.url || '/',
    },
    vibrate: [200, 100, 200],
    tag: 'queuepulse-near-turn',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
