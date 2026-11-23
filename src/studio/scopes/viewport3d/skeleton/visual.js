import {boneGroupColor} from './bone-groups.js';

/** Shared Morphia-style skeletal visualization. No event handlers or animation
 * loop: the viewport/host owns the lifetime and calls update after animation.
 * Weights are supplied by extensions; the default is the complete skeleton. */
export function createViewportSkeleton({THREE,scene,root=null}={}) {
  if(!THREE||!scene) throw new TypeError('Skeleton requires THREE and scene');
  const sphere=new THREE.SphereGeometry(1,16,16), world=new THREE.Vector3(), colorsByValue=new Map(), white=new THREE.Color(0xffffff);
  function linearColor(value){if(!colorsByValue.has(value))colorsByValue.set(value,new THREE.Color(value).convertSRGBToLinear());return colorsByValue.get(value)}
  let current=null,bones=[],edges=[],points=[],group=null,lines=null,geometry=null,lineMaterial=null,radius=1,disposed=false;
  function clear(){
    group?.removeFromParent();for(const p of points)p.material.dispose();points=[];group=null;
    lines?.removeFromParent();geometry?.dispose();lineMaterial?.dispose();lines=geometry=lineMaterial=null;bones=[];edges=[];current=null;
  }
  function setRoot(next,force=false){
    if(disposed||(!force&&next===current))return;clear();current=next??null;if(!current)return;
    const seen=new Set();current.traverse(o=>{
      for(const b of o.isSkinnedMesh&&o.skeleton?.bones?.length?o.skeleton.bones:o.isBone?[o]:[])
        if(b&&!seen.has(b.uuid)){seen.add(b.uuid);bones.push(b)}
    });
    edges=bones.filter(b=>seen.has(b.parent?.uuid)).map(b=>[b,b.parent]);
    current.updateWorldMatrix?.(true,true);
    const box=new THREE.Box3().setFromObject(current),bound=new THREE.Sphere();
    if(!box.isEmpty()){box.getBoundingSphere(bound);radius=Number.isFinite(bound.radius)&&bound.radius>0?bound.radius:1}else radius=1;
    group=new THREE.Group();group.name='viewport3d-skeleton-points';group.renderOrder=10;
    const scale=Math.max(radius*.011,.0015);
    for(const bone of bones){
      const color=linearColor(boneGroupColor(bone.name));
      const material=new THREE.MeshBasicMaterial({color,toneMapped:false,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
      const point=new THREE.Mesh(sphere,material);point.name=`viewport3d-skeleton-point:${bone.name||bone.uuid}`;point.userData.bone=bone;point.userData.baseScale=scale;point.userData.describedColor=color.clone();point.frustumCulled=false;point.renderOrder=10;point.raycast=()=>{};point.visible=false;group.add(point);points.push(point);
    }
    scene.add(group);geometry=new THREE.BufferGeometry();
    lineMaterial=new THREE.LineBasicMaterial({color:0xffffff,vertexColors:true,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
    lines=new THREE.LineSegments(geometry,lineMaterial);lines.name='viewport3d-skeleton-lines';lines.frustumCulled=false;lines.renderOrder=9;lines.visible=false;scene.add(lines);
  }
  function update({visible=true,weight=()=>1,selectedId=null,interactiveBones=null,colorOf=bone=>boneGroupColor(bone.name)}={}){
    if(disposed||!current)return;const weights=new Map(),positions=[],colors=[];
    for(const bone of bones){bone.getWorldPosition(world);const raw=visible?Number(weight(bone,world))||0:0;weights.set(bone,visible&&bone.uuid===selectedId?1:Math.max(0,Math.min(1,raw)));}
    for(const [bone,parent] of edges){
      const a=weights.get(bone)||0,b=weights.get(parent)||0;if(Math.max(a,b)<.02)continue;
      bone.getWorldPosition(world);positions.push(world.x,world.y,world.z);parent.getWorldPosition(world);positions.push(world.x,world.y,world.z);
      for(const [joint,w] of [[bone,a],[parent,b]]){const color=linearColor(interactiveBones&&!interactiveBones.has(joint.uuid)?0xffffff:colorOf(joint));colors.push(color.r*w,color.g*w,color.b*w)}
    }
    for(const [name,data] of [['position',positions],['color',colors]]){const attr=geometry.getAttribute(name);if(!attr||attr.array.length!==data.length)geometry.setAttribute(name,new THREE.Float32BufferAttribute(data,3).setUsage(THREE.DynamicDrawUsage));else {attr.array.set(data);attr.needsUpdate=true;}}
    let max=0;for(const w of weights.values())max=Math.max(max,w);lines.visible=positions.length>0;lineMaterial.opacity=lines.visible?.18+max*.82:0;
    for(const point of points){const bone=point.userData.bone,w=weights.get(bone)||0,selected=bone.uuid===selectedId,known=!interactiveBones||interactiveBones.has(bone.uuid);point.visible=w>=.02;
      if(point.visible){bone.getWorldPosition(point.position);point.scale.setScalar(point.userData.baseScale*(known?1:.34)*(.7+w*.5)*(selected?1.7:1));}
      point.material.opacity=point.visible?(selected?1:Math.min(.85,w*.85)):0;
      point.userData.describedColor.copy(linearColor(colorOf(bone)));point.material.color.copy(selected?white:known?point.userData.describedColor:linearColor(0xffffff));point.userData.described=known;
    }
  }
  function snapshot(){return {bones:bones.length,edges:edges.length,visiblePoints:points.filter(p=>p.visible).length,linesVisible:!!lines?.visible,lineOpacity:lineMaterial?.opacity??0,modelRadius:radius,describedPoints:points.filter(p=>p.userData.described).length};}
  setRoot(root);
  return {setRoot,update,snapshot,get bones(){return bones},get edges(){return edges},get root(){return current},get radius(){return radius},dispose(){if(disposed)return;clear();sphere.dispose();disposed=true}};
}
