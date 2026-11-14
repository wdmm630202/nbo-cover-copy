// Cache only the shipped editor. User photos and exports never enter this cache.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const status = document.getElementById('offlineStatus');
  const show = message => { if (status) status.textContent = message; };
  const prepare = () => {
    show('正在准备离线使用…');
    navigator.serviceWorker.register(new URL('./studio-sw.js', import.meta.url), { updateViaCache: 'none' }).then(async registration => {
      let updateLink;
      const showUpdate = () => {
        show('制作台有更新');
        if (!status || updateLink) return;
        updateLink = document.createElement('a');
        updateLink.textContent = '更新工作台（需重选照片）';
        updateLink.href = new URL('./update.html?mode=makeover', import.meta.url).href;
        status.after(updateLink);
      };
      const watchInstalling = () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && registration.active) showUpdate();
          if (worker.state === 'redundant' && !registration.active) show('离线准备未完成，请联网刷新重试');
        });
      };
      registration.addEventListener('updatefound', watchInstalling);
      watchInstalling();
      await navigator.serviceWorker.ready;
      show(navigator.onLine ? '已可离线使用' : '离线模式');
      navigator.storage?.persist?.().catch(() => {});
      window.addEventListener('online', () => show(registration.waiting ? '制作台有更新' : '已可离线使用'));
      window.addEventListener('offline', () => show('离线模式'));
      if (registration.waiting) showUpdate();
    }).catch(() => show('离线准备未完成，请下载本地离线版'));
  };
  // Let the editor and its iframe finish before caching the optional Live library.
  if (document.readyState === 'complete') prepare();
  else window.addEventListener('load', prepare, { once: true });
}
