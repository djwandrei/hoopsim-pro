import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { djhcPublicFileBridge } from './scripts/djhc-public-file-bridge.mjs';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// Vite 8 writes its dependency prebundle under a dot-directory but does not
// expose that directory when the app is served below a site prefix. Expose
// only the generated JavaScript files needed by the local dev client; the
// production build never installs this middleware.
function djhcDevDependencyBridge() {
  return {
    name: 'djhc-dev-dependency-bridge',
    apply: 'serve',
    configureServer(server) {
      const depsRoot = path.join(server.config.cacheDir, 'deps');
      const prefix = `/${path.relative(projectRoot, depsRoot).replaceAll(path.sep, '/')}/`;
      server.middlewares.use((request, response, next) => {
        const pathname = String(request.url || '').split('?', 1)[0];
        if (!pathname.startsWith(prefix) || !['GET', 'HEAD'].includes(request.method)) return next();
        const relative = pathname.slice(prefix.length);
        if (!/^[A-Za-z0-9@._-]+\.js$/.test(relative)) return next();
        const filePath = path.join(depsRoot, relative);
        void stat(filePath).then(async info => {
          if (!info.isFile()) return next();
          if (request.method === 'HEAD') {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            response.setHeader('Content-Length', String(info.size));
            return response.end();
          }
          const source = await readFile(filePath, 'utf8');
          // Each optimized file has its own browser hash after lazy discovery.
          // Use the imported file's hash, never its parent's: React must have
          // the same URL in app code, React DOM, and third-party dependencies.
          const metadata = server.environments.client?.depsOptimizer?.metadata;
          const rewriteImport = (_match, start, filename, quote) => {
            const dependency = metadata?.depInfoList.find(item => path.basename(item.file) === filename);
            const version = dependency?.browserHash || metadata?.browserHash;
            return `${start}${version ? `?v=${version}` : ''}${quote}`;
          };
          const body = source
            .replace(/(from\s*["']\.\/([^"'?]+\.js))(["'])/g, rewriteImport)
            .replace(/(import\s*\(\s*["']\.\/([^"'?]+\.js))(["'])/g, rewriteImport);
          const bytes = Buffer.byteLength(body);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          response.setHeader('Content-Length', String(bytes));
          return response.end(body);
        }).catch(() => next());
      });
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  // Vite's dependency prebundle is served from the root during dev. Keeping
  // the deployment prefix for production preserves cPanel routing while
  // avoiding broken `/tools/.../node_modules/.vite` imports in local smoke.
  base: command === 'build' || isPreview ? '/tools/swishiq-studio/' : '/',
  // node_modules may be shared with another checkout through a junction.
  cacheDir: path.join(projectRoot, '.vite'),
  define: {
    'import.meta.env.VITE_STANDALONE': JSON.stringify('true'),
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.join(projectRoot, 'src') },
      { find: '@pins', replacement: path.join(projectRoot, 'src/lib/site/studioNativeAssets.js') },
    ],
  },
  plugins: [
    djhcDevDependencyBridge(),
    djhcPublicFileBridge(),
    {
      name: 'lineup-lab-strip-import-queries',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer || !source.startsWith('.') || !/\?(?:v|rev)=/.test(source)) return null;
        return path.resolve(path.dirname(importer), source.split('?')[0]);
      },
    },
    react(),
  ],
}));
