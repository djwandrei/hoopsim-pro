import { createReadStream } from 'node:fs';
import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SITE_ROOT = 'C:\\Users\\djwan\\Downloads\\djshouseofcards-next-fixes-applied';
const LOCAL_PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const EXTENSION_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

const PUBLIC_MOUNTS = [
  { url: '/lineup-lab', root: 'lineup-lab' },
  { url: '/tools/swishiq-studio/data', root: 'tools/swishiq-studio/data' },
  { url: '/tools/swishiq-studio/engine', root: 'tools/swishiq-studio/engine' },
  { url: '/tools/swishiq-studio/franchise-sim-20261008', root: 'tools/swishiq-studio/franchise-sim-20261008' },
  { url: '/tools/swishiq-studio/react-app', root: 'tools/swishiq-studio/react-app' },
  { url: '/tools/swishiq-studio/assets', root: 'tools/swishiq-studio/assets' },
  { url: '/assets/nba-logos', root: 'assets/nba-logos' },
  { url: '/assets/games', root: 'assets/games' },
  // Card images are buyer-safe media referenced by products-public.json. Keep
  // this mount bounded instead of exposing the entire assets tree in preview.
  { url: '/assets/basketball-cards', root: 'assets/basketball-cards' },
  { url: '/assets/Ebay Listing Photos', root: 'assets/Ebay Listing Photos' },
  { url: '/assets/Personal collection', root: 'assets/Personal collection' },
  { url: '/assets/player-headshots/nba', root: 'assets/player-headshots/nba' },
  { url: '/assets/player-headshots/nba-no-background', root: 'assets/player-headshots/nba-no-background' },
];

// Vite serves these checked-in public artifacts at the root during development,
// while the production base path places them below /tools/swishiq-studio/.
// Mount the same files below that path in dev so direct URL checks and local
// module loading do not fall through to the SPA shell.
const LOCAL_PUBLIC_MOUNTS = [
  { url: '/tools/swishiq-studio/djhc-runtime', root: path.join(LOCAL_PUBLIC_ROOT, 'djhc-runtime') },
  { url: '/tools/swishiq-studio/swishiq-game-sim', root: path.join(LOCAL_PUBLIC_ROOT, 'swishiq-game-sim') },
];

const PUBLIC_EXACT_FILES = new Map([
  ['/products-public.json', 'products-public.json'],
  ['/backend-config.js', 'backend-config.js'],
  ['/supabase-client.js', 'supabase-client.js'],
  ['/basketball-cards.html', 'basketball-cards.html'],
  ['/vendor/supabase.min.js', 'vendor/supabase.min.js'],
  ['/about.html', 'about.html'],
  ['/account.html', 'account.html'],
  ['/collectibles.html', 'collectibles.html'],
  ['/comics.html', 'comics.html'],
  ['/contact.html', 'contact.html'],
  ['/index.html', 'index.html'],
  ['/policies.html', 'policies.html'],
  ['/returns.html', 'returns.html'],
  ['/sell-trade-want-list.html', 'sell-trade-want-list.html'],
  ['/shipping.html', 'shipping.html'],
  ['/shop.html', 'shop.html'],
  ['/sports-cards.html', 'sports-cards.html'],
  ['/assets/placeholder-basketball.svg', 'assets/placeholder-basketball.svg'],
  ['/assets/dj-logo.png', 'assets/dj-logo.png'],
  ['/tools/collection-lineup-builder/collection-fit-core.js', 'tools/collection-lineup-builder/collection-fit-core.js'],
  ['/tools/fan-tools.css', 'tools/fan-tools.css'],
  ['/tools/team-assets.js', 'tools/team-assets.js'],
  ['/tools/result-visuals.js', 'tools/result-visuals.js'],
  ['/tools/result-passport.js', 'tools/result-passport.js'],
  ['/tools/shared-result/public-keys.js', 'tools/shared-result/public-keys.js'],
  ['/tools/swishiq-static-projection.js', 'tools/swishiq-static-projection.js'],
  ['/tools/swishiq-daily-game-client.js', 'tools/swishiq-daily-game-client.js'],
]);

const STATIC_FILE_ROUTE = /^\/tools\/swishiq-studio\/[^/]+\.(?:css|csv|html|jpeg|jpg|js|json|mjs|png|svg|wasm|webp|woff2)$/i;
const RESERVED_SEGMENT = /^(?:\.env(?:\..*)?|\.git|\.deploy|products\.json|private)$/i;

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isLoopbackRemoteAddress(address) {
  const value = String(address || '').toLowerCase();
  return /^127(?:\.\d{1,3}){3}$/.test(value) || value === '::1' || /^::ffff:127\./.test(value);
}

function decodeRequestPath(requestUrl) {
  const rawPath = String(requestUrl || '').split('?', 1)[0];
  if (rawPath.includes('\\') || /%(?:2f|5c|2e)/i.test(rawPath)) return null;
  try {
    const decoded = decodeURIComponent(rawPath);
    const segments = decoded.split('/');
    if (segments.some(segment => segment === '.' || segment === '..' || segment.startsWith('.') || RESERVED_SEGMENT.test(segment))) return null;
    return decoded;
  } catch {
    return null;
  }
}

