import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// Standalone site export: VITE_STANDALONE=true builds the app for the DJHC
// site under /tools/swishiq-studio/ with no Base44 runtime. The Base44 plugin
// is excluded from that build and stays on for the hosted preview.
const standalone = process.env.VITE_STANDALONE === 'true';

// https://vite.dev/config/
export default defineConfig({
  base: standalone ? '/tools/swishiq-studio/' : '/',
  resolve: { alias: [
    // Standalone build: stub the Base44 SDK entirely — it must never ship to
    // the site (AuthContext statically imports the client, which would pull
    // the whole SDK into the bundle otherwise).
    ...(standalone ? [{ find: '@base44/sdk', replacement: fileURLToPath(new URL('./src/lib/base44SdkStub.js', import.meta.url)) }] : []),
    { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    { find: '@pins', replacement: fileURLToPath(new URL('./base44/shared/studioNativeAssets.ts', import.meta.url)) },
  ] },
  plugins: [
    // Lineup Lab modules carry the live site's cache-buster query strings on
    // relative imports; strip them so each import resolves to one module.
    {
      name: 'lineup-lab-strip-import-queries',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer || !source.startsWith('.') || !/\?(?:v|rev)=/.test(source)) return null;
        return path.resolve(path.dirname(importer), source.split('?')[0]);
      },
    },
    ...(standalone ? [] : [base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    })]),
    react(),
  ]
});