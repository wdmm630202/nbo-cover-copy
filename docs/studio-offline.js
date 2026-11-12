// Cache only the shipped editor. User photos and exports never enter this cache.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const status = document.getElementById('offlineStatus');
  const show = message => { if (status) status.textContent = message; };
  show('正在准备离线使用…');
  navigator.serviceWorker.register(new URL('./studio-sw.js', import.meta.url), { updateViaCache: 'none' }).then(async registration => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && registration.active) show('离线版有更新，关闭工作台后重新打开');
      if (worker.state === 'redundant' && !registration.active) show('离线准备未完成，请联网刷新重试');
    });
    await navigator.serviceWorker.ready;
    show(navigator.onLine ? '已可离线使用' : '离线模式');
    // Persistence is a browser request, not a guarantee against manual data removal.
    navigator.storage?.persist?.().catch(() => {});
    window.addEventListener('online', () => show('已可离线使用'));
    window.addEventListener('offline', () => show('离线模式'));
    if (registration.waiting) show('离线版有更新，关闭工作台后重新打开');
  }).catch(() => show('离线准备未完成，请下载本地离线版'));
}
