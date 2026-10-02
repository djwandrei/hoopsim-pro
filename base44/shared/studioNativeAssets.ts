const ORIGIN = 'https://www.djshouseofcards-comics.com';
const PINS = {
'/tools/swishiq-studio/react-game-lab-bridge.js':'454d6bf83845110faf2f8127d1eaef536a1c04389225d50b28fbe3f71d818f62',
'/tools/swishiq-studio/react-season-lab-bridge.js':'14da808b2c58c53018d37db338141069ddb1a643357e657f11551f138b38b488',
'/tools/swishiq-studio/simulation-session-ui.js':'2e8296fa24d45652453fae4673a5287a50cda42a9bf5dd8d2701f5906d3fe5f8',
'/tools/swishiq-studio/game-lab.js':'33d28cf75b02b5db5ff5325b6932d24ae75fe668fd946e52b649446fb232eaa6',
'/tools/swishiq-studio/season-lab.js':'15aebe98766d4ed4c2a60eb445a5a57af1a4f8d25250253c2c19b6c40e4aea90',
'/tools/swishiq-studio/chemistry-lab.js':'3bafe94ca99a5e061a6a76d1e06caef538b4ca08951df2ccbf656dc6df125d37',
'/tools/swishiq-studio/advanced-labs.js':'e3310e1cb80ebc982ee66a56d3f0396d693489c5fc977c8cefab4050fd8d3fba',
'/tools/swishiq-studio/engine/game-lab-evaluation.js':'01ecbe66fe28823aae1212a848a3eb35e4b1a938a9ade6f2868d3c79f1376022',
'/tools/result-visuals.js':'a92079689f46f911ad883c201cc78c670987ef4c8aee1504278d13cbd1c01255',
'/tools/swishiq-studio/engine/simulation-seed.js':'503d60d1eea095a17c71cdf78132d19f243e195f410f3c43cf09146c1ab4e21a',
'/tools/swishiq-studio/engine/possession-simulator.js':'045e5cbe444cf058eb91bf80a2047a4489d71ce623e1b790dfc833623e29c254',
'/tools/swishiq-studio/engine/public-result-share.js':'8c681c8163528ca7475623eb33d4c8a929f491923bc82482b88a6526f6f6f18a',
'/tools/swishiq-studio/engine/season-lab-model.js':'44920d1387b47d723c7b56e22d16103f5428c8ac6d3ec127cda92cc02ddc9450',
'/tools/swishiq-studio/react-app/studio-react-labs.js':'255cd8302e7265d0651c704a51ad24efca140f432d96f3713e2def4c6a01103b',
'/tools/swishiq-studio/integration-bridge.js':'e76e48a81ddcaf54ec86dd6904ef98cdb9797136ed028e6f03e6f9a3fe251cfd',
'/tools/swishiq-studio/engine/nba-schedule-source.js':'c2db12f4760563c1fa92df0bc0acd204e6f047059a4829e2b8f5bfb6c7cece00',
'/tools/swishiq-studio/engine/public-result-share-client.js':'a82d0465b6dceecdda83ffc003107e6c341287b16f322818ca5e08e4d5f1973a',
'/tools/swishiq-static-projection.js':'9bbd381a8d7fb98c7b93ab8ceac8990a0e2cc6a21b945f43c6d9933e22d35f3c',
'/tools/swishiq-studio/engine/league-lab.js':'b550c932ca4974b090460dfb4cbae3eeca3351c4a353ba64761203930f0d547a',
'/tools/swishiq-studio/player-metadata.js':'287fe6f4ca79a475c54aef4fb4ed4d2ee0cd2e40d351292ea0c25890733a4310',
'/tools/swishiq-studio/engine/canonical-v4-studio-runtime-adapter.js':'fbcf73cd5fecdf14ec5fa08bf7a27869b5127a3cdd045b1f8d8605e62cb23382',
'/tools/swishiq-studio/player-context.js':'db082355d4c6a6134f1d11e8f164e0088c8089adfc3e971ac02b6c9c1046f60e',
'/tools/swishiq-studio/selector-system.js':'2958ec6adfe44eb3ebb4cd19af74970150b4058dae426b5e03ce190ad0480d62',
'/tools/swishiq-studio/composite-public-result-share.js':'4af385f6b7fcdd1dbb6f0fba1673698b76de3c29cd4c209c61ebf0aac98f474b',
'/tools/swishiq-studio/engine/career-simulator.js':'849b480398cb7c6b755be404ed17e822f7a817161e4d2d9a0f24ede353987079',
'/tools/swishiq-studio/engine/composite-forge-native.js':'4288a69d405ea2fbfa666592b14cf055f920eab156a57a2f6eac7d9048baba65',
'/tools/swishiq-studio/engine/career-simulation-model.js':'cada921d478c3419e050830b1aa6ef0f665574091cd34b83513abfc0a9c440a1',
'/tools/swishiq-studio/engine/composite-forge.js':'a1e7356524adb0d948ba611ae2e5043c10ee91a8a344c66bc5939e397045fd95',
'/tools/swishiq-studio/engine/season-simulator.js':'7d3c87278313ed421d77e1f9e359917e54b52e8bcdb8b59d2bbfb5d7ad9cd1c9',
'/tools/swishiq-studio/engine/career-state-source.js':'0e63328ab000221e743c322bb064b4e5583b8bcb901568c599dc1d9888f1a5d8',
'/tools/swishiq-studio/engine/context-contract.js':'82528ef429143960f4d09531498e9c3419b591fc2fbe1517aef1d1f00961350f',
'/tools/result-passport.js':'f7837df1fae9d0db7acda901f3fd25cf6aa016d331ed595a86c69dd9a4e810f5',
'/tools/swishiq-studio/engine/studio-analysis.js':'3ed6c7f79c62de897a320f0cb24443d6768afea27c71fdc8d4731b2cd057e673',
'/tools/swishiq-studio/engine/model-calibration.js':'8c65825cf2c14791a87221feb0589457dc25addeb3ca4c984b7099a7820a9840',
'/tools/swishiq-studio/engine/canonical-v4-public-network-loader.js':'260f31a7e3825229bd216180094fb9a45ab9a24d5a908078dc8048cace948142',
'/tools/swishiq-studio/engine/public-result-share-v4.js':'23ed314cf3acd0939ec52a932b1a281966517b96470de46f5b328e655d820233',
'/tools/swishiq-studio/engine/nba-cup-schedule-completion.js':'a7a16cf81e97053d8ec8e94cf7939b53cb7d58f0b57408b7db3d34e618a1ce29',
'/tools/swishiq-studio/engine/cross-lab-integration.js':'e2f422ae3a4428367dfeadeeddb71e85a0c6fcf0a8f2ab14d8810f96327da7c8',
'/tools/shared-result/public-keys.js':'6b28b48123a14ee8fcf876ad7d20f30039151e415dd9cb297508b7bcf529c0b6',
'/tools/swishiq-studio/engine/canonical-v4-site-consumer-policy.js':'f23bc69ebb67971c4b4319dafd6e0a9593dd3b704bd3b03d14fa2272e6a3215e',
'/tools/swishiq-studio/engine/public-result-share-v2.js':'5740b923a2dc978b9c41d9454c48923130c8cf359f7cbd7bd7a20e7cc909ab08',
'/tools/swishiq-studio/engine/swishiq-daily-game-v4-contract.js':'71a4700d8c9e31d0dd3a7bf2db1e4225a2f91fb7dbfe2718144949b31e36c498',
'/tools/swishiq-studio/engine/franchise-simulation.js':'f8037558beedcc96e9516f2f76be14fa001c32101c65a6dd2aa8c4095bc34908',
'/tools/swishiq-studio/engine/canonical-v4-descriptive-source-consumer.js':'a1cd8ebc8679b47e1f688be72072d6a8eae1f110bdb66b8fdb7dd8dd4c3350d5',
'/tools/swishiq-studio/engine/canonical-v4-identity.js':'75255673400de31557142a65038b7996ffc6496291869c4ea463322878bd4baf',
'/tools/swishiq-studio/engine/canonical-v4-player-name-identity.js':'d3503098c930d4800ca56fdee54f15e526f479a3a7819c1c632fa256c718d9b5',
'/tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js':'3f77681775b95b9fba42454d6ed62c785551cdd7db5a439babfbad9d753352bd',
'/tools/swishiq-studio/engine/franchise-cpu-rotation.js':'e5449eb414113949344be3bd4f4e9550672714536b149a4268dd7fea8c794a36',
'/tools/swishiq-studio/engine/canonical-v4-projection-resolver.js':'523b21fccaf59fa59c006ebfc78c39b91d594b3bc63a7155f4c3fcc1a7a3becf',
'/tools/swishiq-studio/engine/canonical-v4-projection-capability-map.js':'7fb5ce6155135ac7ec9d1c7e5f6a7db5c6a78e329415698e86222d0696b7eee0',
'/tools/fan-tools.css':'ff6cc19670c6dbfa00fc4f6db493ad66194dbf378cf8af788892bd161b1a7cb3',
'/tools/swishiq-studio/studio.css':'40d6085552e5c5b612fb3cfcb4f6ffa21e223afa561309285e79c1bc2b4635a4',
'/tools/swishiq-studio/advanced-labs.css':'812a6a0bbb89a7cb480e393f2685880499d917ab79fe5789d8236fd2c562da5e',
'/tools/swishiq-studio/studio-redesign.css':'2da71cb7ad6f8bf622d61574e66a06095d1b1af25fb38328bc12d2a9998ac563',
'/tools/swishiq-studio/react-app/studio-react-labs.css':'b6ce918a75d0e50b1ec304997c3daeb03683318c94beb1e141d0254e4ffece5e'
};
const assets = new Map();
let cachedBytes = 0;
export async function readStudioNativeAsset(assetPath) {
  if (typeof assetPath !== 'string' || assetPath.length > 700 || !assetPath.startsWith('/')) throw new Error('Invalid Studio asset request.');
  const url = new URL(assetPath, ORIGIN);
  const data = /^\/tools\/swishiq-studio\/data\/[a-zA-Z0-9_./-]+\.json$/.test(url.pathname);
  if (url.origin !== ORIGIN || (!PINS[url.pathname] && !data) || [...url.searchParams.keys()].some(key => !['v','rev'].includes(key))) throw new Error('This is not an approved public Studio asset.');
  const key = data ? url.pathname + url.search : url.pathname;
  if (assets.has(key)) return assets.get(key);
  const response = await fetch(url.href, { signal:AbortSignal.timeout(20000), redirect:'manual' });
  if (!response.ok) throw new Error(`The original Studio asset is unavailable (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > (data ? 18 : 2) * 1024 * 1024) throw new Error('The Studio asset exceeds the bounded relay size.');
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('');
  if (!data && sha256 !== PINS[url.pathname]) throw new Error('The original gameplay changed since the reviewed version; its new revision must be reviewed before loading.');
  const text = new TextDecoder().decode(bytes);
  if (data) JSON.parse(text);
  const result = { text,sha256,sourceUrl:url.href,contentType:data ? 'application/json' : url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' };
  while (assets.size && cachedBytes + bytes.byteLength > 24 * 1024 * 1024) { const oldest=assets.keys().next().value;cachedBytes-=assets.get(oldest).byteLength;assets.delete(oldest); }
  const cached = { ...result,byteLength:bytes.byteLength };
  assets.set(key,cached);cachedBytes+=bytes.byteLength;
  return result;
}