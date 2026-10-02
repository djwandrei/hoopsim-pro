import { createClient, getAccessToken } from '@base44/sdk';

// Base44 preview/dev client. In the standalone site build (VITE_STANDALONE=true)
// this module is never used — the data layer loads same-origin instead — so
// client creation is guarded and degrades to null when the app is not hosted
// on Base44.
let client = null;
try {
  client = createClient({
    appId: import.meta.env.VITE_BASE44_APP_ID,
    token: getAccessToken(),
    functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
    serverUrl: '',
    appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL,
  });
} catch {
  client = null;
}

export const base44 = client;