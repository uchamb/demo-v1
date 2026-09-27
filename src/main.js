import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBuilding, createApartment, createSurroundings, BUILDING } from './models.js';

const $ = id => document.getElementById(id);
const viewport=$('viewport'), app=$('app');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
} catch(error) {
  $('loading').innerHTML='<span class="loading-mark">b.</span><p>Your browser could not start WebGL 2.</p><p>Enable hardware acceleration or try a current browser.</p>';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<761?1.5:1.75));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.97;
viewport.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#f2f1e9');scene.fog=new THREE.Fog('#f2f1e9',220,560);
const pmrem=new THREE.PMREMGenerator(renderer);
const room=new RoomEnvironment();const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.38;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#fffce9','#929d7d',1.5));
const sun=new THREE.DirectionalLight('#fff9e4',2.5);sun.position.set(-65,135,85);sun.castShadow=true;
sun.shadow.mapSize.set(innerWidth<761?1024:2048,innerWidth<761?1024:2048);
sun.shadow.camera.left=-95;sun.shadow.camera.right=95;sun.shadow.camera.top=140;sun.shadow.camera.bottom=-75;
sun.shadow.camera.near=.5;sun.shadow.camera.far=320;sun.shadow.normalBias=.12;sun.shadow.bias=-.00015;sun.shadow.radius=3;
scene.add(sun,sun.target);
const fill=new THREE.DirectionalLight('#e1e8db',1.1);fill.position.set(70,65,-75);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(2500,2500),new THREE.MeshStandardMaterial({color:'#e5e7d5',roughness:1}));
ground.rotation.x=-Math.PI/2;ground.position.y=-.62;ground.receiveShadow=true;scene.add(ground);
const building=createBuilding(),surroundings=createSurroundings();
scene.add(building.group,surroundings);
const apartmentModels=new Map([[3,createApartment({windows:3})],[4,createApartment({windows:4})]]);
for(const model of apartmentModels.values()){model.visible=false;scene.add(model);}
let currentApartment=apartmentModels.get(3);
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,1800);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.rotateSpeed=.5;controls.zoomSpeed=.65;
controls.autoRotateSpeed=.65;controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
const state={view:'building',selected:building.apartments.find(a=>a.id==='A-2002'),hovered:null,floor:null,transitioning:false};
let savedBuildingCamera=null,tween=null,dirty=true,activePointers=new Set(),downPoint=null,dragged=false;
const compactCard=matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)');
let cardCollapsed=true;
function isCardCollapsed(){return compactCard.matches&&cardCollapsed;}
function syncCard(){
 const collapsed=isCardCollapsed();
 app.dataset.cardCollapsed=String(collapsed);
 $('residence-details').hidden=collapsed;
 $('residence-toggle').disabled=!compactCard.matches||state.transitioning;
 $('residence-toggle').setAttribute('aria-expanded',String(!collapsed));
 $('residence-toggle').setAttribute('aria-label',collapsed?'Expand apartment details':'Collapse apartment details');
 $('card-toggle-label').textContent=collapsed?'Details':'Hide';
}
$('residence-toggle').addEventListener('click',()=>{
 if(state.transitioning||!compactCard.matches)return;
 const previousRadius=homePose(state.view).position.distanceTo(homePose(state.view).target);
 cardCollapsed=!cardCollapsed;syncCard();projection();
 const nextRadius=homePose(state.view).position.distanceTo(homePose(state.view).target);
 const offset=camera.position.clone().sub(controls.target).multiplyScalar(nextRadius/previousRadius);
 offset.setLength(THREE.MathUtils.clamp(offset.length(),controls.minDistance,controls.maxDistance));
 animatePose({target:controls.target.clone(),position:controls.target.clone().add(offset)},300);
});
compactCard.addEventListener('change',()=>{syncCard();projection();markDirty();});
syncCard();
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const highlightMaterial=new THREE.MeshBasicMaterial({color:'#b8d879',transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide});
const highlight=new THREE.Mesh(new THREE.PlaneGeometry(1,1),highlightMaterial);highlight.visible=false;highlight.renderOrder=5;scene.add(highlight);
const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1,1)),new THREE.LineBasicMaterial({color:'#76984f',transparent:true,opacity:.9,depthWrite:false}));
outline.renderOrder=6;highlight.add(outline);
const floorHighlights=[];
for(let i=0;i<4;i++){
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:'#abc584',transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}));
 mesh.visible=false;mesh.renderOrder=3;scene.add(mesh);floorHighlights.push(mesh);
}
function markDirty(){dirty=true;}
controls.addEventListener('change',()=>{markDirty();$('compass-needle').style.transform=`rotate(${-THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())}deg)`;});
controls.addEventListener('start',()=>{clearHover(); if(tween&&!state.transitioning)tween=null;});
function limits(view){
  if(view==='building'){
    // Exactly 90° of vertical travel, with a 22.5° margin away from the top pole.
    controls.minPolarAngle=Math.PI/8;controls.maxPolarAngle=5*Math.PI/8;
    controls.minDistance=35;controls.maxDistance=600;camera.near=.5;
  }else{
    controls.minPolarAngle=controls.maxPolarAngle=THREE.MathUtils.degToRad(48);
    controls.minDistance=12;controls.maxDistance=100;camera.near=.1;
  }
  camera.updateProjectionMatrix();
}
function homePose(view){
  const mobile=innerWidth<=760,aspect=innerWidth/innerHeight;
  if(view==='building'){
    const radius=Math.max(mobile?(isCardCollapsed()?340:440):220,BUILDING.height/(2*Math.tan(THREE.MathUtils.degToRad(18))*(mobile?(isCardCollapsed()?.50:.40):.75)),65/(2*Math.tan(THREE.MathUtils.degToRad(18))*aspect*.7));
    const target=new THREE.Vector3(0,51,0);
    return {target,position:target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius,THREE.MathUtils.degToRad(77),THREE.MathUtils.degToRad(30))))};
  }
  const radius=Math.max(31,17.5/(2*Math.tan(THREE.MathUtils.degToRad(18))*aspect*(mobile?.86:.65)));
  const target=new THREE.Vector3(0,.3,-.3);
  return {target,position:target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius,THREE.MathUtils.degToRad(48),THREE.MathUtils.degToRad(32))))};
}
function projection(){
  const w=viewport.clientWidth,h=viewport.clientHeight,mobile=w<=760;
  camera.aspect=w/h;
  camera.setViewOffset(w,h,-w*(mobile?(state.view==='building'?.055:0):.095),h*(mobile?(state.view==='building'?(isCardCollapsed()?-.025:.075):(isCardCollapsed()?0:.065)):0),w,h);
  camera.updateProjectionMatrix();
}
function stopMomentum(){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;}
function applyPose(pose){stopMomentum();controls.target.copy(pose.target);camera.position.copy(pose.position);controls.update();markDirty();}
function animatePose(pose,duration=750){
  stopMomentum();
  tween={from:camera.position.clone(),to:pose.position.clone(),fromTarget:controls.target.clone(),toTarget:pose.target.clone(),start:performance.now(),duration:reducedMotion?0:duration};
  markDirty();
}
limits('building');projection();applyPose(homePose('building'));
function resize(){
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<761?1.5:1.75));renderer.setSize(viewport.clientWidth,viewport.clientHeight);projection();
  if(state.view==='apartment')savedBuildingCamera=homePose('building');
  if(!state.transitioning){tween=null;applyPose(homePose(state.view));}
  renderer.shadowMap.needsUpdate=true;syncViewUI();markDirty();
}
window.addEventListener('resize',resize);
function displayApartment(apartment){
 $('apartment-title').textContent=`Residence ${apartment.id}`;
 $('apartment-area').innerHTML=`${apartment.area.toFixed(1)} <small>m²</small>`;
 $('card-summary').textContent=`${apartment.id} · Floor ${apartment.floor} · ${apartment.area.toFixed(1)} m²`;
 $('apartment-beds').textContent=apartment.bedrooms;$('apartment-floor').textContent=apartment.floor;
}
function updateSelectors(){
 $('floor-select').value=String(state.selected.floor);
 $('apartment-select').replaceChildren(...building.apartments.filter(a=>a.floor===state.selected.floor).sort((a,b)=>a.number-b.number).map(a=>new Option(a.id,a.id)));
 $('apartment-select').value=state.selected.id;
}
for(let floor=36;floor>=8;floor--) $('floor-select').add(new Option(String(floor),String(floor)));
for(const floor of [36,30,25,20,15,10,8]){
 const button=document.createElement('button');button.textContent=floor;button.setAttribute('aria-label',`Highlight floor ${floor}`);button.dataset.floor=floor;
 button.onclick=()=>selectFloor(floor);$('floor-stops').appendChild(button);
}
function selectFloor(floor){
 if(state.transitioning||state.view!=='building')return;
 state.floor=floor;
 state.selected=building.apartments.find(a=>a.floor===floor&&a.number===state.selected.number)||building.apartments.find(a=>a.floor===floor);
 updateSelectors();displayApartment(state.selected);showFloor();clearHover();
 const pose=homePose('building');pose.target.y=THREE.MathUtils.lerp(51,state.selected.y,.32);
 const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(homePose('building').position.distanceTo(homePose('building').target)*.91);
 pose.position.copy(pose.target).add(offset);animatePose(pose,550);
 $('announcement').textContent=`Floor ${floor} highlighted. Choose a residence on the model or from the residence selector.`;
}
function showFloor(){
 const visible=state.view==='building'&&state.floor!==null;
 floorHighlights.forEach((m,i)=>{
  m.visible=visible;
  if(!visible)return;
  const y=22+(state.floor-8)*2.8+1.5;
  if(i<2){m.position.set(0,y,i===0?9.33:-9.33);m.rotation.y=i===0?0:Math.PI;m.scale.set(28.8,2.61,1);}
  else{m.position.set(i===2?15.55:-15.55,y,0);m.rotation.y=i===2?Math.PI/2:-Math.PI/2;m.scale.set(15.6,2.61,1);}
 });
 $('all-floors').classList.toggle('active',state.floor===null);
 document.querySelectorAll('[data-floor]').forEach(b=>b.classList.toggle('active',Number(b.dataset.floor)===state.floor));markDirty();
}
$('all-floors').onclick=()=>{if(state.transitioning)return;state.floor=null;showFloor();animatePose(homePose('building'));};
$('floor-select').onchange=e=>selectFloor(Number(e.target.value));
$('apartment-select').onchange=e=>{
 state.selected=building.apartments.find(a=>a.id===e.target.value);displayApartment(state.selected);showHighlight(state.selected);
 const a=state.selected,target=new THREE.Vector3(0,THREE.MathUtils.lerp(51,a.y,.32),0),radius=homePose('building').position.distanceTo(homePose('building').target)*.91;
 const theta=a.side==='front'?.12:a.side==='back'?Math.PI+.12:a.side==='right'?Math.PI/2+.12:-Math.PI/2-.12;
 animatePose({target,position:target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius,THREE.MathUtils.degToRad(77),theta)))},700);
};
updateSelectors();displayApartment(state.selected);
function showHighlight(a){
 highlight.visible=state.view==='building';highlight.position.fromArray(a.center);highlight.rotation.y=a.rotation;highlight.scale.set(a.width-.12,2.61,1);
 highlight.position.add(new THREE.Vector3(0,0,.025).applyAxisAngle(new THREE.Vector3(0,1,0),a.rotation));markDirty();
}
function clearHover(){state.hovered=null;highlight.visible=false;$('hover-tooltip').hidden=true;viewport.style.cursor='grab';displayApartment(state.selected);markDirty();}
function pick(clientX,clientY){
 const r=renderer.domElement.getBoundingClientRect();pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
 raycaster.setFromCamera(pointer,camera);
 const hit=raycaster.intersectObjects(building.pickMeshes,false)[0];if(!hit)return null;
 const blocker=raycaster.intersectObjects(building.occluders,false)[0];
 if(blocker&&blocker.distance<hit.distance-.02)return null;
 return building.apartments.find(a=>a.id===hit.object.userData.apartmentId)||null;
}
let lastHoverTime=0;
viewport.addEventListener('pointermove',e=>{
 if(downPoint&&Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)>7)dragged=true;
 if(e.pointerType==='touch'||state.view!=='building'||state.transitioning||activePointers.size||tween)return;
 if(performance.now()-lastHoverTime<35)return;lastHoverTime=performance.now();
 const a=pick(e.clientX,e.clientY);
 if(a){
  state.hovered=a;showHighlight(a);displayApartment(a);viewport.style.cursor='pointer';
  const tip=$('hover-tooltip');tip.innerHTML=`${a.id}<small>Floor ${a.floor} · ${a.area} m² · ${a.windows} windows</small><small>Click to step inside ↗</small>`;tip.hidden=false;
  tip.style.left=`${Math.max(8,Math.min(innerWidth-tip.offsetWidth-12,e.clientX+18))}px`;
  tip.style.top=`${Math.max(8,Math.min(innerHeight-tip.offsetHeight-12,e.clientY+18))}px`;
 }else clearHover();
});
viewport.addEventListener('pointerdown',e=>{
 activePointers.add(e.pointerId);
 if(activePointers.size===1){downPoint={x:e.clientX,y:e.clientY};dragged=false;}
 else dragged=true;
});
window.addEventListener('pointerup',e=>{
 if(!activePointers.has(e.pointerId))return;
 const tap=activePointers.size===1&&!dragged&&downPoint&&Math.hypot(e.clientX-downPoint.x,e.clientY-downPoint.y)<7;
 activePointers.delete(e.pointerId);
 if(tap&&state.view==='building'&&!state.transitioning){const a=pick(e.clientX,e.clientY);if(a)enterApartment(a);}
 if(activePointers.size===0)downPoint=null;
});
window.addEventListener('pointercancel',e=>{activePointers.delete(e.pointerId);downPoint=null;dragged=true;clearHover();});
viewport.addEventListener('pointerleave',()=>{if(!activePointers.size)clearHover();});
window.addEventListener('blur',()=>{activePointers.clear();downPoint=null;dragged=true;clearHover();});
function setButtonsDisabled(disabled){$('residence-toggle').disabled=disabled||!compactCard.matches;for(const id of ['enter-button','building-view','apartment-view','back-button','floor-select','apartment-select','zoom-in','zoom-out','auto-rotate','reset-view','all-floors','export-model'])$(id).disabled=disabled;}
function syncViewUI(){
 syncCard();
 const interior=state.view==='apartment';app.dataset.view=state.view;
 $('view-title').innerHTML=interior?'Room to<br><em>make it yours.</em>':'A new<br><em>perspective.</em>';
 $('view-eyebrow').textContent=interior?`RESIDENCE ${state.selected.id} / FLOOR ${state.selected.floor}`:'BIOGRAPI / RESIDENCES';
 $('intro-copy').innerHTML=interior?'A closer look at your next chapter.<br>Thoughtful spaces, inside and out.':'Find a space that feels like you.<br>Explore the building. Step inside a home.';
 for(const id of ['project-meta','floor-panel','selection-controls','enter-button'])$(id).hidden=interior;
 $('back-button').hidden=!interior;$('interior-note').hidden=!interior;
 $('building-view').classList.toggle('active',!interior);$('apartment-view').classList.toggle('active',interior);
 $('building-view').setAttribute('aria-pressed',String(!interior));$('apartment-view').setAttribute('aria-pressed',String(interior));
 $('interaction-hint').innerHTML=innerWidth<761?'<span class="drag-icon">↔</span> Drag to rotate <b>·</b> Pinch to zoom':`<span class="drag-icon">↔</span> Drag to rotate <b>·</b> Scroll to zoom${interior?'':' <b>·</b> Select a home'}`;
 viewport.setAttribute('aria-label',interior?'3D furnished apartment. Drag horizontally to rotate 360 degrees. Scroll or pinch to zoom.':'Interactive 3D building. Drag to rotate, scroll or pinch to zoom. Select a residence to look inside.');
 displayApartment(state.selected);updateSelectors();showFloor();
}
function configureScene(interior){
 building.group.visible=!interior;surroundings.visible=!interior;
 for(const model of apartmentModels.values())model.visible=false;
 currentApartment=apartmentModels.get(state.selected.windows);currentApartment.visible=interior;
 ground.position.y=interior?-.40:-.62;
 sun.position.set(...(interior?[-10,24,15]:[-65,135,85]));
 sun.target.position.set(0,0,0);
 const sc=sun.shadow.camera;sc.left=interior?-13:-95;sc.right=interior?13:95;sc.top=interior?14:140;sc.bottom=interior?-13:-75;sc.far=interior?70:320;sc.updateProjectionMatrix();
 sun.shadow.normalBias=interior?.018:.12;sun.shadow.bias=interior?-.0001:-.00015;
 renderer.shadowMap.needsUpdate=true;
 scene.fog.near=interior?110:220;scene.fog.far=interior?250:560;
}
async function enterApartment(a){
 if(state.transitioning||state.view==='apartment')return;
 state.transitioning=true;setButtonsDisabled(true);state.selected=a;clearHover();controls.autoRotate=false;syncAutoRotate();
 controls.enabled=false;controls.update();savedBuildingCamera={position:camera.position.clone(),target:controls.target.clone()};
 const target=new THREE.Vector3(...a.center);
 const outward=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),a.rotation);
 animatePose({target,position:target.clone().addScaledVector(outward,39).add(new THREE.Vector3(0,8,0))},700);
 await delay(reducedMotion?0:680);await fade(1,240);
 tween=null;state.view='apartment';limits('apartment');configureScene(true);syncViewUI();projection();applyPose(homePose('apartment'));
 await fade(0,350);state.transitioning=false;controls.enabled=true;setButtonsDisabled(false);
 $('announcement').textContent=`Inside residence ${a.id}. Two bedrooms, ${a.windows} window bays. Drag horizontally to rotate. Press Escape to return.`;
 if(document.activeElement?.id==='enter-button')$('back-button').focus({preventScroll:true});
}
async function backToBuilding(){
 if(state.transitioning||state.view!=='apartment')return;
 state.transitioning=true;setButtonsDisabled(true);controls.enabled=false;controls.autoRotate=false;syncAutoRotate();
 await fade(1,220);tween=null;state.view='building';limits('building');configureScene(false);syncViewUI();projection();applyPose(savedBuildingCamera||homePose('building'));
 await fade(0,350);state.transitioning=false;controls.enabled=true;setButtonsDisabled(false);showHighlight(state.selected);
 $('announcement').textContent='Returned to building view.';
 if(document.activeElement?.id==='back-button')$('enter-button').focus({preventScroll:true});
}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function fade(opacity,duration){
 const veil=$('transition-veil');
 const animation=veil.animate([{opacity:getComputedStyle(veil).opacity},{opacity}],{duration:reducedMotion?0:duration,fill:'forwards',easing:'ease-in-out'});
 await animation.finished;veil.style.opacity=String(opacity);animation.cancel();markDirty();
}
$('enter-button').onclick=() => enterApartment(state.selected);
$('apartment-view').onclick=() => enterApartment(state.selected);
$('back-button').onclick=backToBuilding;$('building-view').onclick=backToBuilding;
function zoom(factor){
 if(state.transitioning)return;
 const offset=camera.position.clone().sub(controls.target),distance=THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance);
 animatePose({target:controls.target.clone(),position:controls.target.clone().add(offset.setLength(distance))},180);
}
$('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.25);
function syncAutoRotate(){ $('auto-rotate').setAttribute('aria-pressed',String(controls.autoRotate));$('auto-rotate').setAttribute('aria-label',controls.autoRotate?'Stop automatic rotation':'Start automatic rotation'); }
$('auto-rotate').onclick=()=>{if(state.transitioning)return;controls.autoRotate=!controls.autoRotate;syncAutoRotate();markDirty();};
$('reset-view').onclick=()=>{
 if(state.transitioning)return;
 controls.autoRotate=false;syncAutoRotate();clearHover();state.floor=null;showFloor();animatePose(homePose(state.view));
};
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!$('reference-dialog').open)backToBuilding();
 if(document.activeElement!==viewport||state.transitioning)return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Enter'].includes(e.key))e.preventDefault();
 if(e.key==='Enter'&&state.view==='building')enterApartment(state.selected);
 if(e.key==='+'||e.key==='=')zoom(.9);if(e.key==='-')zoom(1.1);
 if(e.key.startsWith('Arrow')){
  tween=null;stopMomentum();
  const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  if(e.key==='ArrowLeft')spherical.theta-=.12;if(e.key==='ArrowRight')spherical.theta+=.12;
  if(e.key==='ArrowUp')spherical.phi-=.08;if(e.key==='ArrowDown')spherical.phi+=.08;
  spherical.phi=THREE.MathUtils.clamp(spherical.phi,controls.minPolarAngle,controls.maxPolarAngle);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();markDirty();
 }
});
$('reference-button').onclick=()=>{controls.autoRotate=false;syncAutoRotate();$('reference-dialog').showModal();};
$('close-reference').onclick=()=>$('reference-dialog').close();
$('reference-dialog').addEventListener('click',e=>{if(e.target===$('reference-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
async function exportModel(kind=state.view){
 const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
 const model=kind==='building'?building.group:currentApartment;
 // GLB preserves EXT_mesh_gpu_instancing and apartment metadata in extras.
 return new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:false});
}
$('export-model').onclick=async()=>{
 $('export-model').disabled=true;$('export-status').textContent='Preparing your model…';
 try{const result=await exportModel();const blob=new Blob([result],{type:'model/gltf-binary'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`biograpi-${state.view}.glb`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('export-status').textContent='Model downloaded. Compatible with Three.js GLTFLoader.';}
 catch(error){console.error(error);$('export-status').textContent='Export failed. Please try again.';}
 finally{$('export-model').disabled=false;}
};
let previousTime=performance.now();
function frame(now){
 requestAnimationFrame(frame);
 if(document.hidden)return;
 const dt=Math.min((now-previousTime)/1000,.05);previousTime=now;
 if(tween){
  const t=tween.duration?Math.min((now-tween.start)/tween.duration,1):1;
  const k=t*t*(3-2*t);camera.position.lerpVectors(tween.from,tween.to,k);controls.target.lerpVectors(tween.fromTarget,tween.toTarget,k);
  if(t===1)tween=null;dirty=true;
 }
 controls.update(dt);
 if(dirty||controls.autoRotate||tween){
  scene.fog.near=state.view==='building'?controls.getDistance()*.98:110;scene.fog.far=scene.fog.near+300;
  renderer.render(scene,camera);dirty=false;
 }
}
syncViewUI();renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);$('loading').classList.add('loaded');requestAnimationFrame(frame);
// Read-only diagnostics plus model export are useful for validating the standalone prototype.
// No account, API or production data is used by this demo.
window.biograpiDemo={
 get state(){return {view:state.view,selected:state.selected.id,hovered:state.hovered?.id||null,transitioning:state.transitioning,cameraAnimating:Boolean(tween),floor:state.floor};},
 get stats(){return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,apartments:building.apartments.length,pixelRatio:renderer.getPixelRatio(),polar:controls.getPolarAngle(),azimuth:controls.getAzimuthalAngle(),minPolar:controls.minPolarAngle,maxPolar:controls.maxPolarAngle,minDistance:controls.minDistance,distance:controls.getDistance()};},
 projectApartment(id){const a=building.apartments.find(a=>a.id===id);if(!a)return null;camera.updateMatrixWorld();const v=new THREE.Vector3(...a.center).project(camera);return {x:(v.x+1)*viewport.clientWidth/2,y:(1-v.y)*viewport.clientHeight/2,visible:Math.abs(v.x)<1&&Math.abs(v.y)<1};},
 exportModel,
};
