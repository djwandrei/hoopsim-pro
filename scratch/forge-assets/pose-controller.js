/* Dependency-free turntable and interactive controls for the authored pose rig. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const canvas = byId('viewer');
  const panel = byId('pose-panel');
  const partSelect = byId('selected-part');
  const presetSelect = byId('basketball-preset');
  const playButton = byId('play');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const axes = ['x', 'y', 'z'];
  const rotationLabels = ['Bend', 'Twist', 'Side'];
  let angle = -.25, pitch = -.045, zoom = 1, paused = reducedMotion.matches, sculpted = false;
  let dragging = false, lastPointer = null, previousTime = 0, renderHandle = 0;
  let gl, program, uniforms, indexType, indexCount, model, rig, joints, weights, pose;
  let presetCatalog, presets;
  let globals = [], skinMatrices = [], shaderMatrices;
  let restBounds, posedBounds, center, fitExtents, selected = 6;
  let poseDirty = true, layoutDirty = true, viewport;
  let outfitGroups=[];
  const wardrobe=globalThis.SILHOUETTE_WARDROBE;
  const api = globalThis.SILHOUETTE_VIEWER = {
    ready: false,
    vertexCount: 0,
    triangleCount: 0,
    setAngle(value, vertical = -.045) {
      if (!Number.isFinite(value) || !Number.isFinite(vertical)) return;
      angle = value;
      pitch = clamp(vertical, -.65, .65);
      paused = true;
      updatePlay();
    },
    getAngle: () => angle,
    getPitch: () => pitch,
    get paused() { return paused; },
    setPaused(value) { paused = Boolean(value); updatePlay(); },
    get sculpted() { return sculpted; },
    setSculpted(value) { sculpted = Boolean(value); byId('shading').setAttribute('aria-pressed', String(sculpted)); },
    get zoom() { return zoom; },
    getPose: () => pose ? structuredClone(pose) : null,
    setPose: value => loadPose(value),
    setPreset: id => applyPreset(id),
    getPreset: () => pose ? pose.presetId : null,
    getPresets: () => presets ? Array.from(presets.values(),p=>({id:p.id,label:p.label,description:p.description})) : [],
    resetPose: () => resetPose(),
    setBoneRotation: (bone, values) => setBoneRotation(bone, values),
    setBoneTranslation: (bone, values) => setBoneTranslation(bone, values),
    setBallAttached: value => setBallAttached(Boolean(value)),
    setBallVisible: value => setBallVisible(Boolean(value)),
    selectBone(bone) { selected = boneIndex(bone); partSelect.value = String(selected); refreshFields(); },
    getBoneWorldPosition(bone) { updatePose(); const m = globals[boneIndex(bone)]; return [m[12], m[13], m[14]]; },
    getPosedVertex(index) { updatePose(); return posedVertex(index); },
    getPosedBounds() { updatePose(); return structuredClone(posedBounds); },
    getSkinMatrices() { updatePose(); return new Float32Array(shaderMatrices); },
    getClothing: () => wardrobe.getState(),
    getBodyColor: () => wardrobe.getBodyColor(),
    setBodyColor: value => wardrobe.setBodyColor(value),
    setClothing: (element,style) => wardrobe.setStyle(element,style),
    setUniform: (team,edition) => wardrobe.applyUniform(team,edition),
    exportOutfitGLB: () => wardrobe.exportGLB(),
    getAccessories: () => wardrobe.getAccessories(),
    setAccessories: value => wardrobe.setAccessories(value),
    getVisibleTriangleCount: () => outfitGroups.filter(group=>wardrobe.getDrawStyle(group.id)?.visible!==false&&(group.id!=='basketball'||pose.ballVisible)).reduce((sum,group)=>sum+group.triangleCount,0),
    setPanelVisible: value => showPanel(Boolean(value)),
    get viewport() { return viewport ? {...viewport} : null; }
  };
  globalThis.SILHOUETTE_POSE = api;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function notice(message) { byId('pose-notice').textContent = message; }
  function decode(encoded) {
    const raw = atob(encoded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
  function parseGLB(encoded) {
    const bytes = decode(encoded), view = new DataView(bytes.buffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('The model is not a valid GLB 2.0 asset.');
    let json, binary;
    for (let offset = 12; offset < bytes.byteLength;) {
      const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
      const chunk = bytes.subarray(offset + 8, offset + 8 + length);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
      if (type === 0x004e4942) binary = chunk;
      offset += length + 8;
    }
    if (!json || !binary) throw new Error('The model is missing its geometry data.');
    const primitive = json.meshes[0].primitives[0];
    function accessor(number) {
      const a = json.accessors[number], b = json.bufferViews[a.bufferView];
      const count = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
      const Constructor = {5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
      if (!Constructor || !count || b.byteStride) throw new Error('Packed geometry buffers are required.');
      const offset = binary.byteOffset + (b.byteOffset || 0) + (a.byteOffset || 0);
      return {array:new Constructor(bytes.buffer, offset, a.count * count),meta:a};
    }
    return {positions:accessor(primitive.attributes.POSITION),normals:accessor(primitive.attributes.NORMAL),indices:accessor(primitive.indices),bytes};
  }

  // Column-major matrices match both the exported inverse binds and GLSL.
  function identity() { return new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]); }
  function multiply(a, b) {
    const out = new Float64Array(16);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
      out[col*4+row] = a[row]*b[col*4] + a[4+row]*b[col*4+1] + a[8+row]*b[col*4+2] + a[12+row]*b[col*4+3];
    }
    return out;
  }
  function translation(x, y, z) { const out = identity(); out[12]=x; out[13]=y; out[14]=z; return out; }
  function rotation(axis, degrees) {
    const [x,y,z] = axis, radians = degrees*Math.PI/180, c=Math.cos(radians), s=Math.sin(radians), t=1-c;
    return new Float64Array([
      c+x*x*t,x*y*t+z*s,x*z*t-y*s,0,
      x*y*t-z*s,c+y*y*t,y*z*t+x*s,0,
      x*z*t+y*s,y*z*t-x*s,c+z*z*t,0,
      0,0,0,1
    ]);
  }
  function inverseRigid(m) {
    const out = identity();
    for (let col=0;col<3;col++) for(let row=0;row<3;row++) out[col*4+row]=m[row*4+col];
    out[12]=-(out[0]*m[12]+out[4]*m[13]+out[8]*m[14]);
    out[13]=-(out[1]*m[12]+out[5]*m[13]+out[9]*m[14]);
    out[14]=-(out[2]*m[12]+out[6]*m[13]+out[10]*m[14]);
    return out;
  }
  function transformPoint(m, p) {
    return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  }
  function calculateMatrices() {
    const visited = new Uint8Array(rig.bones.length);
    globals = new Array(rig.bones.length);
    function visit(index) {
      if (visited[index] === 2) return globals[index];
      if (visited[index] === 1) throw new Error('The pose rig contains a parent cycle.');
      visited[index] = 1;
      const bone = rig.bones[index];
      const parent = index === rig.ballIndex ? (pose.ballAttached ? rig.handIndex : 0) : bone.parent;
      const parentPivot = parent < 0 ? [0,0,0] : rig.bones[parent].pivot;
      const move = pose.translations[index], turn = pose.rotations[index];
      let local = translation(bone.pivot[0]-parentPivot[0]+move[0],bone.pivot[1]-parentPivot[1]+move[1],bone.pivot[2]-parentPivot[2]+move[2]);
      for (let axis=0;axis<3;axis++) local = multiply(local,rotation(bone.axes[axis],turn[axis]));
      globals[index] = parent < 0 ? local : multiply(visit(parent),local);
      skinMatrices[index] = multiply(globals[index],translation(-bone.pivot[0],-bone.pivot[1],-bone.pivot[2]));
      shaderMatrices.set(skinMatrices[index],index*16);
      visited[index] = 2;
      return globals[index];
    }
    for (let i=0;i<rig.bones.length;i++) visit(i);
  }
  function posedVertex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= api.vertexCount) throw new Error('Vertex index is out of range.');
    const p = model.positions.array, first=index*3, skin=index*4;
    const x=p[first], y=p[first+1], z=p[first+2];
    let px=0,py=0,pz=0;
    for (let influence=0;influence<4;influence++) {
      const weight=weights[skin+influence];
      if (weight===0) continue;
      const m=skinMatrices[joints[skin+influence]];
      px+=weight*(m[0]*x+m[4]*y+m[8]*z+m[12]);
      py+=weight*(m[1]*x+m[5]*y+m[9]*z+m[13]);
      pz+=weight*(m[2]*x+m[6]*y+m[10]*z+m[14]);
    }
    return [px,py,pz];
  }
  function updatePose() {
    if (!poseDirty || !rig) return;
    calculateMatrices();
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const p=model.positions.array;
    for(let vertex=0;vertex<api.vertexCount;vertex++) {
      if(!pose.ballVisible && vertex>=rig.ballRange.firstVertex && vertex<rig.ballRange.firstVertex+rig.ballRange.count)continue;
      const first=vertex*3, skin=vertex*4, x=p[first],y=p[first+1],z=p[first+2];
      let px=0,py=0,pz=0;
      for(let influence=0;influence<4;influence++) {
        const weight=weights[skin+influence];
        if(weight===0)continue;
        const m=skinMatrices[joints[skin+influence]];
        px+=weight*(m[0]*x+m[4]*y+m[8]*z+m[12]);
        py+=weight*(m[1]*x+m[5]*y+m[9]*z+m[13]);
        pz+=weight*(m[2]*x+m[6]*y+m[10]*z+m[14]);
      }
      min[0]=Math.min(min[0],px);min[1]=Math.min(min[1],py);min[2]=Math.min(min[2],pz);
      max[0]=Math.max(max[0],px);max[1]=Math.max(max[1],py);max[2]=Math.max(max[2],pz);
    }
    posedBounds={min,max};
    api.posedBounds=structuredClone(posedBounds);
    // Keep the original camera anchor so translating the root stays visible.
    fitExtents=min.map((value,i)=>Math.max(Math.abs(value-center[i]),Math.abs(max[i]-center[i]),Math.abs(restBounds.min[i]-center[i]),Math.abs(restBounds.max[i]-center[i])));
    poseDirty=false;
  }
  function changed() {
    poseDirty=true;
    paused=true;
    zoom=1;
    updatePlay();
  }
  function boneIndex(value) {
    const index=typeof value==='string' ? rig.bones.findIndex(b=>b.name===value) : value;
    if(!Number.isInteger(index)||index<0||index>=rig.bones.length)throw new Error('Unknown body part.');
    return index;
  }
  function triple(values) {
    if(!Array.isArray(values)||values.length!==3||!values.every(Number.isFinite))throw new Error('Part values must contain three finite numbers.');
    return values;
  }
  function setBoneRotation(bone, values) {
    const index=boneIndex(bone);triple(values);
    const base=activePreset().pose.rotations[index];
    pose.rotations[index]=values.map((v,i)=>clamp(v,base[i]+rig.bones[index].limits[i][0],base[i]+rig.bones[index].limits[i][1]));
    changed();refreshFields();
    return pose.rotations[index].slice();
  }
  function setBoneTranslation(bone, values) {
    const index=boneIndex(bone);triple(values);
    const limits=rig.bones[index].translationLimits;
    if(!limits)throw new Error('This part moves through rotation.');
    const base=activePreset().pose.translations[index];
    // A no-jump reparent can place the ball beyond its usual slider range.
    // Keep that existing offset available while another axis is adjusted.
    pose.translations[index]=values.map((v,i)=>clamp(v,
      index===rig.ballIndex?Math.min(base[i]+limits[i][0],pose.translations[index][i]):base[i]+limits[i][0],
      index===rig.ballIndex?Math.max(base[i]+limits[i][1],pose.translations[index][i]):base[i]+limits[i][1]));
    changed();refreshFields();
    return pose.translations[index].slice();
  }
  function setBallAttached(attached) {
    if(pose.ballAttached===attached)return;
    calculateMatrices();
    const old=globals[rig.ballIndex], world=[old[12],old[13],old[14]];
    const newParent=attached?rig.handIndex:0;
    const local=transformPoint(inverseRigid(globals[newParent]),world);
    const ballPivot=rig.bones[rig.ballIndex].pivot,parentPivot=rig.bones[newParent].pivot;
    // Reparenting preserves the ball center, even after the hand has moved.
    pose.translations[rig.ballIndex]=local.map((v,i)=>v-(ballPivot[i]-parentPivot[i]));
    pose.ballAttached=attached;
    changed();refreshFields();
    notice(attached?'The ball follows the right hand.':'The ball moves separately from the hand.');
  }
  function setBallVisible(visible) {
    pose.ballVisible=visible;changed();refreshFields();
  }
  function activePreset() { return presets.get(pose.presetId); }
  function initializePresets() {
    presetCatalog=globalThis.SILHOUETTE_PRESETS;
    if(!presetCatalog || presetCatalog.version!==1 || !Array.isArray(presetCatalog.presets))throw new Error('The basketball preset data is missing or invalid.');
    presets=new Map();
    for(const preset of presetCatalog.presets) {
      if(!preset || typeof preset.id!=='string' || !preset.id || presets.has(preset.id) || typeof preset.label!=='string' || typeof preset.description!=='string')throw new Error('The basketball preset catalog contains an invalid entry.');
      const value=preset.pose;
      if(!value || !Array.isArray(value.rotations) || !Array.isArray(value.translations) || value.rotations.length!==rig.bones.length || value.translations.length!==rig.bones.length || typeof value.ballAttached!=='boolean' || typeof value.ballVisible!=='boolean')throw new Error('A basketball preset does not contain a complete pose.');
      value.rotations.forEach(triple);value.translations.forEach(triple);
      presets.set(preset.id,structuredClone(preset));
    }
    if(!presets.has(presetCatalog.defaultId)||!presets.has('neutral'))throw new Error('The basketball presets need a default pose and neutral stance.');
    pose=presetPose(presetCatalog.defaultId);
  }
  function presetPose(id) {
    const preset=presets.get(id);
    if(!preset)throw new Error('Choose a known basketball preset.');
    return {...structuredClone(preset.pose),presetId:id,presetBase:structuredClone(preset.pose.rotations)};
  }
  function applyPreset(id) {
    pose=presetPose(id);changed();refreshFields();
    notice(`${activePreset().label} applied. Adjust a part to refine the pose.`);
    return api.getPose();
  }
  function loadPose(value) {
    if(!rig)throw new Error('The pose rig is still loading.');
    if(!value || typeof value.presetId!=='string' || !presets.has(value.presetId))throw new Error('This pose needs a known basketball preset.');
    if(!Array.isArray(value.rotations) || !Array.isArray(value.translations) || value.rotations.length!==rig.bones.length || value.translations.length!==rig.bones.length || typeof value.ballAttached!=='boolean' || typeof value.ballVisible!=='boolean')throw new Error('This file does not contain a complete pose.');
    if(value.sourceSha256 && value.sourceSha256!==rig.sourceSha256)throw new Error('This pose belongs to a different model.');
    const base=presets.get(value.presetId).pose;
    if(value.presetBase!==undefined) {
      if(!Array.isArray(value.presetBase)||value.presetBase.length!==rig.bones.length)throw new Error('The saved preset base is incomplete.');
      value.presetBase.forEach((values,index)=>{triple(values);if(values.some((v,i)=>Math.abs(v-base.rotations[index][i])>1e-6))throw new Error('The saved preset base does not match this viewer.');});
    }
    const next={rotations:[],translations:[],ballAttached:value.ballAttached,ballVisible:value.ballVisible,presetId:value.presetId,presetBase:structuredClone(base.rotations)};
    for(let index=0;index<rig.bones.length;index++) {
      triple(value.rotations[index]);triple(value.translations[index]);
      next.rotations.push(value.rotations[index].map((v,i)=>clamp(v,base.rotations[index][i]+rig.bones[index].limits[i][0],base.rotations[index][i]+rig.bones[index].limits[i][1])));
      // Saved ball offsets can exceed slider limits after a no-jump reparent.
      const limits=rig.bones[index].translationLimits;
      next.translations.push(value.translations[index].map((v,i)=>limits ? clamp(v,base.translations[index][i]+(index===rig.ballIndex?-5:limits[i][0]),base.translations[index][i]+(index===rig.ballIndex?5:limits[i][1])) : base.translations[index][i]));
    }
    pose=next;changed();refreshFields();
    return api.getPose();
  }
  function resetPose() {
    pose=presetPose(pose.presetId);
    changed();refreshFields();notice(`${activePreset().label} restored.`);
  }
  function refreshFields() {
    if(!rig||!pose)return;
    const bone=rig.bones[selected];
    const base=activePreset().pose;
    presetSelect.value=pose.presetId;
    byId('preset-caption').textContent=activePreset().description;
    axes.forEach((axis,i)=>{
      const input=byId('rotate-'+axis),output=byId('rotate-'+axis+'-value');
      input.min=base.rotations[selected][i]+bone.limits[i][0];input.max=base.rotations[selected][i]+bone.limits[i][1];input.value=pose.rotations[selected][i];
      input.setAttribute('aria-valuetext',`${pose.rotations[selected][i].toFixed(1)} degrees`);
      input.setAttribute('aria-label',`${bone.label} ${rotationLabels[i].toLowerCase()} rotation`);
      output.textContent=`${Number(pose.rotations[selected][i].toFixed(1))}°`;
    });
    for(const [prefix,index] of [['root',0],['ball',rig.ballIndex]])axes.forEach((axis,i)=>{
      const input=byId(prefix+'-position-'+axis),output=byId(prefix+'-position-'+axis+'-value');
      if(!input)return;
      const value=pose.translations[index][i],limits=rig.bones[index].translationLimits[i];
      input.min=Math.min(base.translations[index][i]+limits[0],Math.floor(value*100)/100);input.max=Math.max(base.translations[index][i]+limits[1],Math.ceil(value*100)/100);
      input.value=value;input.setAttribute('aria-valuetext',`${value.toFixed(2)} meters`);output.textContent=`${value.toFixed(2)} m`;
    });
    byId('ball-attached').checked=pose.ballAttached;
    byId('ball-visible').checked=pose.ballVisible;
    byId('ball-space-note').textContent=pose.ballAttached?'Offset from the hand.':'Offset from the original ball position.';
  }
  function setupControls() {
    presetSelect.replaceChildren();
    for(const preset of presets.values()){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.label;presetSelect.append(option);}
    presetSelect.addEventListener('change',()=>applyPreset(presetSelect.value));
    partSelect.replaceChildren();
    const groups=[['Body',[0,1,2,3,4,5]],['Right arm',[6,7,8]],['Left arm',[9,10,11]],['Right leg',[12,13,14]],['Left leg',[15,16,17]],['Right hand · fingers',[18,19,20,21,22]],['Left hand · fingers',[23,24,25,26,27]],['Prop',[rig.ballIndex]]];
    for(const [label,indices] of groups){
      const group=document.createElement('optgroup');group.label=label;
      for(const index of indices){const option=document.createElement('option');option.value=String(index);option.textContent=rig.bones[index].label;group.append(option);}
      partSelect.append(group);
    }
    partSelect.value=String(selected);
    for(const [prefix,index] of [['root',0],['ball',rig.ballIndex]]) {
      const target=byId(prefix==='root'?'root-translations':'ball-translations');
      axes.forEach((axis,i)=>{
        const row=document.createElement('div');row.className='slider-row';
        const label=document.createElement('label');label.htmlFor=prefix+'-position-'+axis;label.textContent=axis.toUpperCase();
        const input=document.createElement('input');input.id=label.htmlFor;input.type='range';input.step='.01';input.value='0';
        input.setAttribute('aria-label',`${prefix==='root'?'Whole model':'Basketball'} ${axis.toUpperCase()} position`);
        const output=document.createElement('output');output.id=input.id+'-value';output.htmlFor=input.id;output.textContent='0.00 m';
        input.addEventListener('input',()=>{const values=pose.translations[index].slice();values[i]=Number(input.value);setBoneTranslation(index,values);});
        row.append(label,input,output);target.append(row);
      });
    }
    panel.querySelectorAll('button,input,select').forEach(element=>element.disabled=false);
    partSelect.addEventListener('change',()=>{selected=Number(partSelect.value);paused=true;updatePlay();refreshFields();});
    axes.forEach((axis,i)=>byId('rotate-'+axis).addEventListener('input',()=>{const values=pose.rotations[selected].slice();values[i]=Number(byId('rotate-'+axis).value);setBoneRotation(selected,values);}));
    byId('reset-selected').addEventListener('click',()=>{
      pose.rotations[selected]=activePreset().pose.rotations[selected].slice();
      pose.translations[selected]=activePreset().pose.translations[selected].slice();
      changed();refreshFields();notice(`${rig.bones[selected].label} restored.`);
    });
    byId('reset-pose').addEventListener('click',resetPose);
    byId('ball-attached').addEventListener('change',event=>setBallAttached(event.target.checked));
    byId('ball-visible').addEventListener('change',event=>setBallVisible(event.target.checked));
    byId('export-pose').addEventListener('click',()=>{
      const saved={format:'basketball-silhouette-pose',version:3,sourceSha256:rig.sourceSha256,boneNames:rig.bones.map(b=>b.name),...api.getPose(),clothing:wardrobe.getState(),accessories:wardrobe.getAccessories(),bodyColor:wardrobe.getBodyColor()};
      const url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='basketball-pose.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      notice('Pose saved. Load the JSON file to restore it later.');
    });
    byId('import-pose').addEventListener('click',()=>byId('pose-file').click());
    byId('pose-file').addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file)return;
      try{
        if(file.size>1024*1024)throw new Error('Choose a pose JSON file smaller than 1 MB.');
        const saved=JSON.parse(await file.text());
        if(saved.format!=='basketball-silhouette-pose'||![2,3].includes(saved.version))throw new Error('Choose a pose saved from this viewer.');
        if(saved.accessories)wardrobe.validateAccessories(saved.accessories);
        if(saved.bodyColor!==undefined)wardrobe.validateBodyColor(saved.bodyColor);
        loadPose(saved);if(saved.clothing)await wardrobe.setState(saved.clothing);if(saved.accessories)wardrobe.setAccessories(saved.accessories);wardrobe.setBodyColor(saved.bodyColor??'#0c1112');notice('Saved pose, colors, clothing and accessories loaded.');
      }catch(error){notice('Could not load pose: '+error.message);}
      event.target.value='';
    });
    refreshFields();
  }
  function updatePlay() {
    playButton.setAttribute('aria-pressed',String(paused));
    byId('play-label').textContent=paused?'Play':'Pause';
    byId('play-icon').innerHTML=paused?'<path d="M5 3l8 5-8 5z"/>':'<path d="M4 3h3v10H4zM9 3h3v10H9z"/>';
  }
  function showPanel(show) {
    panel.hidden=!show;
    byId('toggle-pose').setAttribute('aria-expanded',String(show));
    layoutDirty=true;
  }
  function shader(type,source) {
    const result=gl.createShader(type);gl.shaderSource(result,source);gl.compileShader(result);
    if(!gl.getShaderParameter(result,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(result));
    return result;
  }
  function attribute(name,data,size,type) {
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,type,false,0,0);
  }
  function initialize() {
    if(!globalThis.SILHOUETTE_GLB||!globalThis.SILHOUETTE_RIG)throw new Error('Keep the athlete model, rig, presets, and pose controller beside this HTML file.');
    model=parseGLB(globalThis.SILHOUETTE_GLB);rig=globalThis.SILHOUETTE_RIG;
    if(rig.version!==1||rig.bones.length!==29||rig.vertexCount!==model.positions.meta.count)throw new Error('The pose rig does not match this model.');
    joints=decode(rig.jointsBase64);
    const weightBytes=decode(rig.weightsBase64);weights=new Float32Array(weightBytes.buffer);
    if(joints.length!==rig.vertexCount*4||weights.length!==rig.vertexCount*4)throw new Error('The pose rig has incomplete vertex weights.');
    shaderMatrices=new Float32Array(rig.bones.length*16);
    initializePresets();
    gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL is unavailable. Open this viewer in a browser with hardware acceleration enabled.');
    if(model.indices.meta.componentType===5125&&!gl.getExtension('OES_element_index_uint'))throw new Error('This browser cannot display the model’s index format.');
    if(gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)<rig.bones.length*4+4)throw new Error('This browser cannot fit the interactive pose rig.');
    const vertex=shader(gl.VERTEX_SHADER,`
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec4 aJoints;
      attribute vec4 aWeights;
      uniform mat4 uBones[29];
      uniform vec3 uCenter;
      uniform vec2 uView;
      uniform vec2 uRotation;
      uniform float uBallVisible;
      varying vec3 vNormal;
      varying vec3 vRest;
      vec3 orbit(vec3 p){
        float c=cos(uRotation.x),s=sin(uRotation.x);
        p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
        c=cos(uRotation.y);s=sin(uRotation.y);
        return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);
      }
      void main(){
        mat4 skin=aWeights.x*uBones[int(aJoints.x)]+aWeights.y*uBones[int(aJoints.y)]+aWeights.z*uBones[int(aJoints.z)]+aWeights.w*uBones[int(aJoints.w)];
        vec3 p=orbit((skin*vec4(aPosition,1.0)).xyz-uCenter);
        gl_Position=vec4(p.x/uView.x,p.y/uView.y,-p.z/20.0,1.0);
        if(aJoints.x>27.5&&uBallVisible<.5)gl_Position=vec4(2.0,2.0,2.0,1.0);
        vNormal=orbit(normalize(mat3(skin)*aNormal));
        vRest=aPosition;
      }
    `);
    const fragment=shader(gl.FRAGMENT_SHADER,`
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vRest;
      uniform float uSculpted;
      uniform float uElement;
      uniform float uArtwork;
      uniform vec3 uFabric;
      uniform vec3 uTrim;
      uniform sampler2D uDesign;
      uniform vec3 uBallCenter;
      float jerseyWidth(float y){
        if(y<1.245)return mix(.149,.174,clamp((y-1.024)/.221,0.0,1.0));
        if(y<1.515)return mix(.174,.197,(y-1.245)/.270);
        return mix(.197,.146,clamp((y-1.515)/.095,0.0,1.0));
      }
      void main(){
        vec3 n=normalize(vNormal);
        float light=.3+.7*max(0.0,dot(n,normalize(vec3(-.7,1.0,1.4))));
        vec3 black=uFabric;
        float boost=min(2.7,1.0/max(.001,max(black.r,max(black.g,black.b))));
        vec3 sculpted=black*boost*light+vec3(.022);
        vec3 color=mix(black,sculpted,uSculpted);
        if(uElement>4.5&&uElement<5.5){
          vec3 sphere=normalize(vRest-uBallCenter);
          vec2 uv=vec2(fract(-atan(sphere.z,sphere.x)/6.2831853),acos(clamp(sphere.y,-1.0,1.0))/3.1415927);
          color=uArtwork>.5?texture2D(uDesign,uv).rgb:vec3(.75,.33,.11);
          color*=.35+.65*max(0.0,dot(n,normalize(vec3(-.7,1.0,1.4))));
        }
        if((uElement>.5&&uElement<4.5)||uElement>9.5){
          color=uFabric;
          if(uElement<2.5){
            float t,u,rear;vec2 uv;
            if(uElement<1.5){
              t=clamp((1.612-vRest.y)/.583,0.0,1.0);u=clamp(.5+vRest.x/(2.0*jerseyWidth(vRest.y)),0.0,1.0);rear=1.0-step(.013,vRest.z);
            }else{
              t=clamp((1.049-vRest.y)/.353,0.0,1.0);u=clamp(.5+vRest.x/.410,0.0,1.0);rear=1.0-step(.005,vRest.z);
            }
            u=mix(u,1.0-u,rear);uv=vec2(u*.5+rear*.5,t);
            if(uArtwork>.5)color=texture2D(uDesign,uv).rgb;
            float trim=0.0;
            if(uElement<1.5){
              float neck=length(vec2(vRest.x/.068,(vRest.z-.014)/.065));
              trim=(1.0-smoothstep(.035,.12,abs(neck-1.0)))*step(1.55,vRest.y);
              trim=max(trim,(1.0-smoothstep(.003,.009,abs(abs(vRest.x)-.180)))*step(1.426,vRest.y));
              trim=max(trim,1.0-smoothstep(.002,.005,abs(vRest.y-1.042)));
            }else{
              trim=max(1.0-smoothstep(.007,.013,abs(vRest.y-1.029)),1.0-smoothstep(.004,.010,abs(vRest.y-.704)));
              trim=max(trim,step(.187,abs(vRest.x))*.65);
            }
            color=mix(color,uTrim,trim*.8);
          }else if(uElement<4.5){
            color=uArtwork>.5?texture2D(uDesign,vec2(.5,clamp(vRest.y/.23,0.0,1.0))).rgb:mix(uTrim,uFabric,smoothstep(.035,.057,vRest.y));
          }
          color*=.67+.33*max(0.0,dot(n,normalize(vec3(-.7,1.0,1.4))));
        }
        gl_FragColor=vec4(color,1.0);
      }
    `);
    program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const extras=globalThis.SILHOUETTE_OUTFIT.accessories||[];
    function combined(base,key,Constructor){const arrays=[base,...extras.map(part=>new Constructor(decode(part[key]).buffer))];const result=new Constructor(arrays.reduce((sum,a)=>sum+a.length,0));let at=0;for(const a of arrays){result.set(a,at);at+=a.length;}return result;}
    const renderPositions=combined(model.positions.array,'positionsBase64',Float32Array);
    attribute('aPosition',renderPositions,3,gl.FLOAT);attribute('aNormal',combined(model.normals.array,'normalsBase64',Float32Array),3,gl.FLOAT);
    attribute('aJoints',combined(joints,'jointsBase64',Uint8Array),4,gl.UNSIGNED_BYTE);attribute('aWeights',combined(weights,'weightsBase64',Float32Array),4,gl.FLOAT);
    const indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,model.indices.array,gl.STATIC_DRAW);
    indexType=model.indices.meta.componentType===5125?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT;indexCount=model.indices.array.length;
    uniforms={bones:gl.getUniformLocation(program,'uBones[0]'),center:gl.getUniformLocation(program,'uCenter'),view:gl.getUniformLocation(program,'uView'),rotation:gl.getUniformLocation(program,'uRotation'),ballVisible:gl.getUniformLocation(program,'uBallVisible'),sculpted:gl.getUniformLocation(program,'uSculpted')};
    for(const [key,name] of Object.entries({element:'uElement',artwork:'uArtwork',fabric:'uFabric',trim:'uTrim',design:'uDesign',ballCenter:'uBallCenter'}))uniforms[key]=gl.getUniformLocation(program,name);
    gl.uniform3fv(uniforms.ballCenter,rig.bones[rig.ballIndex].pivot);
    if(globalThis.SILHOUETTE_OUTFIT?.triangleCount!==indexCount/3||globalThis.SILHOUETTE_OUTFIT.sourceSha256!==rig.sourceSha256)throw new Error('The clothing surfaces do not match this model.');
    outfitGroups=[...globalThis.SILHOUETTE_OUTFIT.groups,...extras].map(group=>{
      const bytes=decode(group.indicesBase64),indices=new Uint32Array(bytes.buffer),buffer=gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
      return {...group,buffer,count:indices.length};
    });
    // A complete one-pixel texture also keeps untextured draws valid.
    const fallback=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,fallback);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);uniforms.fallbackTexture=fallback;
    wardrobe.initialize(gl).catch(error=>{byId('uniform-notice').textContent=error.message;});
    api.vertexCount=rig.vertexCount;api.renderVertexCount=renderPositions.length/3;api.triangleCount=indexCount/3;api.maximumTriangleCount=globalThis.SILHOUETTE_OUTFIT.maximumTriangleCount;api.boneCount=rig.bones.length;
    const points=model.positions.array,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<points.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],points[i+k]);max[k]=Math.max(max[k],points[i+k]);}
    restBounds={min,max};center=min.map((v,i)=>(v+max[i])*.5);api.bounds=structuredClone(restBounds);
    setupControls();
    // Choose the initial panel state once; later resizes preserve the user's choice.
    showPanel(!matchMedia('(max-width:650px)').matches);
    updatePose();
    const url=URL.createObjectURL(new Blob([model.bytes],{type:'model/gltf-binary'}));byId('glb-download').href=url;byId('glb-download').download='basketball-athlete.glb';
    byId('status').textContent=`${api.triangleCount.toLocaleString()} triangles · ${rig.bones.length} movable parts`;
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(247/255,246/255,241/255,1);
    api.ready=true;updatePlay();
    if(globalThis.ResizeObserver){const observer=new ResizeObserver(()=>{layoutDirty=true;});observer.observe(panel);observer.observe(document.querySelector('.header'));observer.observe(document.querySelector('.controls'));}
    renderHandle=requestAnimationFrame(render);
  }
  function updateViewport(ratio) {
    const rect=canvas.getBoundingClientRect(),header=document.querySelector('.header').getBoundingClientRect(),controls=document.querySelector('.controls').getBoundingClientRect();
    let left=18,right=rect.width-18,top=Math.max(18,header.bottom-rect.top+18),bottom=controls.top-rect.top-25;
    if(!panel.hidden){const pane=panel.getBoundingClientRect();if(rect.width<=650)bottom=Math.min(bottom,pane.top-rect.top-16);else left=Math.max(left,pane.right-rect.left+30);}
    const width=Math.max(80,right-left),height=Math.max(80,bottom-top);
    viewport={x:Math.round(left*ratio),y:Math.round((rect.height-bottom)*ratio),width:Math.round(width*ratio),height:Math.round(height*ratio),cssWidth:width,cssHeight:height};
    layoutDirty=false;
  }
  function render(time) {
    const delta=previousTime?Math.min((time-previousTime)/1000,.05):0;previousTime=time;
    if(!paused&&!dragging)angle+=delta*.28;
    updatePose();
    const ratio=Math.min(devicePixelRatio||1,2),width=Math.round(canvas.clientWidth*ratio),height=Math.round(canvas.clientHeight*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;layoutDirty=true;}
    if(layoutDirty)updateViewport(ratio);
    gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.viewport(viewport.x,viewport.y,viewport.width,viewport.height);gl.useProgram(program);
    const aspect=viewport.width/viewport.height,horizontal=Math.hypot(fitExtents[0],fitExtents[2]);
    const vertical=fitExtents[1]*Math.abs(Math.cos(pitch))+horizontal*Math.abs(Math.sin(pitch));
    const halfHeight=Math.max(vertical*1.12,horizontal*1.12/aspect)*zoom;
    gl.uniformMatrix4fv(uniforms.bones,false,shaderMatrices);gl.uniform3fv(uniforms.center,center);gl.uniform2f(uniforms.view,halfHeight*aspect,halfHeight);gl.uniform2f(uniforms.rotation,angle,pitch);gl.uniform1f(uniforms.sculpted,sculpted?1:0);
    gl.uniform1f(uniforms.ballVisible,pose.ballVisible?1:0);
    gl.activeTexture(gl.TEXTURE0);gl.uniform1i(uniforms.design,0);
    for(const group of outfitGroups){
      const style=wardrobe.getDrawStyle(group.id);
      if(style?.visible===false)continue;
      gl.uniform1f(uniforms.element,group.element);gl.uniform1f(uniforms.artwork,style?.artwork&&style.texture?1:0);
      gl.uniform3fv(uniforms.fabric,style?.color||[.047,.066,.070]);gl.uniform3fv(uniforms.trim,style?.trim||[.047,.066,.070]);
      gl.bindTexture(gl.TEXTURE_2D,style?.texture||uniforms.fallbackTexture);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,group.buffer);
      gl.drawElements(gl.TRIANGLES,group.count,gl.UNSIGNED_INT,0);
    }
    const status=`${api.getVisibleTriangleCount().toLocaleString()} triangles · ${rig.bones.length} movable parts`;
    if(byId('status').textContent!==status)byId('status').textContent=status;
    renderHandle=requestAnimationFrame(render);
  }

  playButton.addEventListener('click',()=>{paused=!paused;updatePlay();});
  byId('shading').addEventListener('click',()=>api.setSculpted(!sculpted));
  document.querySelectorAll('[data-angle]').forEach(button=>button.addEventListener('click',()=>api.setAngle(Number(button.dataset.angle),0)));
  byId('toggle-pose').addEventListener('click',()=>showPanel(panel.hidden));
  byId('close-pose').addEventListener('click',()=>{showPanel(false);byId('toggle-pose').focus();});
  byId('reset').addEventListener('click',()=>{angle=-.25;pitch=-.045;zoom=1;paused=true;updatePlay();});
  canvas.addEventListener('pointerdown',event=>{dragging=true;lastPointer={x:event.clientX,y:event.clientY};canvas.classList.add('dragging');canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!dragging||!lastPointer)return;angle+=(event.clientX-lastPointer.x)*.009;pitch=clamp(pitch+(event.clientY-lastPointer.y)*.005,-.65,.65);lastPointer={x:event.clientX,y:event.clientY};});
  function stopDrag(){dragging=false;lastPointer=null;canvas.classList.remove('dragging');}
  canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);canvas.addEventListener('lostpointercapture',stopDrag);
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=clamp(zoom*Math.exp(event.deltaY*.001),.66,1.8);},{passive:false});
  canvas.addEventListener('keydown',event=>{
    if(event.key===' '){event.preventDefault();paused=!paused;updatePlay();}
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();api.setAngle(angle+(event.key==='ArrowLeft'?-.1:.1),pitch);}
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();zoom=clamp(zoom+(event.key==='ArrowUp'?-.05:.05),.66,1.8);}
  });
  window.addEventListener('resize',()=>{layoutDirty=true;});
  document.addEventListener('visibilitychange',()=>{previousTime=0;});
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(renderHandle);renderHandle=0;});
  window.addEventListener('pageshow',()=>{if(api.ready&&!renderHandle){previousTime=0;renderHandle=requestAnimationFrame(render);}});
  try{initialize();}catch(error){
    api.error=error.message;byId('error').textContent=error.message;byId('error').hidden=false;byId('status').textContent='Preview unavailable';
    document.querySelectorAll('button,input,select').forEach(element=>element.disabled=true);console.error(error);
  }
})();
