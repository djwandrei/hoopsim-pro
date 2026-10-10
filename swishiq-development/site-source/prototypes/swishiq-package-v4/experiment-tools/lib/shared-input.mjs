// Shared payloads are immutable by convention; workers never modify these buffers.
export function shareJson(value) {
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  const shared = new SharedArrayBuffer(bytes.byteLength);
  new Uint8Array(shared).set(bytes);
  return shared;
}

export function readSharedJson(shared) {
  if (!(shared instanceof SharedArrayBuffer)) throw Error('Shared JSON buffer required');
  return JSON.parse(Buffer.from(shared).toString('utf8'));
}

export function shareDesign(design) {
  const arrays = {};
  for (const head of ['total', 'margin']) {
    const shared = new SharedArrayBuffer(design.arrays[head].byteLength);
    new Float64Array(shared).set(design.arrays[head]);
    arrays[head] = shared;
  }
  return { key: design.key, directory: design.directory, arrays,
    metadata: shareJson({ widths: design.widths, standardization: design.standardization, warmupThrough: design.warmupThrough,
      chronology: design.chronology, rowMetadata: design.rowMetadata,
      designContractSha256: design.designContractSha256, extension: design.extension,
      rows: design.rows, rawSelectedRowsSha256: design.rawSelectedRowsSha256,
      sourceIdentity: design.sourceIdentity,
      receipt: { signature: design.receipt.signature } }) };
}

export function readSharedDesign(shared) {
  return { key: shared.key, directory: shared.directory, ...readSharedJson(shared.metadata), arrays: Object.fromEntries(['total', 'margin'].map(head => {
    if (!(shared.arrays[head] instanceof SharedArrayBuffer)) throw Error('Shared Float64 design required');
    return [head, new Float64Array(shared.arrays[head])];
  })) };
}
