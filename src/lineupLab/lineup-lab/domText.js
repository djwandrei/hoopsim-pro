// Shared text helpers for the Lineup Lab's DOM mirrors.

export const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
export const norm = (name) => clean(name).toLowerCase().replace(/[^a-z]/g, '');