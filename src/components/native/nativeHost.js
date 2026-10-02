import { ORIGINAL_ORIGIN } from '@/components/native/nativeTransport';
export default function nativeHost(element,kind,entry,onYearChange) {
  const shadow=element.shadowRoot || element.attachShadow({mode:'open'});
  shadow.replaceChildren();
  const canvas=document.createElement('div');canvas.className='studio-native court-themed fan-tools-page swishiq-studio-page dark-mode';shadow.append(canvas);
  const scope=document.createElement('div');scope.id='studioApp';scope.className='swishiq-app-shell';canvas.append(scope);
  const controls=document.createElement('div');controls.hidden=true;
  for(const id of ['workbenchState','workspaceTitle','workspaceDescription','seasonLabSourceState','seasonLabSourceNote']){const status=document.createElement('span');status.id=id;status.dataset.state='checking';controls.append(status);}
  const tabs=document.createElement('nav');tabs.className='swishiq-tabs';const tab=document.createElement('button');tab.dataset.workbench=kind;tab.setAttribute('aria-pressed','true');tabs.append(tab);controls.append(tabs);
  const select=document.createElement('select');select.id='packageSelect';const option=document.createElement('option');option.value=`${entry.packageId}|${entry.packageVersion}|regular`;option.textContent=entry.packageId;select.append(option);controls.append(select);scope.append(controls);
  const panel=document.createElement('section');panel.id=`${kind}LabPanel`;panel.className='swishiq-native-panel';scope.append(panel);
  const local={getElementById:id=>shadow.getElementById(id),querySelector:query=>shadow.querySelector(query),querySelectorAll:query=>shadow.querySelectorAll(query),head:shadow,body:canvas,documentElement:canvas,baseURI:ORIGINAL_ORIGIN+'/tools/swishiq-studio/',get activeElement(){return shadow.activeElement;},addEventListener:scope.addEventListener.bind(scope),removeEventListener:scope.removeEventListener.bind(scope),dispatchEvent:scope.dispatchEvent.bind(scope)};
  const facade=new Proxy(document,{get(target,key){if(Object.prototype.hasOwnProperty.call(local,key))return local[key];const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  const reflectSeason=event=>{const value=event.target;if(!(value instanceof HTMLSelectElement)||value.id==='packageSelect')return;const match=/nba-swishiq-v3-(\d{4})-/.exec(value.value);if(match)onYearChange(Number(match[1]));};
  panel.addEventListener('change',reflectSeason,true);
  const observer=new MutationObserver(()=>{for(const image of panel.querySelectorAll('img[src]')){const url=new URL(image.getAttribute('src'),window.location.href);if(url.origin===window.location.origin&&url.pathname.startsWith('/assets/'))image.src=ORIGINAL_ORIGIN+url.pathname+url.search;}});observer.observe(panel,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  return {shadow,scope,panel,facade,dispose(){tab.setAttribute('aria-pressed','false');tab.click();select.remove();panel.removeEventListener('change',reflectSeason,true);observer.disconnect();shadow.replaceChildren();}};
}