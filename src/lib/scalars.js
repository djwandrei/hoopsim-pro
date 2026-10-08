// Shared scalar coercion helpers for season data mapping: tolerant number
// reads and nullable string codes.
export const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
export const codeOf = value => (typeof value === 'string' && value.trim() ? value.trim() : null);