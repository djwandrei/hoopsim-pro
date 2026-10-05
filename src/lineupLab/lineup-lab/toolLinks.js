import { STANDALONE, SITE_BASE, SITE_ORIGIN } from '@/lib/deployConfig';

const LOCAL_ROUTES = new Map([
  ['/lineup-lab/', '/lineup-lab/'],
  ['/tools/', '/'],
  ['/tools/fix-the-five/', '/fix-the-five'],
  ['/tools/draft-night/', '/draft-night'],
]);

export default function toolLinks(root) {
  const base = `${SITE_ORIGIN}/lineup-lab/`;
  root.querySelectorAll('a[href]').forEach(anchor => {
    const href = anchor.getAttribute('href');
    if (href.startsWith('#') || /^(mailto:|tel:|data:|blob:)/i.test(href)) return;
    const url = new URL(href, base);
    const route = url.origin === SITE_ORIGIN && LOCAL_ROUTES.get(url.pathname);
    anchor.href = route ? `${STANDALONE ? SITE_BASE : ''}${route}${url.search}${url.hash}` : url.href;
  });
  root.querySelectorAll('img[src], source[src], video[poster]').forEach(node => {
    const attribute = node.hasAttribute('poster') ? 'poster' : 'src';
    node.setAttribute(attribute, new URL(node.getAttribute(attribute), base).href);
  });
  root.querySelectorAll('[srcset]').forEach(node => {
    node.setAttribute('srcset', node.getAttribute('srcset').split(',').map(candidate => {
      const [src, ...descriptor] = candidate.trim().split(/\s+/);
      return [new URL(src, base).href, ...descriptor].join(' ');
    }).join(', '));
  });
}