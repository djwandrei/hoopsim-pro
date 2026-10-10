import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildCandidate57Standardization, buildCandidate57Design } from '../../models/game-lab-candidate57-c51-pass6-hybrid-v4.mjs';
import { applyGameHeadFeaturePolicy } from '../../models/game-lab-head-feature-policy-v1.mjs';
import { ARTIFACT_FORMAT, hash, pin, readJson, readJsonl, writeJson, writeJsonl, atomicWrite, withArtifactCache, verifyManifest } from './artifacts.mjs';
import { indexChronology } from './chronology.mjs';
import { validateMeanConfiguration } from './configuration.mjs';

const HEADS = ['total', 'margin'];
const FORMAT = 'swishiq-design-cache-v2';
const bytesOf = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

export function designContract(signature) {
  return { codePins: signature.codePins, warmupYear: signature.warmupYear,
    featureNames: signature.featureNames, featurePolicy: signature.featurePolicy,
    developmentFeatureContract: signature.developmentFeatureContract ?? null,
    warmupPrefixGames: signature.warmupPrefixGames, endianness: signature.endianness };
}

function readDesign(artifact) {
  const metadata = readJson(path.join(artifact.directory, 'design.json'));
  if (metadata.byteOrder !== os.endianness() || !Number.isSafeInteger(metadata.rows) || metadata.rows <= 0) throw Error('Invalid design byte order or row count');
  const arrays = {};
  for (const head of HEADS) {
    const width = metadata.widths?.[head];
    const bytes = fs.readFileSync(path.join(artifact.directory, head + '-design.f64'));
    if (!Number.isSafeInteger(width) || width < 1 || bytes.byteLength !== metadata.rows * width * 8) throw Error('Invalid cached design dimensions');
    const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes);
    arrays[head] = new Float64Array(copy);
    if (arrays[head].some(value => !Number.isFinite(value))) throw Error('Nonfinite cached design');
  }
  const rowMetadata = readJsonl(path.join(artifact.directory, 'row-metadata.jsonl'));
  const chronology = indexChronology(rowMetadata.map(row => ({ ...row, features: { total: {}, margin: {} } })), { kind: 'feature' });
  if (rowMetadata.length !== metadata.rows || hash(chronology) !== hash(metadata.chronology)) throw Error('Design chronology differs from row metadata');
  for (const head of HEADS) if (metadata.widths[head] !== artifact.receipt.signature.featureNames?.[head]?.length + 1) throw Error('Design width differs from its declared feature list');
  return { ...artifact, ...metadata, arrays, rowMetadata, receiptPin: pin(path.join(artifact.directory, 'receipt.json')),
    designContractSha256: hash(designContract(artifact.receipt.signature)) };
}

export function loadDesignCache(receiptPath) {
  const verified = verifyManifest(receiptPath), receipt = verified.manifest;
  if (receipt.format !== ARTIFACT_FORMAT || receipt.stage !== 'design'
    || !['swishiq-design-cache-v1', FORMAT].includes(receipt.signature?.format)) throw Error('Verified design-cache receipt required');
  for (const file of ['design.json', 'row-metadata.jsonl', 'total-design.f64', 'margin-design.f64']) {
    if (!receipt.files.some(item => item.path === file)) throw Error('Design receipt lacks ' + file);
  }
  return { ...readDesign({ directory: path.dirname(path.resolve(receiptPath)), key: receipt.key, receipt, cacheHit: true }), verified };
}

export function designPrefixIdentity(design, rowCount) {
  if (!Number.isSafeInteger(rowCount) || rowCount <= 0 || rowCount > design.rowMetadata.length) throw Error('Invalid design prefix length');
  return { rows: rowCount, throughDate: design.rowMetadata[rowCount - 1].gameDateLocal,
    metadataSha256: hash(design.rowMetadata.slice(0, rowCount)),
    totalSha256: hash(bytesOf(design.arrays.total.subarray(0, rowCount * design.widths.total))),
    marginSha256: hash(bytesOf(design.arrays.margin.subarray(0, rowCount * design.widths.margin))),
    standardizationSha256: hash(design.standardization), warmupThrough: design.warmupThrough,
    widths: design.widths };
}

