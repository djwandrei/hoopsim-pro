const ORIGIN = 'https://www.djshouseofcards-comics.com';
// Updated whenever a pin below is refreshed after review.
const PIN_CACHE_BUST = '20261008b';
export const PINS = {
'/tools/swishiq-studio/react-game-lab-bridge.js':'61c0658cb714f8093a8af232289aba9f9d3c17d5f453059b28701811a36d399a',
'/tools/swishiq-studio/react-season-lab-bridge.js':'a588f8f2bcd5e3d0a2d51fb7685ad1a1f4525cd8455f9525215069f8de37d702',
'/tools/swishiq-studio/simulation-session-ui.js':'2e8296fa24d45652453fae4673a5287a50cda42a9bf5dd8d2701f5906d3fe5f8',
'/tools/swishiq-studio/game-lab.js':'3cfeed5aacc57162ec7070b4b99c8cb50a90b335ce5988c76425e92eee6b570d',
'/tools/swishiq-studio/season-lab.js':'d8124963319f7aaacb0510a564fde319fbf53154fe4f5e696ebd7b781be3f947',
'/tools/swishiq-studio/chemistry-lab.js':'b209a3acfd8853eb4bc9423c9396dc99b5e2e7a58b6276df67aa048ccf62a9cf',
'/tools/swishiq-studio/advanced-labs.js':'a921882d9e8809858e7fb2dc886c2b2c3617f0792a6a0277148509325ad2ce84',
'/tools/swishiq-studio/engine/game-lab-evaluation.js':'01ecbe66fe28823aae1212a848a3eb35e4b1a938a9ade6f2868d3c79f1376022',
'/tools/result-visuals.js':'a92079689f46f911ad883c201cc78c670987ef4c8aee1504278d13cbd1c01255',
'/tools/swishiq-studio/engine/simulation-seed.js':'503d60d1eea095a17c71cdf78132d19f243e195f410f3c43cf09146c1ab4e21a',
'/tools/swishiq-studio/engine/possession-simulator.js':'11b2bd7082b1830f56aeecfbe96a1db80dbfead15a88b98a2df71136b88ad061',
'/tools/swishiq-studio/engine/public-result-share.js':'8c681c8163528ca7475623eb33d4c8a929f491923bc82482b88a6526f6f6f18a',
'/tools/swishiq-studio/engine/season-lab-model.js':'44920d1387b47d723c7b56e22d16103f5428c8ac6d3ec127cda92cc02ddc9450',
'/tools/swishiq-studio/react-app/studio-react-labs.js':'87b20c13215de816ffd3eb5ea94bebe24f616db10d9b923e30f79a65ab602d78',
// The live react-game-lab-bridge import resolves to this candidate runtime;
// it is the reviewed Game Lab revision as of 2026-10-08.
'/tools/swishiq-studio/react-app/studio-react-labs-candidate74-20261007-r2.js':'59d4ea3b2ddea3a454316d5d81fe6cf9dda6c167e009611db1455cd4581cd054',
'/tools/swishiq-studio/integration-bridge.js':'07e65797e6f2f2374a7464db5b582fdb1f90a6ab88c0968acc1060266100e773',
'/tools/swishiq-studio/engine/nba-schedule-source.js':'c2db12f4760563c1fa92df0bc0acd204e6f047059a4829e2b8f5bfb6c7cece00',
'/tools/swishiq-studio/engine/public-result-share-client.js':'8d46b4ad8e259c3eeba2440b78cdee00e0ca5df97ae605d3d9d1c78f6cbb1baf',
'/tools/swishiq-static-projection.js':'c18248c81b2c977b93f42c23ce7ae49382dfb1455c4128f3935b0389ed035306',
'/tools/swishiq-studio/engine/league-lab.js':'b550c932ca4974b090460dfb4cbae3eeca3351c4a353ba64761203930f0d547a',
'/tools/swishiq-studio/player-metadata.js':'287fe6f4ca79a475c54aef4fb4ed4d2ee0cd2e40d351292ea0c25890733a4310',
'/tools/swishiq-studio/engine/canonical-v4-studio-runtime-adapter.js':'e163bf97d92ca202bbbf46f0afb735eb22e23f2b63f9601b2f36dc0a63c2cc3c',
  '/tools/swishiq-daily-game-client.js':'31bff5d7a0816ef76aad5670157df8bbb6ecec8226a34f06645774362634937c',
'/tools/swishiq-studio/player-context.js':'4fe95f851ef46591ce6470539bf1c304efead8f6eed5e30332fb26d6304c0f58',
'/tools/swishiq-studio/selector-system.js':'2958ec6adfe44eb3ebb4cd19af74970150b4058dae426b5e03ce190ad0480d62',
'/tools/swishiq-studio/composite-public-result-share.js':'53ea37be6f3a89e20eb079225c86fb95c0ccddfd82af0a8060ba274dc4cfaf37',
'/tools/swishiq-studio/engine/career-simulator.js':'849b480398cb7c6b755be404ed17e822f7a817161e4d2d9a0f24ede353987079',
'/tools/swishiq-studio/engine/composite-forge-native.js':'31b673f18eef2daef06abf6c7219887d5e7fc3f00b34cc18c1d0ac48b8861966',
'/tools/swishiq-studio/engine/career-simulation-model.js':'cada921d478c3419e050830b1aa6ef0f665574091cd34b83513abfc0a9c440a1',
'/tools/swishiq-studio/engine/composite-forge.js':'3978b2a4e16ed4eff141d65d88985294cddcebd28acdf120a2e4e7759aed9999',
'/tools/swishiq-studio/engine/season-simulator.js':'7d3c87278313ed421d77e1f9e359917e54b52e8bcdb8b59d2bbfb5d7ad9cd1c9',
'/tools/swishiq-studio/engine/career-state-source.js':'0e63328ab000221e743c322bb064b4e5583b8bcb901568c599dc1d9888f1a5d8',
'/tools/swishiq-studio/engine/context-contract.js':'82528ef429143960f4d09531498e9c3419b591fc2fbe1517aef1d1f00961350f',
'/tools/result-passport.js':'f7837df1fae9d0db7acda901f3fd25cf6aa016d331ed595a86c69dd9a4e810f5',
'/tools/swishiq-studio/engine/studio-analysis.js':'3ed6c7f79c62de897a320f0cb24443d6768afea27c71fdc8d4731b2cd057e673',
'/tools/swishiq-studio/engine/model-calibration.js':'8c65825cf2c14791a87221feb0589457dc25addeb3ca4c984b7099a7820a9840',
'/tools/swishiq-studio/engine/canonical-v4-public-network-loader.js':'39e737644abc8c478bab692320710f0485cc5e52a107c829d1a6664eae495b78',
'/tools/swishiq-studio/engine/public-result-share-v4.js':'23ed314cf3acd0939ec52a932b1a281966517b96470de46f5b328e655d820233',
'/tools/swishiq-studio/engine/nba-cup-schedule-completion.js':'a7a16cf81e97053d8ec8e94cf7939b53cb7d58f0b57408b7db3d34e618a1ce29',
'/tools/swishiq-studio/engine/cross-lab-integration.js':'e2f422ae3a4428367dfeadeeddb71e85a0c6fcf0a8f2ab14d8810f96327da7c8',
'/tools/shared-result/public-keys.js':'6b28b48123a14ee8fcf876ad7d20f30039151e415dd9cb297508b7bcf529c0b6',
'/tools/swishiq-studio/engine/canonical-v4-site-consumer-policy.js':'922242f8f51ca906ef5de922bb596baac9465a7349d912fbe2a6c7cd59ceb311',
'/tools/swishiq-studio/engine/public-result-share-v2.js':'5740b923a2dc978b9c41d9454c48923130c8cf359f7cbd7bd7a20e7cc909ab08',
'/tools/swishiq-studio/engine/swishiq-daily-game-v4-contract.js':'30d3c3974455038dd50b317da4fc87d3c5be15fa1f4266b1e66146abda951152',
'/tools/swishiq-studio/engine/franchise-simulation.js':'f8037558beedcc96e9516f2f76be14fa001c32101c65a6dd2aa8c4095bc34908',
'/tools/swishiq-studio/engine/canonical-v4-descriptive-source-consumer.js':'b9b147f8835e1e1701d57872dfb3c663842dc35bd63dc3adea5d27ddfb2da7f4',
'/tools/swishiq-studio/engine/canonical-v4-identity.js':'75255673400de31557142a65038b7996ffc6496291869c4ea463322878bd4baf',
'/tools/swishiq-studio/engine/canonical-v4-player-name-identity.js':'d3503098c930d4800ca56fdee54f15e526f479a3a7819c1c632fa256c718d9b5',
'/tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js':'3f77681775b95b9fba42454d6ed62c785551cdd7db5a439babfbad9d753352bd',
'/tools/swishiq-studio/engine/franchise-cpu-rotation.js':'e5449eb414113949344be3bd4f4e9550672714536b149a4268dd7fea8c794a36',
'/tools/swishiq-studio/engine/canonical-v4-projection-resolver.js':'8225fde5b9b4b9a347069c724b7b28013fecc5f21c710db2b50623fbaf58332d',
'/tools/swishiq-studio/engine/canonical-v4-projection-capability-map.js':'7fb5ce6155135ac7ec9d1c7e5f6a7db5c6a78e329415698e86222d0696b7eee0',
'/tools/fan-tools.css':'ff6cc19670c6dbfa00fc4f6db493ad66194dbf378cf8af788892bd161b1a7cb3',
'/tools/swishiq-studio/studio.css':'40d6085552e5c5b612fb3cfcb4f6ffa21e223afa561309285e79c1bc2b4635a4',
'/tools/swishiq-studio/advanced-labs.css':'812a6a0bbb89a7cb480e393f2685880499d917ab79fe5789d8236fd2c562da5e',
'/tools/swishiq-studio/studio-redesign.css':'2da71cb7ad6f8bf622d61574e66a06095d1b1af25fb38328bc12d2a9998ac563',
'/tools/swishiq-studio/react-app/studio-react-labs.css':'b6ce918a75d0e50b1ec304997c3daeb03683318c94beb1e141d0254e4ffece5e'
};
const assets = new Map();
let cachedBytes = 0;
export async function readStudioNativeAsset(assetPath, options = {}) {
  if (typeof assetPath !== 'string' || assetPath.length > 700 || !assetPath.startsWith('/')) throw new Error('Invalid Studio asset request.');
  const url = new URL(assetPath, ORIGIN);
  const data = /^\/tools\/swishiq-studio\/data\/[a-zA-Z0-9_./-]+\.json$/.test(url.pathname);
  if (url.origin !== ORIGIN || (!PINS[url.pathname] && !data) || [...url.searchParams.keys()].some(key => !['v','rev'].includes(key))) throw new Error('This is not an approved public Studio asset.');
  const key = data ? url.pathname + url.search : url.pathname;
  if (assets.has(key)) return assets.get(key);
  // Pinned script assets are usually requested without a version query, so a
  // stale CDN cache entry can keep serving an old revision to some egress
  // paths. Bust the cache explicitly: the digest still gates the revision.
  const fetchUrl = data ? url.href : `${url.href}${url.search ? '&' : '?'}v=${PIN_CACHE_BUST}`;
  const response = await fetch(fetchUrl, { signal:AbortSignal.timeout(20000), redirect:'manual' });
  if (!response.ok) throw new Error(`The original Studio asset is unavailable (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Script bound accommodates the candidate74 Game Lab runtime (~2.2MB).
if (bytes.byteLength > (data ? 18 : 4) * 1024 * 1024) throw new Error('The Studio asset exceeds the bounded relay size.');
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('');
  const text = new TextDecoder().decode(bytes);
  if (!data && sha256 !== PINS[url.pathname]) {
    if (options?.reviewUnverified === true) return { text, sha256, sourceUrl: url.href, verified: false };
    throw new Error(`The original gameplay changed since the reviewed version (pinned ${PINS[url.pathname].slice(0, 12)}…, live ${sha256.slice(0, 12)}…); its new revision must be reviewed before loading.`);
  }
  if (data) JSON.parse(text);
  const result = { text,sha256,sourceUrl:url.href,contentType:data ? 'application/json' : url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' };
  while (assets.size && cachedBytes + bytes.byteLength > 24 * 1024 * 1024) { const oldest=assets.keys().next().value;cachedBytes-=assets.get(oldest).byteLength;assets.delete(oldest); }
  const cached = { ...result,byteLength:bytes.byteLength };
  assets.set(key,cached);cachedBytes+=bytes.byteLength;
  return result;
}