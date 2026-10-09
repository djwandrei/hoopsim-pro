// Studio is hosted with the existing DJHC storefront and public data.
export const STANDALONE = true;
export const SITE_BASE = '/tools/swishiq-studio';
export const SITE_ORIGIN = typeof window !== 'undefined'
  ? window.location.origin : 'https://www.djshouseofcards-comics.com';
export function siteUrl(path = '/') {
  const url = new URL(path, SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN) throw new Error('Expected a DJHC site path.');
  return url.href;
}
