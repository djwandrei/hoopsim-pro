// Bounded, byte-exact SDK pages: JSON parsing must never alter package hashes.
const CHUNK_SIZE = 512 * 1024;

export async function sourceBytes(upstream, offset) {
  const partial = upstream.status === 206;
  const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(upstream.headers.get('content-range') || '');
  if (partial && (!range || Number(range[1]) !== offset)) {
    throw new Error('The source returned an invalid byte range.');
  }
  const lengthHeader = upstream.headers.get('content-length');
  const total = range ? Number(range[3]) : lengthHeader !== null ? Number(lengthHeader) : null;
  const reader = upstream.body?.getReader();
  if (!reader) throw new Error('The source returned an empty response.');
  const buffer = new Uint8Array(CHUNK_SIZE + 1);
  let skip = partial ? 0 : offset;
  let written = 0;
  try {
    while (written < buffer.length) {
      const { value, done } = await reader.read();
      if (done) break;
      const skipped = Math.min(skip, value.length);
      skip -= skipped;
      const bytes = value.subarray(skipped);
      const size = Math.min(bytes.length, buffer.length - written);
      buffer.set(bytes.subarray(0, size), written);
      written += size;
    }
  } finally {
    await reader.cancel();
  }
  if (skip) throw new Error('The requested source range does not exist.');
  const bytes = buffer.subarray(0, Math.min(written, CHUNK_SIZE));
  const parts = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  const nextOffset = offset + bytes.length;
  const hasMore = total !== null ? nextOffset < total : written > CHUNK_SIZE;
  if (hasMore && !bytes.length) throw new Error('The source returned an incomplete byte range.');
  return {
    dataB64: btoa(parts.join('')), nextOffset, hasMore,
    contentType: upstream.headers.get('content-type') || 'application/octet-stream',
  };
}

export function sourceRange(offset) {
  return `bytes=${offset}-${offset + CHUNK_SIZE}`;
}