export function prepareDesignCache({ rows, sourceIdentity, config, warmupYear, throughYear, cacheRoot, codePins, counters = {}, parentDesign = null }) {
  validateMeanConfiguration(config);
  const signature = { format: FORMAT, sourceIdentity, codePins, warmupYear, throughYear,
    sourcePathMap: sourceIdentity.sourcePathMap ?? {},
    featureNames: { total: config.totalFeatureNames, margin: config.marginFeatureNames },
    featurePolicy: config.headFeaturePolicy ?? null, warmupPrefixGames: config.standardizationWarmupPrefixGames,
    developmentFeatureContract: config.developmentFeatureContract ?? null,
    endianness: os.endianness(), parentDesignReceiptPin: parentDesign?.receiptPin ?? null };
  const artifact = withArtifactCache(cacheRoot, 'design', signature, directory => {
    const selected = rows.filter(row => row.seasonStartYear >= warmupYear && row.seasonStartYear <= throughYear)
      .sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));
    const chronology = indexChronology(selected, { kind: 'feature' });
    const widths = { total: config.totalFeatureNames.length + 1, margin: config.marginFeatureNames.length + 1 };
    let standardization, warmupThrough, warmupRows, prefixRows = 0;
    if (parentDesign) {
      if (parentDesign.receipt.signature.format !== FORMAT || !/^[a-f0-9]{64}$/.test(parentDesign.rawSelectedRowsSha256 ?? '')
        || hash(designContract(parentDesign.receipt.signature)) !== hash(designContract(signature))) throw Error('Parent design lacks a compatible versioned raw-prefix contract');
      prefixRows = parentDesign.rows;
      if (selected.length <= prefixRows || hash(selected.slice(0, prefixRows)) !== parentDesign.rawSelectedRowsSha256
        || selected[prefixRows].gameDateLocal <= parentDesign.rowMetadata.at(-1).gameDateLocal) throw Error('Design extension must preserve the complete raw prefix and append strictly later dates');
      ({ standardization, warmupThrough } = parentDesign); warmupRows = parentDesign.warmupRows;
    } else {
      const warmupCandidates = selected.filter(row => row.seasonStartYear === warmupYear), prefix = config.standardizationWarmupPrefixGames;
      if (!Number.isSafeInteger(prefix) || prefix < 100 || prefix >= warmupCandidates.length - 100) throw Error('Chronological warmup prefix must match the bounded runner');
      warmupThrough = warmupCandidates[prefix - 1].gameDateLocal;
      const warmup = warmupCandidates.filter(row => row.gameDateLocal <= warmupThrough)
        .map(row => ({ ...row, features: applyGameHeadFeaturePolicy(row.features, config.headFeaturePolicy) }));
      warmupRows = warmup.length;
      standardization = buildCandidate57Standardization({ warmupRows: warmup,
        totalFeatureNames: config.totalFeatureNames, marginFeatureNames: config.marginFeatureNames,
        experimentalFeatureNames: config.developmentFeatureContract?.featureNames ?? null });
    }
    const arrays = Object.fromEntries(HEADS.map(head => [head, new Float64Array(selected.length * widths[head])]));
    const metadata = parentDesign ? parentDesign.rowMetadata.slice() : [];
    if (parentDesign) for (const head of HEADS) arrays[head].set(parentDesign.arrays[head]);
    for (let index = prefixRows; index < selected.length; index++) {
      const row = selected[index], features = applyGameHeadFeaturePolicy(row.features, config.headFeaturePolicy);
      const design = buildCandidate57Design({ features, standardization });
      arrays.total.set(design.total, index * widths.total); arrays.margin.set(design.margin, index * widths.margin);
      metadata.push({ gameRef: row.gameRef, gameDateLocal: row.gameDateLocal, seasonStartYear: row.seasonStartYear,
        homeTeamRef: row.homeTeamRef, awayTeamRef: row.awayTeamRef, observedThrough: row.observedThrough, target: row.target,
        blendInputsPresent: ['c51:meanPointsForLast10', 'c51:meanPointsAgainstLast10'].every(name => Object.hasOwn(features.total, name)),
        blendPointsFor: features.total['c51:meanPointsForLast10'] ?? null,
        blendPointsAgainst: features.total['c51:meanPointsAgainstLast10'] ?? null });
    }
    // Immutably copy the old vectors; transform only the new raw tail once.
    for (const head of HEADS) atomicWrite(path.join(directory, head + '-design.f64'), bytesOf(arrays[head]));
    writeJsonl(path.join(directory, 'row-metadata.jsonl'), metadata);
    const prefixIdentity = parentDesign ? designPrefixIdentity(parentDesign, prefixRows) : null;
    writeJson(path.join(directory, 'design.json'), { format: FORMAT, widths, standardization, warmupThrough, warmupRows,
      chronology, byteOrder: os.endianness(), rows: selected.length, sourceIdentity,
      rawSelectedRowsSha256: hash(selected), extension: parentDesign ? { parentDesignKey: parentDesign.key,
        parentDesignReceiptPin: parentDesign.receiptPin, rawPrefixRowsSha256: parentDesign.rawSelectedRowsSha256,
        prefixIdentity, appendedRows: selected.length - prefixRows } : null });
    counters.designRowsBuilt = (counters.designRowsBuilt ?? 0) + selected.length - prefixRows;
    counters.designRowsCopied = (counters.designRowsCopied ?? 0) + prefixRows;
    return { rows: selected.length, warmupRows, designRowsBuilt: selected.length - prefixRows,
      designRowsCopied: prefixRows, targetIdentitySha256: chronology.targetIdentitySha256 };
  });
  const result = readDesign(artifact);
  // These fields are required only by calibrated configurations, but all designs preserve them.
  if (config.postMeanCalibration && result.rowMetadata.some(row => !row.blendInputsPresent
    || [row.blendPointsFor, row.blendPointsAgainst].some(value => value !== null && !Number.isFinite(value)))) throw Error('Required calibration inputs are missing/nonfinite');
  counters.designCacheHits = (counters.designCacheHits ?? 0) + Number(artifact.cacheHit);
  return result;
}

