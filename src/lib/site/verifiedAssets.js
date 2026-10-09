const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');

export async function verifiedBytes(url, descriptor, label = 'Public source', fetchImpl = fetch) {
  if (!/^[a-f0-9]{64}$/.test(descriptor?.sha256 || '')) throw new Error(`${label} has no reviewed integrity pin.`);
  const response = await fetchImpl(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${label} is unavailable (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const expectedLength = descriptor.bytes ?? descriptor.byteLength;
  if (expectedLength != null && bytes.byteLength !== expectedLength) throw new Error(`${label} failed its byte-length check.`);
  if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== descriptor.sha256) throw new Error(`${label} failed its integrity check.`);
  return bytes;
}

export async function verifiedJson(url, descriptor, label, fetchImpl = fetch) {
  const bytes = await verifiedBytes(url, descriptor, label, fetchImpl);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function safeRelativePath(path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Invalid public package path.');
  }
  return path;
}
