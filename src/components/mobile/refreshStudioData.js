import { originalFetch, clearStudioDataRequests } from '@/components/native/nativeTransport';
import { clearSeasonSourceCache } from '@/lib/season/seasonSourceCore';

export default async function refreshStudioData() {
  clearStudioDataRequests();
  clearSeasonSourceCache();
  // Revalidate the reviewed release, never the obsolete unversioned registry.
  const response = await originalFetch('/tools/swishiq-studio/data/v4/releases/v4-site-12ad90dc8710/registry.json?v=20261002b');
  await response.json();
}