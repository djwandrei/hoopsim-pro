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
  const depsRoot = path.join(projectRoot, 'node_modules', '.vite', 'deps');
  return {
    name: 'djhc-dev-dependency-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = String(request.url || '').split('?', 1)[0];
        const prefix = '/node_modules/.vite/deps/';
        if (!pathname.startsWith(prefix) || !['GET', 'HEAD'].includes(request.method)) return next();
        const relative = pathname.slice(prefix.length);
        if (!/^[A-Za-z0-9@._-]+\.js$/.test(relative)) return next();
        const filePath = path.join(depsRoot, relative);
        const version = new URL(`http://localhost${request.url}`).searchParams.get('v');
        void stat(filePath).then(async info => {
          if (!info.isFile()) return next();
          if (request.method === 'HEAD') {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            response.setHeader('Content-Length', String(info.size));
            return response.end();
          }
          const source = await readFile(filePath, 'utf8');
          // The prebundled React DOM chunks use relative imports. Add the
          // same optimizer version to those imports so React is evaluated as
          // one browser module rather than once with and once without `?v`.
          const body = version
            ? source.replace(/(from\s*["']\.\/[^"']+\.js)(["'])/g, `$1?v=${version}$2`)
              .replace(/(import\s*\(\s*["']\.\/[^"']+\.js)(["'])/g, `$1?v=${version}$2`)
            : source;
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
