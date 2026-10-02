import { originalAsset, ORIGINAL_ORIGIN } from '@/components/native/nativeTransport';
import nativeTheme from '@/components/native/nativeTheme';
import nativeWorkbenchSkin from '@/components/native/nativeWorkbenchSkin';
import chemistrySkin from '@/components/native/chemistrySkin';
const FILES=['/tools/fan-tools.css','/tools/swishiq-studio/studio.css','/tools/swishiq-studio/advanced-labs.css','/tools/swishiq-studio/studio-redesign.css','/tools/swishiq-studio/react-app/studio-react-labs.css'];
export default async function nativeStyles(shadow) {
  const files=await Promise.all(FILES.map(path=>originalAsset(path)));
  for(const asset of files){const style=document.createElement('style');style.textContent=asset.text.replace(/url\((['"]?)\/(?!\/)/g,`url($1${ORIGINAL_ORIGIN}/`).replace(/\bbody(?=[.#\s,{:])/g,'.studio-native');if(asset.sourceUrl.includes('/studio-react-labs.css'))style.id='swishiq-studio-react-labs-stylesheet';shadow.append(style);}
  const skin=document.createElement('style');skin.textContent=nativeTheme+nativeWorkbenchSkin+chemistrySkin;shadow.append(skin);
}