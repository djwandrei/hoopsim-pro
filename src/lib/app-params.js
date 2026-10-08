// Bootstrap parameters the platform can pass at app start. Only
// access_token/clear_access_token are read from the URL here; the whole
// bootstrap set is stripped from ?returnTo= values in authReturnTo.js, so one
// going back to a URL read must not silently become injectable again.
const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);

export const appParams = {
  token: query?.get('access_token') || null,
  appId: query?.get('app_id') || import.meta.env.VITE_BASE44_APP_ID || null,
};