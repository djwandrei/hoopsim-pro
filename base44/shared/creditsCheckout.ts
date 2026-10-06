// Shared configuration for the SwishIQ Credits checkout (play-money book).
// Fixed pack table — the client sends a pack id, never a price or credit
// count, so an amount or grant can never be crafted by a caller.
export const CREDIT_PACKS = {
  starter: { label: 'Starter Pack', amountCents: 499, credits: 5000 },
  player: { label: 'Player Pack', amountCents: 999, credits: 10500 },
  pro: { label: 'Pro Pack', amountCents: 1999, credits: 21500 },
  whale: { label: 'Whale Pack', amountCents: 4999, credits: 57500 },
};

// Allowlisted redirect resolver, same shape as the real-book checkout: the
// origin must be https and match the serving host, a base44 host or
// localhost (preview); the page path is root-relative and no-traversal.
// Any mismatch falls back to the operator origin, so a crafted redirect can
// never leave the app's hosts.
export function resolveRedirect(rawOrigin, host, rawPath, fallbackOrigin, defaultPage) {
  let origin = fallbackOrigin;
  try {
    const parsed = new URL(String(rawOrigin || ''));
    if (parsed.protocol === 'https:' && (
      parsed.host === host ||
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' ||
      parsed.hostname.endsWith('.base44.app') || parsed.hostname.endsWith('.base44.dev')
    )) origin = parsed.origin;
  } catch { /* keep fallback origin */ }
  const cleanPath = String(rawPath || '').replace(/[?#].*$/, '');
  const pagePath = new RegExp(`^\\/(?:[A-Za-z0-9._-]+\\/)*${defaultPage}$`).test(cleanPath) && !cleanPath.includes('..')
    ? cleanPath : defaultPage;
  return { origin, pagePath };
}