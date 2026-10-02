// Standalone-build stub for @base44/sdk. The Vite config aliases the SDK to
// this module when VITE_STANDALONE=true, so no Base44 runtime ships in the
// site build; the client creation in base44Client.js then degrades to null
// and every call site is guarded (or compiled out).
export const createClient = () => null;
export const getAccessToken = () => null;