export function createDesignResumeProof({ design, parentDesign, checkpoint, checkpointPin, parentMeanReceiptPin }) {
  if (design.key === checkpoint.designKey) return null;
  assertAppendLineage(design, parentDesign);
  if (parentDesign.key !== checkpoint.designKey || hash(designContract(parentDesign.receipt.signature)) !== hash(designContract(design.receipt.signature))) throw Error('Checkpoint design contract changed');
  const oldBoundary = parentDesign.chronology.dates.find(batch => batch.date === checkpoint.state?.outcomeDate);
  const newBoundary = design.chronology.dates.find(batch => batch.date === checkpoint.state?.outcomeDate);
  if (!oldBoundary || !newBoundary || oldBoundary.end !== newBoundary.end) throw Error('Checkpoint date does not have identical complete prefix coverage');
  const before = designPrefixIdentity(parentDesign, oldBoundary.end), after = designPrefixIdentity(design, newBoundary.end);
  if (hash(before) !== hash(after)) throw Error('Checkpoint design vectors, metadata or standardization changed before the boundary');
  return { format: 'swishiq-design-resume-proof-v1', checkpointContentSha256: hash(checkpoint), checkpointPin,
    parentMeanReceiptPin, parentDesignReceiptPin: parentDesign.receiptPin, newDesignReceiptPin: design.receiptPin,
    parentDesignKey: parentDesign.key, newDesignKey: design.key, prefixIdentity: after,
    designContractSha256: hash(designContract(design.receipt.signature)), completeLocalDateBatch: true,
    status: 'byte-identical-design-prefix; canonical-replay-parity-not-established' };
}

function assertAppendLineage(design, parent) {
  if (parent.receipt.signature.format !== FORMAT || design.receipt.signature.format !== FORMAT
    || design.extension?.parentDesignKey !== parent.key || design.extension.rawPrefixRowsSha256 !== parent.rawSelectedRowsSha256
    || design.rows <= parent.rows || design.rowMetadata[parent.rows].gameDateLocal <= parent.rowMetadata.at(-1).gameDateLocal
    || hash(designPrefixIdentity(design, parent.rows)) !== hash(designPrefixIdentity(parent, parent.rows))
    || hash(design.extension.prefixIdentity) !== hash(designPrefixIdentity(parent, parent.rows))) throw Error('Design transfer requires a verified append-only parentDesignManifest');
}

export function validateDesignResumeProof({ design, checkpoint, proof }) {
  if (checkpoint.designKey === design.key) {
    if (proof !== null) throw Error('Same-design resume must not carry a transfer proof');
    return;
  }
  if (proof?.format !== 'swishiq-design-resume-proof-v1' || !proof.completeLocalDateBatch
    || proof.parentDesignKey !== checkpoint.designKey || proof.newDesignKey !== design.key
    || proof.checkpointContentSha256 !== hash(checkpoint)
    || proof.newDesignReceiptPin?.sha256 !== pin(path.join(design.directory, 'receipt.json')).sha256
    || proof.designContractSha256 !== design.designContractSha256
    || hash(designPrefixIdentity(design, proof.prefixIdentity?.rows)) !== hash(proof.prefixIdentity)
    || proof.prefixIdentity.throughDate !== checkpoint.state?.outcomeDate) throw Error('Invalid checkpoint design-transfer proof');
  const parent = loadDesignCache(proof.parentDesignReceiptPin.path);
  assertAppendLineage(design, parent);
  if (parent.key !== checkpoint.designKey || parent.receiptPin.sha256 !== proof.parentDesignReceiptPin.sha256
    || parent.receiptPin.bytes !== proof.parentDesignReceiptPin.bytes
    || parent.designContractSha256 !== proof.designContractSha256
    || hash(designPrefixIdentity(parent, proof.prefixIdentity.rows)) !== hash(proof.prefixIdentity)
    || parent.chronology.dates.find(batch => batch.date === checkpoint.state.outcomeDate)?.end !== proof.prefixIdentity.rows
    || design.chronology.dates.find(batch => batch.date === checkpoint.state.outcomeDate)?.end !== proof.prefixIdentity.rows) throw Error('Checkpoint parent prefix failed byte verification');
}
