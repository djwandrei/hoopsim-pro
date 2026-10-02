export default function nativeReadiness(host, kind) {
  if (kind === 'season') {
    const status = host.panel.querySelector('.sl-source-panel .sl-status');
    if (!status) return 'loading';
    return status.classList.contains('sl-status--error') ? 'error' : status.classList.contains('sl-status--ready') ? 'ready' : 'loading';
  }
  if (kind === 'game') {
    const banner = host.panel.querySelector('.gl-source-banner');
    if (!banner) return 'loading';
    if (banner.querySelector('[role="alert"]')) return 'error';
    return /\bready\b|\bavailable\b/i.test(banner.querySelector('strong')?.textContent || '') ? 'ready' : 'loading';
  }
  if(host.panel.querySelector(':scope > .swishiq-advanced-notice--error')) return 'error';
  if(host.panel.hasAttribute('aria-busy')) return 'loading';
  const state = host.shadow.getElementById('workbenchState')?.dataset.state;
  if (state === 'available' || state === 'ready') return 'ready';
  if (state === 'unavailable' || state === 'error' || state === 'failed') return 'error';
  return 'loading';
}