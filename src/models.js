import * as THREE from 'three';

export const BUILDING = Object.freeze({ firstFloor: 8, lastFloor: 36, floorHeight: 2.8, podiumHeight: 22, width: 28.8, depth: 15.2, height: 108.4 });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
const coneGeometry = new THREE.ConeGeometry(1, 1, 7);
const materials = new Map();
function material(color, options = {}) {
  const key = JSON.stringify([color, options]);
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .78, ...options }));
  return materials.get(key);
}
const M = {
  white: material('#e4e4d5'), cream: material('#deded0'), edge: material('#b9beb0'),
  glass: material('#6e8582', { metalness: .35, roughness: .3 }), glassLight: material('#a1b1a5', { metalness: .25, roughness: .32 }),
  glassDark: material('#485f5d', { metalness: .3, roughness: .33 }), frame: material('#4e5c52'),
  rail: material('#b0c0b7', { transparent: true, opacity: .38, roughness: .25, depthWrite: false }),
  stone: material('#cdcdbb'), dark: material('#37483d'), oak: material('#aa8c66'),
  leaf: material('#829465', { flatShading: true }), leafLight: material('#a5af7e', { flatShading: true }),
  leafDark: material('#637e55', { flatShading: true }), trunk: material('#867961'),
};

// Repeated components share geometry and material, so thousands of windows and
// rail posts are drawn in a handful of instanced batches. Dimensions are metres.
class Batches {
  constructor(root) { this.root = root; this.batches = new Map(); }
  add(geometry, mat, x, y, z, sx, sy, sz, ry = 0) {
    const key = geometry.uuid + mat.uuid;
    if (!this.batches.has(key)) this.batches.set(key, { geometry, mat, transforms: [] });
    this.batches.get(key).transforms.push([x, y, z, sx, sy, sz, ry]);
  }
  box(mat, x, y, z, sx, sy, sz, ry = 0) { this.add(boxGeometry, mat, x, y, z, sx, sy, sz, ry); }
  cylinder(mat, x, y, z, radius, height) { this.add(cylinderGeometry, mat, x, y, z, radius, height, radius); }
  flush() {
    const dummy = new THREE.Object3D();
    for (const { geometry, mat, transforms } of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(geometry, mat, transforms.length);
      mesh.name = `Batched ${geometry.type} · ${mat.color.getHexString()}`;
      transforms.forEach(([x,y,z,sx,sy,sz,ry], i) => {
        dummy.position.set(x,y,z); dummy.scale.set(sx,sy,sz); dummy.rotation.set(0,ry,0); dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix);
      });
      mesh.castShadow = !mat.transparent; mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); this.root.add(mesh);
    }
    this.batches.clear();
  }
}
function roundedSlab(width, depth, radius, height) {
  const x = -width/2, y = -depth/2, w = width, d = depth, r = radius;
  const s = new THREE.Shape(); s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+d-r); s.quadraticCurveTo(x+w,y+d,x+w-r,y+d); s.lineTo(x+r,y+d);
  s.quadraticCurveTo(x,y+d,x,y+d-r); s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y);
  const g = new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false,curveSegments:4});
  g.rotateX(-Math.PI/2); return g;
}
function tree(b, x,z,height=6,y=0,variant=0) {
  b.cylinder(M.trunk,x,y+height*.32,z,.14,height*.64);
  if (variant%3===0) {
    b.add(coneGeometry,M.leafDark,x,y+height*.62,z,height*.22,height*.9,height*.22);
    b.add(coneGeometry,M.leaf,x,y+height*.76,z,height*.15,height*.65,height*.15);
  } else {
    b.add(crownGeometry,variant%2?M.leaf:M.leafLight,x,y+height*.7,z,height*.29,height*.4,height*.27);
    b.add(crownGeometry,M.leafLight,x+height*.12,y+height*.86,z-.3,height*.22,height*.24,height*.2);
  }
}

