import { base44 } from '@/api/base44Client';

// Frontend client for the collector tools' live catalog relay
// (swishiqCardCatalog backend function).

export async function browseCards({ query = '', page = 1, pageSize = 24 } = {}) {
  const { data } = await base44.functions.invoke('swishiqCardCatalog', { mode: 'browse', query, page, pageSize });
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function suggestPlayers(query) {
  const { data } = await base44.functions.invoke('swishiqCardCatalog', { mode: 'suggest', query });
  if (data?.error) throw new Error(data.error);
  return data.suggestions || [];
}

export async function findPlayerMatches(query) {
  const { data } = await base44.functions.invoke('swishiqCardCatalog', { mode: 'matches', query });
  if (data?.error) throw new Error(data.error);
  return data;
}