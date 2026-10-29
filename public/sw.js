self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.allSettled(names
      .filter((name) => name.startsWith('astrid-'))
      .map((name) => caches.delete(name)));
    await self.registration.unregister();
  })());
});