export function createBuilding() {
  const group = new THREE.Group(); group.name = 'Biograpi-inspired tower';
  const b = new Batches(group), apartments = [], pickMeshes = [];
  const { floorHeight, firstFloor, lastFloor, podiumHeight } = BUILDING;
  b.box(M.stone,0,.5,0,43,1,30);
  b.box(M.cream,0,10.3,0,39.4,19.6,25);
  // Recessed curtain wall / stone fins on the broad podium, and its side return.
  b.box(M.glassLight,0,10.8,12.56,35.5,18,.12);
  b.box(M.glass,19.77,10.8,0,.12,18,21.8);
  b.box(M.glass,-19.77,10.8,0,.12,18,21.8);
  b.box(M.glassLight,0,10.8,-12.56,35.5,18,.12);
  for (let x=-17.7;x<=17.8;x+=1.18) {
    for (const sign of [-1,1]) b.box(M.frame,x,10.8,sign*12.65,.055,18.1,.075);
  }
  for (let y=2;y<20;y+=1.23) {
    for (const sign of [-1,1]) {
      b.box(M.frame,0,y,sign*12.65,35.5,.065,.075);
      b.box(M.frame,sign*19.86,y,0,.075,.065,21.8);
    }
  }
  for (let z=-10.8;z<11;z+=1.15) for (const sign of [-1,1]) b.box(M.frame,sign*19.86,10.8,z,.075,18,.055);
  for (let x of [-18.5,-7.3,7.3,18.5]) {
    b.box(M.white,x,10.4,12.86,1.1,20.1,.7);
    b.box(M.white,x,10.4,-12.86,1.1,20.1,.7);
  }
  b.box(M.white,0,20.2,0,40.2,.7,26);
  b.box(M.white,-20.1,10.1,0,.75,20.3,25.8);
  b.box(M.white,20.1,10.1,0,.75,20.3,25.8);
  // Double-height entry portal, steps, projecting canopy.
  b.box(M.dark,0,3.1,12.79,7.4,5.4,.3);
  b.box(M.white,-4.2,3.3,13.3,.7,5.9,1.3); b.box(M.white,4.2,3.3,13.3,.7,5.9,1.3);
  b.box(M.white,0,6.4,13.6,9.1,.75,2.3);
  b.box(M.glass,0,2.9,13.03,5.5,4.5,.08);
  for (const x of [-2.75,-1.35,0,1.35,2.75]) b.box(M.frame,x,2.9,13.12,.08,4.6,.08);
  for (let i=0;i<3;i++) b.box(M.stone,0,.15+i*.14,14.8-i*.36,11-i*.35,.3,3-i*.6);
  // Podium roof garden and setback lobby.
  b.box(material('#98a17e'),0,20.62,0,38.5,.15,24.3);
  b.box(M.glass,0,21.25,0,28,2.1,15);
  for (let x=-14;x<=14;x+=3.5) for (const sign of [-1,1]) b.box(M.white,x,21.25,sign*7.64,.26,2.1,.3);
  for (const x of [-17,17]) for (const z of [-9,0,9]) {
    b.box(M.stone,x,20.9,z,2.3,.7,2.3); tree(b,x,z,4.1,21.1,Math.abs(z));
  }
  // Tower's inner shell sits behind the balcony decks and window reveals.
  b.box(M.cream,0,podiumHeight+29*floorHeight/2,0,28.8,29*floorHeight,15.2);
  const slab = roundedSlab(31.1,18.5,1.25,.55);
  const band = roundedSlab(31.15,18.55,1.25,.50);
  const windowMats = [M.glass,M.glassLight,M.glassDark];
  const pickMaterial = new THREE.MeshBasicMaterial({ visible:false, side:THREE.FrontSide });
  function apartment(floor,side,slot,x,z,width,rotation,windows) {
    const number = (side==='front'?slot+1:side==='right'?5:side==='back'?slot+6:10);
    const data = { id:`A-${floor}${String(number).padStart(2,'0')}`, floor, number, side, slot,
      windows, bedrooms:2, area:windows===4?98.6:86.4, y:podiumHeight+(floor-firstFloor)*floorHeight,
      center:[x,podiumHeight+(floor-firstFloor)*floorHeight+1.5,z], width, rotation };
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width-.12,2.61),pickMaterial);
    plane.name=data.id; plane.position.fromArray(data.center); plane.rotation.y=rotation;
    plane.userData={apartmentId:data.id}; plane.updateMatrixWorld();
    // Picking proxies remain outside the render tree. They cannot cost draw calls.
    data.pickMesh=plane; apartments.push(data); pickMeshes.push(plane);
  }
  for (let floor=firstFloor;floor<=lastFloor;floor++) {
    const y=podiumHeight+(floor-firstFloor)*floorHeight;
    b.add(slab,M.white,0,y,0,1,1,1);
    // Continuous balcony parapet creates the reference's distinctive horizontal ribbons.
    // The separate deck and front/side fascia leave the interior of each balcony open.
    for (const sign of [-1,1]) {
      b.box(M.white,0,y+.68,sign*9.02,29.1,.6,.38);
      b.box(M.rail,0,y+1.15,sign*9.05,29.2,.42,.07);
      b.box(M.edge,0,y+1.39,sign*9.08,29.2,.045,.08);
      b.box(M.white,sign*15.25,y+.68,0,.38,.6,15.8);
      b.box(M.rail,sign*15.29,y+1.15,0,.07,.42,15.9);
      b.box(M.edge,sign*15.3,y+1.39,0,.08,.045,15.9);
    }
    for (let slot=0;slot<4;slot++) {
      const cx=-10.8+slot*7.2, count=(slot===0||slot===3)?4:3;
      for (const sign of [-1,1]) {
        apartment(floor,sign===1?'front':'back',slot,cx,sign*9.32,7.2,sign===1?0:Math.PI,count);
        for (let w=0;w<count;w++) {
          const wx=cx-3.15+(w+.5)*6.3/count, ww=6.3/count-.32;
          const mat=windowMats[(floor+slot+w)%3];
          b.box(M.frame,wx,y+1.72,sign*7.67,ww+.11,2.02,.13);
          b.box(mat,wx,y+1.73,sign*7.76,ww-.08,1.88,.04);
          b.box(M.frame,wx,y+1.73,sign*7.8,.038,1.92,.04);
          b.box(M.edge,wx,y+.77,sign*7.82,ww+.15,.075,.3);
        }
        b.box(M.white,cx-3.52,y+1.68,sign*8.02,.20,2.25,.9);
        for (let x=cx-3.4;x<cx+3.6;x+=1.75) b.box(M.frame,x,y+1.05,sign*9.07,.035,.65,.035);
      }
    }
    for (const sign of [-1,1]) {
      apartment(floor,sign===1?'right':'left',0,sign*15.54,0,15.6,sign*Math.PI/2,4);
      for (let w=0;w<4;w++) {
        const z=-5.7+w*3.8;
        b.box(M.frame,sign*14.45,y+1.7,z,.12,2,2.75);
        b.box(windowMats[(floor+w)%3],sign*14.54,y+1.72,z,.04,1.86,2.62);
        b.box(M.frame,sign*14.59,y+1.72,z,.04,1.9,.045);
        b.box(M.white,sign*14.85,y+1.72,z-1.7,.9,2.15,.18);
        b.box(M.frame,sign*15.31,y+1.04,z,.035,.66,.035);
      }
    }
  }
  const roof=podiumHeight+29*floorHeight;
  b.add(band,M.white,0,roof,0,1,1,1);
  b.box(M.glassDark,0,roof+2,0,27.6,3.7,13.8);
  for (let x=-14.4;x<=14.4;x+=3.6) for (const sign of [-1,1]) b.box(M.white,x,roof+2.4,sign*8.3,.38,4.8,.45);
  for (const x of [-14.4,14.4]) for (const z of [-4,0,4]) b.box(M.white,x,roof+2.4,z,.4,4.8,.35);
  b.add(roundedSlab(31.5,18.8,1.4,.8),M.white,0,roof+4.8,0,1,1,1);
  b.box(M.stone,0,roof+5.64,-1,11,.9,7);
  for (let x=-10;x<=10;x+=5) { b.box(M.stone,x,roof+.85,7.9,1.3,.6,1); b.add(crownGeometry,M.leaf,x,roof+1.65,7.9,.6,.8,.5); }
  b.flush();
  group.userData={description:'Concept model inspired by supplied Biograpi exterior image; illustrative dimensions.',units:'metres',apartments:apartments.map(({pickMesh,...data})=>data)};
  const occluders = [];
  for (const [x,y,z,sx,sy,sz] of [[0,10,0,40,20,26],[0,(roof+22)/2,0,28.8,roof-22,15.2],[0,roof+5,0,31.5,1,18.8]]) {
    const m=new THREE.Mesh(boxGeometry);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.updateMatrixWorld();occluders.push(m);
  }
  return {group,apartments,pickMeshes,occluders};
}

