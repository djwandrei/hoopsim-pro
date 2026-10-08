/* Independent wardrobe styles backed by the user's original 2025-26 images. */
(() => {
  'use strict';
  const catalog=globalThis.SILHOUETTE_UNIFORMS;
  const elements=['jersey','shorts','right-shoe','left-shoe'];
  const bodyElements=new Set(['body','head-neck','exposed-upper-body','right-arm','left-arm']);
  const designs=new Map(catalog.items.map(item=>[item.id,item]));
  const loads=new Map(),textures=new Map(),textureLoads=new Map(),atlases=new Map();
  let context,sequence=0,ballTexture;
  let bodyColor='#0c1112';
  let state=Object.fromEntries(elements.map(id=>[id,{team:null,edition:null,artwork:false,color:'#263b3b',trimColor:'#263b3b'}]));
  let accessories={headband:{visible:false,color:'#ffffff'},sleeves:{side:'none',color:'#ffffff'}};
  const byId=id=>document.getElementById(id);
  const rgb=hex=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)/255);
  const hex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
  function validateBodyColor(value){if(!hex(value))throw new Error('Choose a six-digit hexadecimal body color.');return value.toLowerCase();}
  function setBodyColor(value){bodyColor=validateBodyColor(value);byId('body-color').value=bodyColor;}
  function design(style){return style.team?designs.get(style.team+'-'+style.edition):null;}
  function validate(element,style){
    if(!elements.includes(element))throw new Error('Choose jersey, shorts, right-shoe or left-shoe.');
    if(!style||typeof style!=='object')throw new Error('A clothing style is required.');
    const next={...state[element],...style};
    if(next.team!==null&&!design(next))throw new Error('Unknown team or edition.');
    if(!hex(next.color)||!hex(next.trimColor)||typeof next.artwork!=='boolean')throw new Error('Use hexadecimal colors and an artwork boolean.');
    if(element.includes('shoe'))next.artwork=false;
    if(next.artwork&&!next.team)throw new Error('Choose a team design for uniform artwork.');
    return next;
  }
  function loadImage(id){
    if(loads.has(id))return loads.get(id);
    const item=designs.get(id);
    const promise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=item.script+'?v='+encodeURIComponent(catalog.referenceRevision||catalog.version);
      script.onload=()=>{
        const asset=globalThis.SILHOUETTE_UNIFORM_IMAGES?.[id];
        if(!asset){reject(new Error('The uniform artwork file is incomplete.'));return;}
        const read=url=>!url?Promise.resolve(null):new Promise((done,fail)=>{const image=new Image();image.onload=()=>done(image);image.onerror=()=>fail(new Error('The uniform image could not be decoded.'));image.src=url;});
        Promise.all([read(asset.image),read(asset.front),read(asset.back)]).then(([image,front,back])=>resolve({image,front,back,layout:asset.layout||{},url:asset.image})).catch(reject);
        script.remove();
      };
      script.onerror=()=>{script.remove();loads.delete(id);reject(new Error('Keep the uniform-assets folder beside index.html.'));};
      document.head.append(script);
    });loads.set(id,promise);return promise;
  }
  const textureKey=(element,style)=>[element,design(style)?.id,style.color,style.trimColor].join(':');
  async function atlas(element,style){
    const key=textureKey(element,style);
    if(!atlases.has(key))atlases.set(key,globalThis.SILHOUETTE_ATLAS.create(element,style,element.includes('shoe')?null:await loadImage(design(style).id)));
    return atlases.get(key);
  }
  async function texture(element,style){
    const key=textureKey(element,style);
    if(textures.has(key))return textures.get(key);
    if(textureLoads.has(key))return textureLoads.get(key);
    const loading=uploadTexture(element,style).finally(()=>textureLoads.delete(key));textureLoads.set(key,loading);return loading;
  }
  async function uploadTexture(element,style){
    const image=await atlas(element,style);
    if(image.width>context.getParameter(context.MAX_TEXTURE_SIZE))throw new Error('This device cannot display the uniform atlas resolution.');
    const value=context.createTexture();context.bindTexture(context.TEXTURE_2D,value);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MIN_FILTER,context.LINEAR);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MAG_FILTER,context.LINEAR);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_S,context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE);
    context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL,false);
    context.texImage2D(context.TEXTURE_2D,0,context.RGB,context.RGB,context.UNSIGNED_BYTE,image);
    textures.set(textureKey(element,style),value);return value;
  }
  async function initializeBasketball(){
    const image=await new Promise((resolve,reject)=>{
      const source=new Image();source.onload=()=>resolve(source);source.onerror=()=>reject(new Error('The basketball surface could not be decoded.'));
      source.src=globalThis.SILHOUETTE_BASKETBALL_SURFACE.uri;
    });
    const value=context.createTexture();context.bindTexture(context.TEXTURE_2D,value);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MIN_FILTER,context.LINEAR_MIPMAP_LINEAR);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MAG_FILTER,context.LINEAR);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_S,context.REPEAT);
    context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE);
    context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL,false);
    context.texImage2D(context.TEXTURE_2D,0,context.RGB,context.RGB,context.UNSIGNED_BYTE,image);
    context.generateMipmap(context.TEXTURE_2D);ballTexture=value;
  }
  function trimCache(){
    const active=new Set(elements.filter(id=>state[id].artwork||id.includes('shoe')).map(id=>textureKey(id,state[id])));
    for(const [id,value] of textures)if(!active.has(id)){context.deleteTexture(value);textures.delete(id);atlases.delete(id);}
    const used=new Set(elements.map(id=>design(state[id])?.id).filter(Boolean));
    for(const id of loads.keys())if(!used.has(id)){loads.delete(id);delete globalThis.SILHOUETTE_UNIFORM_IMAGES?.[id];}
  }
  async function commit(next){
    const revision=++sequence;
    await Promise.all(elements.filter(id=>next[id].artwork||id.includes('shoe')).map(id=>texture(id,next[id])));
    if(revision!==sequence)return false;
    state=next;trimCache();refresh();return true;
  }
  async function setStyle(element,style){
    return commit({...state,[element]:validate(element,style)});
  }
  async function applyUniform(team,edition='icon'){
    const item=designs.get(team+'-'+edition);if(!item)throw new Error('Unknown team uniform.');
    const next={
      jersey:{team,edition,artwork:true,color:item.primary,trimColor:item.accent},
      shorts:{team,edition,artwork:true,color:item.shorts,trimColor:item.accent},
      'right-shoe':{team,edition,artwork:false,color:'#303238',trimColor:item.primary},
      'left-shoe':{team,edition,artwork:false,color:'#303238',trimColor:item.primary}
    };
    return commit(next);
  }
  function refresh(){
    const target=byId('clothing-element')?.value;if(!target)return;
    const value=state[target];byId('uniform-team').value=value.team||'minnesota-timberwolves';
    byId('uniform-edition').value=value.edition||'icon';byId('clothing-color').value=value.color;
    byId('clothing-trim').value=value.trimColor;byId('clothing-artwork').checked=value.artwork;
    byId('clothing-artwork').disabled=target.includes('shoe');
    byId('clothing-color-label').textContent=target.includes('shoe')?'Shoe upper':'Fabric color';
    byId('clothing-trim-label').textContent=target.includes('shoe')?'Sole / accent':'Trim color';
  }
  function validateAccessories(value){
    const next={headband:{...accessories.headband,...value?.headband},sleeves:{...accessories.sleeves,...value?.sleeves}};
    if(typeof next.headband.visible!=='boolean'||!hex(next.headband.color)||!hex(next.sleeves.color)||!['none','right','left','both'].includes(next.sleeves.side))throw new Error('Choose valid accessory colors and a sleeve side.');
    return next;
  }
  function setAccessories(value){
    accessories=validateAccessories(value);
    byId('headband-visible').checked=accessories.headband.visible;byId('headband-color').value=accessories.headband.color;
    byId('sleeve-side').value=accessories.sleeves.side;byId('sleeve-color').value=accessories.sleeves.color;
  }
  async function action(fn){
    try{byId('uniform-notice').textContent='Loading design…';await fn();byId('uniform-notice').textContent='Clothing updated. Pose retained.';}
    catch(error){byId('uniform-notice').textContent=error.message;}
  }
  function setupControls(){
    byId('body-color').addEventListener('input',event=>setBodyColor(event.target.value));
    const team=byId('uniform-team');
    for(const item of catalog.teams){const option=document.createElement('option');option.value=item.id;option.textContent=item.label;team.append(option);}
    byId('clothing-element').addEventListener('change',refresh);
    byId('apply-uniform').addEventListener('click',()=>action(()=>applyUniform(team.value,byId('uniform-edition').value)));
    byId('apply-clothing').addEventListener('click',()=>action(()=>{
      const element=byId('clothing-element').value,item=designs.get(team.value+'-'+byId('uniform-edition').value);
      return setStyle(element,{team:team.value,edition:item.edition,artwork:!element.includes('shoe'),color:element==='shorts'?item.shorts:item.primary,trimColor:item.accent});
    }));
    for(const id of ['clothing-color','clothing-trim','clothing-artwork'])byId(id).addEventListener('input',()=>action(()=>setStyle(byId('clothing-element').value,{
      color:byId('clothing-color').value,trimColor:byId('clothing-trim').value,artwork:byId('clothing-artwork').checked})));
    byId('reset-clothing').addEventListener('click',()=>action(()=>commit(Object.fromEntries(elements.map(id=>[id,{team:null,edition:null,artwork:false,color:'#263b3b',trimColor:'#263b3b'}])))));
    byId('export-outfit').addEventListener('click',()=>action(async()=>{
      const bytes=await exportGLB();const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
      const link=document.createElement('a');link.href=url;link.download='basketball-athlete-styled.glb';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    for(const id of ['headband-visible','headband-color','sleeve-side','sleeve-color'])byId(id).addEventListener('input',()=>setAccessories({headband:{visible:byId('headband-visible').checked,color:byId('headband-color').value},sleeves:{side:byId('sleeve-side').value,color:byId('sleeve-color').value}}));
    setAccessories(accessories);refresh();
  }
  function decode(value){const raw=atob(value),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
  async function exportGLB(){
    const exportState=structuredClone(state),exportAccessories=structuredClone(accessories);
    const exportBodyColor=bodyColor;
    const bytes=decode(globalThis.SILHOUETTE_OUTFIT_GLB),view=new DataView(bytes.buffer),jsonLength=view.getUint32(12,true);
    const doc=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength))),binary=bytes.subarray(28+jsonLength);
    const imageIds=new Map();doc.images=doc.images||[];doc.textures=doc.textures||[];doc.samplers=doc.samplers||[];
    const sampler=doc.samplers.length;doc.samplers.push({magFilter:9729,minFilter:9729,wrapS:33071,wrapT:33071});
    for(const [index,mesh] of doc.meshes.entries()){
      const element=mesh.name,style=exportState[element];
      if(!style){
        if(bodyElements.has(element))doc.materials[index].pbrMetallicRoughness.baseColorFactor=[...rgb(exportBodyColor),1];
        if(element==='headband')doc.materials[index].pbrMetallicRoughness.baseColorFactor=[...rgb(exportAccessories.headband.color),1];
        if(element.endsWith('-sleeve'))doc.materials[index].pbrMetallicRoughness.baseColorFactor=[...rgb(exportAccessories.sleeves.color),1];
        continue;
      }
      const material=doc.materials[index],pbr=material.pbrMetallicRoughness;
      pbr.baseColorFactor=[...rgb(style.color),1];material.extras={element,style:structuredClone(style)};
      if(style.artwork||element.includes('shoe')){
        const key=textureKey(element,style);if(!imageIds.has(key)){
          const image=await atlas(element,style);imageIds.set(key,doc.textures.length);
          doc.images.push({name:key,uri:image.toDataURL('image/png')});doc.textures.push({sampler,source:doc.images.length-1});
        }
        pbr.baseColorFactor=[1,1,1,1];pbr.baseColorTexture={index:imageIds.get(key),texCoord:0};
      }
    }
    if(!doc.images.length){delete doc.images;delete doc.textures;delete doc.samplers;}
    doc.scenes[0].nodes=doc.scenes[0].nodes.filter(index=>{const name=doc.nodes[index].name;return name==='headband'?exportAccessories.headband.visible:name==='right-sleeve'?['right','both'].includes(exportAccessories.sleeves.side):name==='left-sleeve'?['left','both'].includes(exportAccessories.sleeves.side):true;});
    doc.asset.extras={...doc.asset.extras,wardrobe:exportState,accessories:exportAccessories,bodyColor:exportBodyColor,textureScope:catalog.artworkScope};
    const encoded=new TextEncoder().encode(JSON.stringify(doc)),padded=(encoded.length+3)&~3;
    const output=new Uint8Array(28+padded+binary.length),header=new DataView(output.buffer);
    header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,output.length,true);
    header.setUint32(12,padded,true);header.setUint32(16,0x4e4f534a,true);output.fill(32,20,20+padded);output.set(encoded,20);
    header.setUint32(20+padded,binary.length,true);header.setUint32(24+padded,0x004e4942,true);output.set(binary,28+padded);return output;
  }
  globalThis.SILHOUETTE_WARDROBE={
    getBodyColor:()=>bodyColor,setBodyColor,validateBodyColor,
    async initialize(gl){context=gl;setupControls();await Promise.all([initializeBasketball(),applyUniform('minnesota-timberwolves','icon')]);},
    getState:()=>structuredClone(state),setStyle,applyUniform,exportGLB,setAccessories,getAccessories:()=>structuredClone(accessories),validateAccessories,
    async setState(value){const next={};for(const element of elements)next[element]=validate(element,value[element]);return commit(next);},
    getDrawStyle(element){
      if(bodyElements.has(element))return {visible:true,color:rgb(bodyColor),artwork:false};
      if(element==='basketball')return {visible:true,color:[1,1,1],artwork:true,texture:ballTexture};
      if(element==='headband')return {visible:accessories.headband.visible,color:rgb(accessories.headband.color),artwork:false};
      if(element.endsWith('-sleeve'))return {visible:['both',element.startsWith('right')?'right':'left'].includes(accessories.sleeves.side),color:rgb(accessories.sleeves.color),artwork:false};
      const value=state[element],textured=value&&(value.artwork||element.includes('shoe'));
      return value?{visible:true,color:rgb(value.color),trim:rgb(value.trimColor),artwork:textured,texture:textured?textures.get(textureKey(element,value)):null}:null;
    }
  };
})();
