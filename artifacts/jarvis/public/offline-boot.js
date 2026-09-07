(() => {
  const OVERLAY_ID = 'jarvis-offline-boot';

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function showOverlay() {
    if (navigator.onLine || document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'background:#061013',
      'color:#d8f7fa',
      'font-family:Inter,system-ui,sans-serif',
      'text-align:center',
    ].join(';');

    overlay.innerHTML = `
      <div style="width:min(560px,100%);border:1px solid rgba(0,231,245,.28);background:rgba(0,0,0,.42);padding:28px;box-shadow:0 0 48px rgba(0,231,245,.08)">
        <div style="font-family:monospace;font-size:11px;letter-spacing:.22em;color:#00e7f5;text-transform:uppercase;margin-bottom:14px">JARVIS // SECURE OFFLINE MODE</div>
        <div style="font-size:28px;font-weight:500;margin-bottom:12px">Network connection unavailable.</div>
        <p style="margin:0 auto 18px;max-width:460px;line-height:1.6;color:#8fb5ba;font-size:14px">The application shell is available, but JARVIS will not expose cached private conversations or pretend an authenticated session is valid while offline. Reconnect to resume secure chat, history, providers, and voice services.</p>
        <div style="font-family:monospace;font-size:10px;letter-spacing:.14em;color:#e6ad4d;text-transform:uppercase;margin-bottom:20px">PAPER / RESEARCH ONLY // LIVE TRADING DISABLED</div>
        <button id="jarvis-offline-retry" type="button" style="appearance:none;border:1px solid rgba(0,231,245,.45);background:rgba(0,231,245,.08);color:#d8f7fa;padding:10px 16px;font-family:monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Retry connection</button>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#jarvis-offline-retry')?.addEventListener('click', () => {
      if (navigator.onLine) window.location.reload();
    });
  }

  function syncOfflineState() {
    if (navigator.onLine) removeOverlay();
    else showOverlay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncOfflineState, { once: true });
  } else {
    syncOfflineState();
  }

  window.addEventListener('offline', showOverlay);
  window.addEventListener('online', () => {
    removeOverlay();
    window.location.reload();
  });
})();