export function createSurroundings() {
  const group=new THREE.Group();group.name='Low-poly landscaped surroundings';const b=new Batches(group);
  const lawn=material('#c2c9a6'), paving=material('#dbdccb'), asphalt=material('#b5bcac'), stripe=material('#e8e8d8');
  b.box(paving,0,-.32,0,80,.6,57);
  b.box(asphalt,0,-.31,27,155,.5,12);
  b.box(asphalt,-38,-.31,-3,10,.5,70);
  b.box(lawn,29,.01,-3,14,.1,34);b.box(lawn,-28,.01,-2,9,.1,30);
  b.box(lawn,0,.01,-21,48,.1,9);
  for(let x=-72;x<74;x+=7) b.box(stripe,x,-.045,27,3,.025,.16);
  for(let i=0;i<8;i++) b.box(stripe,-24+i*.7,-.035,27,.35,.02,8);
  for(let x=-32;x<=32;x+=4) b.box(M.edge,x,.02,18,.035,.025,6);
  for(let z=-28;z<=18;z+=4) b.box(M.edge,24,.02,z,6,.025,.035);
  const trees=[[-28,-12,8],[-26,1,9],[-28,10,7],[28,-15,9],[30,-3,7],[29,10,8],[-17,-23,7],[-5,-22,8],[9,-23,6],[20,-22,8],[-17,17,5],[17,17,5],[39,-21,7],[-44,12,8]];
  trees.forEach(([x,z,h],i)=>tree(b,x,z,h,0,i));
  for (const x of [-12,12]) {
    b.box(M.stone,x,.35,17,3.8,.7,1.2);
    b.box(M.leaf,x,.85,17,3.5,.7,.95);
    b.box(M.oak,x,.65,19.2,3.3,.15,.7);
    b.box(M.dark,x-1.15,.3,19.2,.1,.6,.55);b.box(M.dark,x+1.15,.3,19.2,.1,.6,.55);
  }
  for (const x of [-26,-12,12,26]) {
    b.cylinder(M.dark,x,2.2,20,.07,4.4);
    b.box(M.dark,x+.5,4.4,20,1.1,.09,.25);
    b.box(material('#eeeedb',{emissive:'#ccc7a6',emissiveIntensity:.2}),x+.6,4.35,20,.6,.04,.2);
  }
  // Muted, simple context masses; no textures or high-poly background assets.
  const context=material('#d0d4c3');
  for (const [x,z,sx,sz,h] of [[-60,-30,16,16,12],[50,-35,14,18,16],[-53,48,20,12,8],[51,40,16,16,11],[0,-48,22,12,10]]) {
    b.box(context,x,h/2-.5,z,sx,h,sz); b.box(paving,x,h,z,sx+.5,.35,sz+.5);
    for(let y=3;y<h;y+=3) b.box(M.edge,x,y,z+sz/2+.02,sx-.8,.1,.04);
  }
  for(const [x,z,c] of [[-9,24,'#e1dfd1'],[23,30,'#6d7e74']]) {
    const cm=material(c); b.box(cm,x,.7,z,4.3,.9,1.9); b.box(M.glassDark,x-.2,1.3,z,2.4,.7,1.75);
    b.box(cm,x-.2,1.68,z,2.5,.08,1.8);
    for(const dx of [-1.35,1.35]) for(const dz of [-.94,.94]) b.add(cylinderGeometry,M.dark,x+dx,.4,z+dz,.38,.18,.38,0);
  }
  b.flush();return group;
}