function routeFor(pathname) {
  for (const mount of [...PUBLIC_MOUNTS, ...LOCAL_PUBLIC_MOUNTS]) {
    if (pathname === mount.url || pathname.startsWith(`${mount.url}/`)) {
      return {
        root: mount.root,
        relative: pathname.slice(mount.url.length).replace(/^\//, ''),
      };
    }
  }

  const exactFile = PUBLIC_EXACT_FILES.get(pathname);
  if (exactFile) return { root: '', relative: exactFile };

  if (STATIC_FILE_ROUTE.test(pathname)) {
    return {
      root: 'tools/swishiq-studio',
      relative: pathname.slice('/tools/swishiq-studio/'.length),
    };
  }

  return null;
}

function sendNotFound(response) {
  response.statusCode = 404;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end('Not found');
}

function sendMethodNotAllowed(response) {
  response.statusCode = 405;
  response.setHeader('Allow', 'GET, HEAD');
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end('Method not allowed');
}

async function resolvePublicFile(siteRoot, route) {
  if (!route.relative) return null;
  const routeRoot = route.root ? path.resolve(siteRoot, route.root) : siteRoot;
  const routePath = path.resolve(routeRoot, ...route.relative.split('/'));
  if (!isWithin(routeRoot, routePath)) return null;

  let routeRootReal;
  let routePathReal;
  try {
    const rootInfo = await lstat(routeRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return null;
    routeRootReal = await realpath(routeRoot);
    routePathReal = await realpath(routePath);
  } catch {
    return null;
  }

  if (!isWithin(routeRootReal, routePathReal)) return null;
  try {
    const fileInfo = await stat(routePathReal);
    return fileInfo.isFile() ? { fileInfo, filePath: routePathReal } : null;
  } catch {
    return null;
  }
}

export function djhcPublicFileBridge() {
  const configuredRoot = process.env.DJHC_SITE_ROOT || DEFAULT_SITE_ROOT;
  const siteRoot = path.resolve(configuredRoot);

  const handleRequest = (request, response, next) => {
    const pathname = decodeRequestPath(request.url);
    if (pathname === null) return sendNotFound(response);
    // Loopback-only preview relay keeps production CORS restricted to DJHC.
    // This middleware is not shipped in the static cPanel build.
    if (pathname === '/__djhc-daily-evaluate') {
      if (request.method !== 'POST') return sendMethodNotAllowed(response);
      if (!isLoopbackRemoteAddress(request.socket.remoteAddress)) {
        response.statusCode = 403;
        return response.end('Loopback preview only');
      }
      void (async () => {
        const chunks = []; let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 24576) { response.statusCode = 413; return response.end('Request too large'); }
          chunks.push(chunk);
        }
        const upstream = await fetch('https://gkqdymnmczabcggvigce.supabase.co/functions/v1/swishiq-game-evaluate', {
          method: 'POST', body: Buffer.concat(chunks),
          headers: { 'Content-Type': 'application/json', Origin: 'https://www.djshouseofcards-comics.com', apikey: 'sb_publishable_BHrJWQtop2ovkpOMOd9w3A_-9MTaeGG' },
        });
        response.statusCode = upstream.status;
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(await upstream.text());
      })().catch(() => { response.statusCode = 502; response.end('Daily evaluator unavailable'); });
      return;
    }

    const route = routeFor(pathname);
    if (!route) return next();

    if (request.method !== 'GET' && request.method !== 'HEAD') return sendMethodNotAllowed(response);

    void (async () => {
      const resolved = await resolvePublicFile(siteRoot, route);
      if (!resolved) return sendNotFound(response);

      const { fileInfo, filePath } = resolved;
      const extension = path.extname(filePath).toLowerCase();
      response.statusCode = 200;
      response.setHeader('Content-Type', EXTENSION_TYPES.get(extension) || 'application/octet-stream');
      response.setHeader('Content-Length', String(fileInfo.size));
      response.setHeader('Last-Modified', fileInfo.mtime.toUTCString());
      response.setHeader('ETag', `W/"${fileInfo.size.toString(16)}-${Math.trunc(fileInfo.mtimeMs).toString(16)}"`);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');

      if (request.method === 'HEAD') return response.end();
      const stream = createReadStream(filePath);
      stream.on('error', () => {
        if (!response.headersSent) sendNotFound(response);
        else response.destroy();
      });
      stream.pipe(response);
    })().catch(() => sendNotFound(response));
  };

  return {
    name: 'djhc-read-only-public-file-bridge',
    configureServer(server) {
      server.middlewares.use(handleRequest);
    },
    configurePreviewServer(server) {
      const buildRoot = path.resolve(server.config.root, server.config.build.outDir);
      const base = server.config.base;
      server.middlewares.use((request, response, next) => {
        const pathname = decodeRequestPath(request.url);
        if (pathname === null) return sendNotFound(response);
        // The built app owns its index and hashed assets. Only fall back to
        // the site's public files when the build has no file at this URL.
        // This also avoids the old Studio index masking the new React app.
        if (!pathname.startsWith(base)) return handleRequest(request, response, next);
        const relative = pathname.slice(base.length) || 'index.html';
        void resolvePublicFile(buildRoot, { root: '', relative }).then(resolved => {
          if (resolved) return next();
          return handleRequest(request, response, next);
        }).catch(() => sendNotFound(response));
      });
    },
  };
}
