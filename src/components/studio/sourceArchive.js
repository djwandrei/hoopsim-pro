import { base44 } from '@/api/base44Client';

export function normalizePlayerName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[†*]+$/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

async function relay(payload) {
  const { data } = await base44.functions.invoke('swishiqSeasonSource', payload);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function loadPlayerContext(name) {
  const data = await relay({ playerContextName: String(name || '') });
  return data.record || null;
}

export async function loadCareerArchive() {
  const data = await relay({ career: true });
  if (data.entry?.scope?.kind !== 'pooled-window' || !Array.isArray(data.records)) throw new Error('The pooled career archive is not available.');
  return data;
}