import { STANDALONE } from '@/lib/deployConfig';
import { loadCareerArchiveCore, loadPlayerContextCore } from '@/lib/season/seasonSourceCore';

export function normalizePlayerName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[†*]+$/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

export async function loadPlayerContext(name) {
  const nameValue = String(name || '');
  if (STANDALONE) return (await loadPlayerContextCore(nameValue)).record || null;
  const { base44 } = await import('@/api/base44Client');
  const { data } = await base44.functions.invoke('swishiqSeasonSource', { playerContextName: nameValue });
  if (data?.error) throw new Error(data.error);
  return data.record || null;
}

export async function loadCareerArchive() {
  let data;
  if (STANDALONE) {
    data = await loadCareerArchiveCore();
  } else {
    const { base44 } = await import('@/api/base44Client');
    const response = await base44.functions.invoke('swishiqSeasonSource', { career: true });
    data = response.data;
  }
  if (data.entry?.scope?.kind !== 'pooled-window' || !Array.isArray(data.records)) throw new Error('The pooled career archive is not available.');
  return data;
}