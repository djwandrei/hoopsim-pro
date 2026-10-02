import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone site export: VITE_STANDALONE=true builds the app for the DJHC
// site under /tools/swishiq-studio/ with no Base44 runtime. The Base44 plugin
// is excluded from that build and stays on for the hosted preview.
const standalone = process.env.VITE_STANDALONE === 'true';

// https://vite.dev/config/
export default defineConfig({
  base: standalone ? '/tools/swishiq-studio/' : '/',
  plugins: [
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