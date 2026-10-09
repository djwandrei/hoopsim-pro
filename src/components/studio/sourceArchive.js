import { loadCareerArchiveCore, loadPlayerContextCore } from '@/lib/season/seasonSourceCore';
export async function loadPlayerContext(name) {
  return (await loadPlayerContextCore(String(name || ''))).record || null;
}
export async function loadCareerArchive() {
  const data = await loadCareerArchiveCore();
  if (data.entry?.scope?.kind !== 'pooled-window' || !Array.isArray(data.records)) throw new Error('The pooled career archive is not available.');
  return data;
}