export function createApartment({windows=3}={}) {
  const group=new THREE.Group();group.name=`Two-bedroom residence · ${windows} window bays`;
  group.userData={description:'Illustrative shared two-bedroom cutaway inspired by supplied reference. Not a surveyed floor plan.',units:'metres',windows};
  const b=new Batches(group);
  const wall=material('#eeebdf'), cap=material('#d8d2c3'), timber=material('#ceb995'), timberAlt=material('#c4ad88'),
    tile=material('#c9cbc0'), linen=material('#e6e1d2'), sage=material('#98a58a'), cushion=material('#babda6'),
    charcoal=material('#424e46'), brass=material('#9a9278'), counter=material('#e4e2d6');
  // Floor plate, planks, bathroom tile and separate balcony strips.
  b.box(M.stone,0,-.18,0,12.2,.36,9.5);
  b.box(timber,0,.015,0,11.85,.03,9.15);
  for(let x=-5.85;x<5.9;x+=.26) {
    b.box((Math.round((x+6)*100)%3)?timber:timberAlt,x,.04,0,.245,.03,9.1);
    for(let z=-4.5;z<4.5;z+=1.8) b.box(cap,x,.057,z+((Math.round(x*4)%2)*.7),.245,.006,.008);
  }
  b.box(M.stone,-2.0,-.16,-5.4,8.2,.3,1.6);
  b.box(tile,-2,.015,-5.4,8,.04,1.55);
  b.box(M.stone,6.75,-.16,-2.2,1.65,.3,4.9);
  b.box(tile,6.75,.015,-2.2,1.6,.04,4.8);
  b.box(tile,-3.55,.08,2.8,4.5,.05,3.4);
  for(let x=-5.7;x<-1.3;x+=.55) b.box(cap,x,.11,2.8,.014,.012,3.4);
  for(let z=1.15;z<4.55;z+=.55) b.box(cap,-3.55,.11,z,4.5,.012,.014);
  function wallSegment(x,z,width,depth,height=2.6){b.box(wall,x,height/2+.05,z,width,height,depth);b.box(cap,x,height+.07,z,width+.025,.035,depth+.025);b.box(M.white,x,.16,z,width+.04,.19,depth+.035);}
  // Cutaway exterior edges are low; full partitions make room divisions legible.
  wallSegment(0,4.65,12.15,.18,.95);wallSegment(-6,0,.18,9.3,1.25);
  wallSegment(6,1.4,.18,6.5,1.1);
  wallSegment(-1.85,-2.1,.17,4.85,2.2);
  wallSegment(1.65,-2.7,.17,3.7,2.2);
  wallSegment(-4.48,.55,3.0,.17,2.2); wallSegment(-1.73,.55,.45,.17,2.2);
  wallSegment(.42,.55,2.62,.17,2.2);
  // Door openings are real gaps with a header and a partially open leaf.
  function door(x,z,width= .88,ry=0){
    b.box(cap,x,2.17,z,width,.13,.19,ry);
    b.box(material('#d8cfb9'),x-.13,1.02,z+.23,.055,1.98,width*.9,Math.PI/5+ry);
    b.cylinder(brass,x-.38,1.03,z+.45,.035,.07);
  }
  door(-2.45,.55);door(-1.25,.55);
  wallSegment(-3.75,2.7,.16,3.5,1.6);
  wallSegment(-1.25,3.25,.16,2.8,1.65);
  wallSegment(-5.22,1.08,1.45,.16,1.6);wallSegment(-2.52,1.08,.95,.16,1.6);
  door(-4.08,1.08);door(-1.73,1.08);
  // Three primary façade window bays (one per bedroom and living area); larger
  // four-bay apartments add a second living window on the return elevation.
  for(const [cx,width] of [[-3.95,3.85],[-.12,3.45],[3.8,4.0]]) {
    const z=-4.59;
    b.box(M.rail,cx,1.37,z+.07,width-.16,2.45,.05);
  }
  for(const [cx,width] of [[-3.95,3.85],[-.12,3.45],[3.8,4.0]]) {
    for(const x of [cx-width/2,cx,cx+width/2]) b.box(M.frame,x,1.35,-4.59,.055,2.7,.11);
    for(const y of [.12,2.67]) b.box(M.frame,cx,y,-4.59,width,.065,.12);
  }
  if(windows===4) {
    b.box(M.rail,6.02,1.35,-2.85,.05,2.5,2.9);
    for(const z of [-4.3,-2.85,-1.4]) b.box(M.frame,6.02,1.35,z,.09,2.7,.055);
    for(const y of [.1,2.67]) b.box(M.frame,6.02,y,-2.85,.1,.07,2.95);
  } else wallSegment(6,-2.85,.16,3.5,1.1);
  function glassRail(x,z,w,d) {
    b.box(M.rail,x,.64,z,w,1.12,d);
    b.box(M.frame,x,1.22,z,w+.02,.045,d+.02);
    if(w>d) for(let px=x-w/2;px<=x+w/2+.05;px+=w/4) b.box(M.frame,px,.65,z,.04,1.18,.055);
    else for(let pz=z-d/2;pz<=z+d/2+.05;pz+=d/3) b.box(M.frame,x,.65,pz,.055,1.18,.04);
  }
  glassRail(-2,-6.17,8.1,.04);glassRail(-6.05,-5.4,.04,1.6);glassRail(2.05,-5.4,.04,1.6);
  glassRail(7.56,-2.2,.04,4.9);glassRail(6.8,.23,1.55,.04);glassRail(6.8,-4.64,1.55,.04);
  function bed(x,z,w=2.05) {
    b.box(timberAlt,x,.24,z,w+.12,.36,2.42); b.box(linen,x,.5,z,w,.30,2.32);
    b.box(cushion,x,.68,z+.36,w+.03,.13,1.5);b.box(sage,x,.76,z+.78,w+.06,.075,.50);
    b.box(timberAlt,x,.8,z-1.23,w+.18,1.45,.16);
    for(const s of [-1,1]){
      b.box(linen,x+s*w*.245,.72,z-.72,w*.43,.18,.48);
      b.box(timberAlt,x+s*(w/2+.38),.36,z-.85,.52,.6,.50);
      b.cylinder(brass,x+s*(w/2+.38),.76,z-.85,.08,.3);
      b.add(coneGeometry,linen,x+s*(w/2+.38),.99,z-.85,.23,.28,.23);
    }
    b.box(material('#b7b7a1'),x,.10,z+.2,w+.75,.025,3.25);
  }
  bed(-4,-2.33,1.95);bed(-.12,-2.23,1.85);
  // Bedroom wardrobes, desks and framed art.
  b.box(linen,-5.45,1.08,-.42,.8,2.1,1.4);
  for(const z of [-.79,-.08]) b.box(brass,-4.99,1.05,z,.03,.3,.035);
  b.box(linen,.0,.62,-.01,1.9,.12,.65);
  for(const x of [-.75,.75]) b.box(M.oak,x,.3,-.01,.055,.62,.48);
  b.box(charcoal,.0,.9,-.15,.57,.45,.045); b.box(M.glassDark,.0,.92,-.11,.5,.34,.01);
  // Living room: textured-looking rug, modular sofa, lounge chair and coffee table.
  const rug=material('#b7beaa');b.box(rug,3.55,.11,-1.22,3.65,.035,3.7);
  for(let z=-2.95;z<.6;z+=.12) b.box(material('#c2c8b5'),3.55,.131,z,3.56,.007,.014);
  b.box(timberAlt,4.9,.29,-1.0,1.08,.3,2.8);
  b.box(linen,5.32,.72,-1.0,.25,1.0,2.85);
  for(let z=-1.95;z<.1;z+=.91) {
    b.box(linen,4.79,.56,z,.91,.28,.86);b.box(cushion,5.08,.9,z,.28,.51,.73);
  }
  for(const z of [-2.45,.44]) b.box(linen,4.84,.58,z,1.22,.56,.18);
  b.box(sage,4.67,.84,-2.05,.43,.18,.46,.3);
  b.box(sage,4.68,.85,-.07,.43,.18,.46,-.25);
  b.box(charcoal,3.3,.50,-1.0,1.05,.09,1.45);
  for(const x of [2.88,3.72]) for(const z of [-1.58,-.42]) b.box(brass,x,.28,z,.04,.48,.04);
  b.box(linen,3.3,.57,-1.30,.42,.05,.3,.1);b.cylinder(M.stone,3.3,.62,-.65,.12,.18);
  function chair(x,z,rotation=0) {
    const c=new THREE.Group();c.position.set(x,0,z);c.rotation.y=rotation;group.add(c);const cb=new Batches(c);
    cb.box(sage,0,.46,0,.7,.18,.68);cb.box(sage,0,.83,-.32,.70,.7,.14);
    for(const dx of [-.29,.29]) for(const dz of [-.25,.25]) cb.box(M.oak,dx,.24,dz,.045,.46,.045);
    for(const dx of [-.35,.35]) cb.box(M.oak,dx,.7,0,.045,.055,.65);cb.flush();
  }
  chair(2.5,-3.25,.3);
  b.box(M.oak,1.89,.37,-2.1,.35,.58,1.7);b.box(charcoal,1.94,1.25,-2.15,.09,.95,1.40);
  b.box(M.glassDark,2,1.25,-2.15,.02,.81,1.26);
  // Kitchen along the low cutaway wall with hob, sink, oven, upper shelving.
  for(let x=1.75;x<5.7;x+=.78){
    b.box(sage,x,.48,4.02,.75,.91,1.05);b.box(brass,x,.80,3.48,.3,.025,.035);
  }
  b.box(counter,3.6,.99,4.02,4.48,.09,1.1);
  b.box(charcoal,4.8,1.045,4.03,.9,.018,.63);
  for(const x of [4.57,5.02]) for(const z of [3.87,4.2]) b.cylinder(M.dark,x,1.068,z,.14,.014);
  b.box(charcoal,4.8,.52,3.48,.62,.45,.025);b.box(brass,4.8,.8,3.43,.51,.035,.035);
  b.box(M.frame,2.17,1.05,4.02,.69,.022,.64);b.box(M.glassLight,2.17,1.064,4.02,.57,.01,.5);
  b.cylinder(brass,2.17,1.22,4.42,.025,.4);b.box(brass,2.17,1.41,4.30,.05,.04,.27);
  b.box(linen,.80,1.10,4.01,.82,2.1,1.02);b.box(brass,.47,1.19,3.47,.026,.4,.045);
  // Dining table and seats.
  b.box(M.oak,2.18,.8,1.84,1.7,.11,1.05);
  for(const x of [1.5,2.85]) for(const z of [1.45,2.22]) b.box(M.oak,x,.40,z,.07,.8,.07);
  chair(1.6,1.0,0);chair(2.8,1.0,0);chair(1.6,2.7,Math.PI);chair(2.8,2.7,Math.PI);
  b.cylinder(M.stone,2.2,.92,1.85,.16,.20);
  // Two bathroom suites: shower glass, toilet, vanity and mirror.
  for(const x of [-4.9,-2.45]) {
    b.box(linen,x,.16,3.74,1.3,.13,1.25);
    b.box(M.rail,x,.96,3.14,1.28,1.62,.035);
    b.box(M.frame,x,.99,4.45,.035,1.75,.04);
    b.box(M.frame,x,1.83,4.27,.3,.035,.36);
    b.box(linen,x,.36,2.04,.48,.53,.66);b.cylinder(linen,x,.65,2.04,.25,.06);
    b.box(linen,x,.7,2.39,.5,.65,.17);
    b.box(M.oak,x-.45,.43,1.56,.65,.72,.54);b.box(counter,x-.45,.85,1.56,.68,.09,.58);
    b.box(M.glassLight,x-.45,1.38,1.20,.62,.68,.035);
  }
  // Washer and entrance storage.
  b.box(linen,-.54,.53,3.95,.68,1,.68);
  const drum=new THREE.Mesh(new THREE.TorusGeometry(.22,.035,7,18),M.frame);drum.position.set(-.54,.52,3.59);group.add(drum);
  b.box(M.oak,-.35,.75,1.84,.6,1.5,.6);
  // Balcony chairs and planters echo the supplied cutaway.
  chair(-3.3,-5.42,Math.PI/2);chair(-1.3,-5.42,-Math.PI/2);
  b.cylinder(counter,-2.3,.44,-5.42,.31,.075);b.cylinder(M.oak,-2.3,.21,-5.42,.06,.42);
  chair(6.78,-2.65,Math.PI/2);
  for(const [x,z] of [[-5.55,-5.62],[1.53,-5.62],[6.88,-4.02],[3.02,-4.08]]) {
    b.cylinder(M.stone,x,.23,z,.24,.46);
    b.add(crownGeometry,M.leaf,x,.67,z,.39,.47,.38);
    b.add(crownGeometry,M.leafLight,x+.13,.99,z,.26,.3,.23);
  }
  // Simple framed artworks mounted on bedroom partitions.
  for(const x of [-1.74,1.76]) {
    b.box(M.oak,x,1.47,-2.4,.045,.70,1.1);b.box(linen,x+.029,1.47,-2.4,.015,.59,.99);
    b.box(sage,x+.04,1.43,-2.52,.014,.35,.32);b.box(timberAlt,x+.04,1.55,-2.1,.014,.33,.21);
  }
  b.flush();
  // Fine floor-plate outline supports the architectural / modelmaking aesthetic.
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(12.2,.36,9.5)),new THREE.LineBasicMaterial({color:'#858d79',transparent:true,opacity:.4}));
  edges.position.y=-.18;group.add(edges);
  return group;
}
