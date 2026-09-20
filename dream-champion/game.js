(function(){
"use strict";
var TEX_URI="assets/knox.jpg";
var $=function(id){return document.getElementById(id)};
var PI=Math.PI,R=19;
function rnd(a,b){return a+Math.random()*(b-a)}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function lerp(a,b,t){return a+(b-a)*t}
function ease(t){t=clamp(t,0,1);return t*t*(3-2*t)}
function angLerp(a,b,t){var d=((b-a+PI)%(2*PI)+2*PI)%(2*PI)-PI;return a+d*t}

/* ---------- renderer ---------- */
var canvas=$("gl");
var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:"high-performance"});
var PR=Math.min(window.devicePixelRatio||1,1.75);renderer.setPixelRatio(PR);
renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
var scene=new THREE.Scene();
var camera=new THREE.PerspectiveCamera(50,1,.1,300);
var hemi=new THREE.HemisphereLight(0xffffff,0x111122,.6);scene.add(hemi);
var sun=new THREE.DirectionalLight(0xffffff,.6);sun.position.set(-6,12,6);scene.add(sun);scene.add(sun.target);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);var sc_=sun.shadow.camera;sc_.left=-17;sc_.right=17;sc_.top=17;sc_.bottom=-17;sc_.near=1;sc_.far=60;sun.shadow.bias=-.0006;sun.shadow.normalBias=.04;sun.shadow.radius=3;
var SUNOFF=new THREE.Vector3(-9,18,8);function sunFollow(p){sun.target.position.set(p.x,0,p.z);sun.position.set(p.x+SUNOFF.x,SUNOFF.y,p.z+SUNOFF.z)}
var composer=null,bloom=null,fxOn=true;
(function(){if(!THREE.EffectComposer||!THREE.UnrealBloomPass)return;try{var opt={minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat};
 if(renderer.capabilities.isWebGL2&&(renderer.extensions.has("EXT_color_buffer_float")||renderer.extensions.has("EXT_color_buffer_half_float")))opt.type=THREE.HalfFloatType;
 var rt=new THREE.WebGLRenderTarget(4,4,opt);composer=new THREE.EffectComposer(renderer,rt);composer.addPass(new THREE.RenderPass(scene,camera));
 bloom=new THREE.UnrealBloomPass(new THREE.Vector2(256,256),.75,.55,.82);composer.addPass(bloom);
 var grade=new THREE.ShaderPass({uniforms:{tDiffuse:{value:null},uExp:{value:1.2},uVig:{value:.38},uTint:{value:new THREE.Vector3(1,1,1)},uTime:{value:0}},
  vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader:"uniform sampler2D tDiffuse;uniform float uExp,uVig,uTime;uniform vec3 uTint;varying vec2 vUv;vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+uTime)*43758.5453);}void main(){vec2 d=vUv-.5;float r=dot(d,d);vec2 o=vec2(0.);vec3 c=vec3(texture2D(tDiffuse,vUv+o).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-o).b);c=aces(c*uExp*uTint);c=pow(c,vec3(1./2.2));c=mix(vec3(dot(c,vec3(.3,.59,.11))),c,1.12);c*=1.-smoothstep(.12,.62,r)*uVig;gl_FragColor=vec4(c,1.);}"});
 composer.addPass(grade);composer.grade=grade}catch(e){composer=null}})();
function draw(){if(composer&&fxOn){renderer.toneMapping=THREE.NoToneMapping;renderer.outputEncoding=THREE.LinearEncoding;composer.grade.uniforms.uTime.value=(T||0)%10;composer.render()}else{renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputEncoding=THREE.sRGBEncoding;renderer.render(scene,camera)}}
var aspect=1;
function resize(){var w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);if(composer){composer.setPixelRatio(PR);composer.setSize(w,h)}aspect=w/h;camera.aspect=aspect;camera.fov=aspect<1?53:48;camera.updateProjectionMatrix()}
window.addEventListener("resize",function(){resize();if(camera.view&&camera.view.enabled)viewShift(true)});window.addEventListener("orientationchange",function(){setTimeout(resize,250)});resize();

/* ---------- materials / geo helpers ---------- */
var SPH=new THREE.SphereGeometry(1,24,18),CYL=new THREE.CylinderGeometry(1,1,1,16),CONE=new THREE.ConeGeometry(1,1,10),BOX=new THREE.BoxGeometry(1,1,1),DOME=new THREE.SphereGeometry(1,16,10,0,PI*2,0,PI/2);
var mcache={};
function M(c,o){o=o||{};var k=JSON.stringify([c,o]);if(mcache[k])return mcache[k];
 var m=new THREE.MeshStandardMaterial({color:new THREE.Color(c).convertSRGBToLinear(),roughness:o.r==null?.85:o.r,metalness:0,emissive:o.em||0,emissiveIntensity:o.ei||0,flatShading:!!o.flat,transparent:(o.op||1)<1,opacity:o.op||1,side:o.ds?THREE.DoubleSide:THREE.FrontSide});if((o.op||1)<1)m.depthWrite=false;return mcache[k]=m}
function P(g,geo,mat,x,y,z,sx,sy,sz,rx,ry,rz){var m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);m.scale.set(sx==null?1:sx,sy==null?1:sy,sz==null?1:sz);m.rotation.set(rx||0,ry||0,rz||0);g.add(m);return m}
var dotTex=(function(){var c=document.createElement("canvas");c.width=c.height=128;var g=c.getContext("2d"),r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,"rgba(255,255,255,1)");r.addColorStop(.25,"rgba(255,255,255,.62)");r.addColorStop(.55,"rgba(255,255,255,.2)");r.addColorStop(.8,"rgba(255,255,255,.05)");r.addColorStop(1,"rgba(255,255,255,0)");g.fillStyle=r;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})();
function glow(c,s,op){var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color:c,transparent:true,opacity:op==null?1:op,blending:THREE.AdditiveBlending,depthWrite:false}));sp.scale.set(s,s,1);return sp}
var shadowMat=new THREE.MeshBasicMaterial({map:dotTex,color:0x000000,transparent:true,opacity:.55,depthWrite:false});
var PLANE=new THREE.PlaneGeometry(1,1);
function blob(s){var m=new THREE.Mesh(PLANE,shadowMat);m.rotation.x=-PI/2;m.scale.set(s,s,1);m.position.y=.03;return m}
function groundTex2(cols,key){var S=512,c=document.createElement('canvas');c.width=c.height=S;var g=c.getContext('2d');g.fillStyle=cols[0];g.fillRect(0,0,S,S);
 for(var i=0;i<110;i++){var x=rnd(0,S),y=rnd(0,S),r=rnd(15,85);var grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,cols[1+i%3]);grad.addColorStop(1,'transparent');g.globalAlpha=.35;g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2)}
 for(i=0;i<14000;i++){g.globalAlpha=rnd(.01,.04);g.fillStyle=i%2?'#fff':'#000';g.fillRect(rnd(0,S),rnd(0,S),1,1)}
 var t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,8);t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t}
function causticTex(){var S=512,c=document.createElement("canvas");c.width=c.height=S;var g=c.getContext("2d");g.fillStyle="#000";g.fillRect(0,0,S,S);g.strokeStyle="#fff";g.lineCap="round";
 for(var i=0;i<90;i++){g.globalAlpha=rnd(.15,.6);g.lineWidth=rnd(1.5,5);var x=rnd(0,S),y=rnd(0,S),pts=[[x,y]];for(var k=0;k<5;k++){x+=rnd(-70,70);y+=rnd(-70,70);pts.push([x,y])}
  for(var ox=-1;ox<=1;ox++)for(var oy=-1;oy<=1;oy++){g.beginPath();g.moveTo(pts[0][0]+ox*S,pts[0][1]+oy*S);for(k=1;k<pts.length-1;k++)g.quadraticCurveTo(pts[k][0]+ox*S,pts[k][1]+oy*S,(pts[k][0]+pts[k+1][0])/2+ox*S,(pts[k][1]+pts[k+1][1])/2+oy*S);g.stroke()}}
 var t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(5,5);return t}
function skyDome(top,mid,bot){var m=new THREE.Mesh(new THREE.SphereGeometry(220,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{a:{value:new THREE.Color(top)},b:{value:new THREE.Color(mid)},c:{value:new THREE.Color(bot)}},
 vertexShader:"varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:"uniform vec3 a,b,c;varying vec3 p;void main(){float h=p.y;vec3 col=h>0.?mix(b,a,pow(h,.55)):mix(b,c,pow(-h,.4));gl_FragColor=vec4(col,1.);}"}));m.renderOrder=-10;return m}
function groundTex(cols){var c=document.createElement("canvas");c.width=c.height=256;var g=c.getContext("2d");g.fillStyle=cols[0];g.fillRect(0,0,256,256);for(var i=0;i<260;i++){g.fillStyle=cols[1+(i%(cols.length-1))];g.globalAlpha=rnd(.15,.5);g.beginPath();g.arc(rnd(0,256),rnd(0,256),rnd(3,22),0,7);g.fill()}var t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(9,9);t.encoding=THREE.sRGBEncoding;return t}
function textTex(txt,bg,fg,w,h,font){var c=document.createElement("canvas");c.width=w;c.height=h;var g=c.getContext("2d");g.fillStyle=bg;g.fillRect(0,0,w,h);g.fillStyle=fg;g.font=font;g.textAlign="center";g.textBaseline="middle";g.fillText(txt,w/2,h/2+4);var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t}

/* ---------- audio ---------- */
var AC=null,master=null,muted=false,musicTimer=null;
try{muted=localStorage.getItem("kn_mute")==="1"}catch(e){}
function audioOn(){if(AC){if(AC.state==="suspended")AC.resume();return}try{AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=muted?0:.5;master.connect(AC.destination)}catch(e){AC=null}}
function tone(f,d,type,v,slide,delay){if(!AC)return;var t=AC.currentTime+(delay||0),o=AC.createOscillator(),g=AC.createGain();o.type=type||"sine";o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,slide),t+d);g.gain.setValueAtTime(v||.2,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(master);o.start(t);o.stop(t+d+.02)}
function noise(d,v,fq){if(!AC)return;var n=AC.sampleRate*d,b=AC.createBuffer(1,n,AC.sampleRate),a=b.getChannelData(0);for(var i=0;i<n;i++)a[i]=(Math.random()*2-1)*(1-i/n);var s=AC.createBufferSource();s.buffer=b;var f=AC.createBiquadFilter();f.type="lowpass";f.frequency.value=fq||900;var g=AC.createGain();g.gain.value=v||.3;s.connect(f);f.connect(g);g.connect(master);s.start()}
var SFX={throw:function(){tone(520,.12,"triangle",.12,900)},hit:function(){tone(220,.08,"square",.1,120);noise(.06,.12,1800)},kill:function(){tone(300,.18,"sawtooth",.1,70);noise(.15,.2,1200)},
 hurt:function(){tone(180,.3,"sawtooth",.22,60);noise(.2,.3,600)},dash:function(){noise(.18,.2,2600)},pick:function(){tone(660,.1,"sine",.16);tone(990,.16,"sine",.16,null,.09)},
 roar:function(){tone(90,.9,"sawtooth",.3,40);noise(.8,.35,400)},warn:function(){tone(440,.12,"square",.08);tone(440,.12,"square",.08,null,.18)},
 win:function(){[523,659,784,1047,1319].forEach(function(f,i){tone(f,.35,"triangle",.18,null,i*.13)})},wake:function(){tone(400,.5,"sine",.2,120)},tap:function(){tone(700,.06,"sine",.1)}};
var SCALES={forest:[110,130.8,146.8,164.8,196],grave:[98,116.5,130.8,146.8,174.6],sea:[130.8,155.6,174.6,196,233.1],home:[196,246.9,293.7,329.6,392]};
function music(k){if(musicTimer){clearInterval(musicTimer);musicTimer=null}if(!k)return;var sc=SCALES[k],i=0;musicTimer=setInterval(function(){if(!AC||paused)return;var f=sc[(i*3+((i%4)===3?1:0))%sc.length]*((i%8)<4?1:2);tone(f,k==="home"?.9:.55,k==="home"?"sine":"triangle",.05);if(i%4===0)tone(sc[0]/2,1.1,"sine",.09);i++},k==="home"?520:330)}

/* ---------- particles ---------- */
var NP=420,pPos=new Float32Array(NP*3),pCol=new Float32Array(NP*3),pVel=new Float32Array(NP*3),pLife=new Float32Array(NP),pG=new Float32Array(NP),pi=0;
for(var i0=0;i0<NP;i0++)pPos[i0*3+1]=-999;
var pGeo=new THREE.BufferGeometry();pGeo.setAttribute("position",new THREE.BufferAttribute(pPos,3));pGeo.setAttribute("color",new THREE.BufferAttribute(pCol,3));
var parts=new THREE.Points(pGeo,new THREE.PointsMaterial({size:.55,map:dotTex,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));parts.frustumCulled=false;scene.add(parts);
var tc=new THREE.Color();
function burst(x,y,z,c,n,sp,grav){tc.set(c);for(var i=0;i<n;i++){var k=pi;pi=(pi+1)%NP;pPos[k*3]=x;pPos[k*3+1]=y;pPos[k*3+2]=z;var a=rnd(0,PI*2),u=rnd(-1,1),s=rnd(.3,1)*sp,q=Math.sqrt(1-u*u);pVel[k*3]=Math.cos(a)*q*s;pVel[k*3+1]=Math.abs(u)*s+1;pVel[k*3+2]=Math.sin(a)*q*s;pLife[k]=rnd(.4,.9);pG[k]=grav==null?9:grav;var w=rnd(.7,1);pCol[k*3]=tc.r*w;pCol[k*3+1]=tc.g*w;pCol[k*3+2]=tc.b*w}}
function updParts(dt){for(var k=0;k<NP;k++){if(pLife[k]<=0)continue;pLife[k]-=dt;if(pLife[k]<=0){pPos[k*3+1]=-999;continue}pVel[k*3+1]-=pG[k]*dt;pPos[k*3]+=pVel[k*3]*dt;pPos[k*3+1]+=pVel[k*3+1]*dt;pPos[k*3+2]+=pVel[k*3+2]*dt;if(pLife[k]<.3){pCol[k*3]*=.9;pCol[k*3+1]*=.9;pCol[k*3+2]*=.9}}pGeo.attributes.position.needsUpdate=true;pGeo.attributes.color.needsUpdate=true}

/* ---------- Knox ---------- */
var knox={rig:new THREE.Group(),tilt:new THREE.Group(),x:0,z:0,face:PI,hp:5,maxhp:5,inv:0,dash:0,dashCd:0,fireCd:0,power:0,walk:0,moving:false,dvx:0,dvz:-1};
knox.rig.add(knox.tilt);knox.shadow=blob(1.5);knox.rig.add(knox.shadow);scene.add(knox.rig);
knox.lamp=new THREE.PointLight(0xffd98a,0,15,2);knox.lamp.position.y=2.2;knox.rig.add(knox.lamp);
knox.aura=glow(0xfff0b0,3.2,.07);knox.aura.position.y=1;knox.rig.add(knox.aura);
var KB={},_E=new THREE.Euler(0,0,0,"YXZ"),_Q=new THREE.Quaternion(),_V=new THREE.Vector3();
function setB(n,x,y,z){var b=KB[n];if(!b)return;_E.set(x||0,y||0,z||0,"YXZ");_Q.setFromEuler(_E);b.bone.quaternion.copy(b.pInv).multiply(_Q).multiply(b.rest)}
/* toy dream-blaster */
knox.gun=new THREE.Group();(function(g){var body=M(0x2fd6c8,{r:.35}),grip=M(0xff7a2f,{r:.5}),core=M(0xfff3a0,{em:0xffe27a,ei:2.4});
 P(g,BOX,body,0,0,.1,.09,.11,.34);P(g,BOX,grip,0,-.1,-.02,.07,.16,.08,.25);P(g,CYL,grip,0,0,.3,.06,.1,.06,PI/2);P(g,SPH,core,0,.075,.08,.05,.05,.09);P(g,CYL,core,0,0,.36,.035,.03,.035,PI/2);
 knox.flash=glow(0xfff3a0,.55,0);knox.flash.position.set(0,0,.5);g.add(knox.flash);
 var beam=new THREE.Mesh(new THREE.ConeGeometry(1,1,20,1,true),new THREE.MeshBasicMaterial({color:0xfff0b0,transparent:true,opacity:.03,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.FrontSide,fog:false}));beam.rotation.x=-PI/2;beam.scale.set(2.2,9,2.2);beam.position.z=4.9;g.add(beam);knox.beam=beam;
 g.visible=false;knox.tilt.add(g)})(knox.gun);
knox.mw=0;knox.aw=0;knox.kick=0;knox.sitw=0;
// Rest-space gait plus two-bone IK. Keep the imported skin and every bind transform intact.
var armQ=new THREE.Quaternion(),armP=new THREE.Quaternion(),armD=new THREE.Vector3();
function aimBone(name,childName,target){
 var bone=KB[name].bone,child=KB[childName].bone;knox.tilt.updateMatrixWorld(true);
 var start=bone.getWorldPosition(new THREE.Vector3()),tip=child.getWorldPosition(new THREE.Vector3());
 var goal=knox.tilt.localToWorld(target.clone());
 armQ.setFromUnitVectors(tip.sub(start).normalize(),goal.sub(start).normalize());
 bone.getWorldQuaternion(armP);armQ.multiply(armP);bone.parent.getWorldQuaternion(armP).invert();
 bone.quaternion.copy(armP.multiply(armQ));
}
function armIK(side,grip,weight){
 if(weight<.001)return;var a=side+'Arm',b=side+'ForeArm',h=side+'Hand';
 knox.tilt.updateMatrixWorld(true);
 var shoulder=knox.tilt.worldToLocal(KB[a].bone.getWorldPosition(new THREE.Vector3()));
 var elbow=knox.tilt.worldToLocal(KB[b].bone.getWorldPosition(new THREE.Vector3()));
 var hand=knox.tilt.worldToLocal(KB[h].bone.getWorldPosition(new THREE.Vector3()));
 var target=hand.clone().lerp(grip,weight),L=shoulder.distanceTo(elbow),F=elbow.distanceTo(hand);
 var line=target.clone().sub(shoulder),dist=clamp(line.length(),Math.abs(L-F)+.005,L+F-.005);line.normalize();
 target.copy(shoulder).addScaledVector(line,dist);
 var pole=new THREE.Vector3(side==='Right'?-.7:.7,-1,-.2);pole.addScaledVector(line,-pole.dot(line)).normalize();
 var along=(L*L-F*F+dist*dist)/(2*dist),height=Math.sqrt(Math.max(0,L*L-along*along));
 var bend=shoulder.clone().addScaledVector(line,along).addScaledVector(pole,height);
 aimBone(a,b,bend);aimBone(b,h,target);
}
function animKnox(dt,o){
 if(!KB.Hips)return;var k=knox,kk=1-Math.exp(-dt*12);
 k.mw=lerp(k.mw,(o.move||0)*(k.speed||1),kk);k.aw=lerp(k.aw,o.aim?1:0,1-Math.exp(-dt*18));
 k.sitw=lerp(k.sitw,o.sit?1:0,kk);k.kick=Math.max(0,k.kick-dt*8);
 // Reset joints before solving to prevent accumulated twist or scale drift.
 Object.keys(KB).forEach(function(n){KB[n].bone.quaternion.copy(KB[n].local)});
 var mw=k.mw,aw=k.aw,sw=k.sitw,phase=k.walk,s=Math.sin(phase),br=Math.sin(T*2),kick=k.kick;
 // Model faces +Z. Positive X hip rotation advances a leg. Knees flex backward.
 var left=s*.32*mw,right=-s*.32*mw;
 if(o.swim){left=Math.sin(T*5)*.2*(.35+mw);right=-left}
 var kneeL=-Math.max(0,-s)*.7*mw,kneeR=-Math.max(0,s)*.7*mw;
 setB('Hips',0,0,s*.018*mw);
 setB('LeftUpLeg',lerp(left,-1.25,sw),0,.012);setB('RightUpLeg',lerp(right,-1.25,sw),0,-.012);
 setB('LeftLeg',lerp(kneeL,1.1,sw));setB('RightLeg',lerp(kneeR,1.1,sw));
 setB('LeftFoot',-kneeL*.35);setB('RightFoot',-kneeR*.35);
 setB('Spine02',.018*br,.025*s*mw,0);setB('Spine01',0,-s*.035*mw,0);
 setB('Spine',-kick*.035,0,0);
 setB('RightArm',s*.32*mw,0,-.015);setB('LeftArm',-s*.32*mw,0,.015);
 setB('RightForeArm',-.06*mw);setB('LeftForeArm',-.06*mw);
 setB('Head',o.rest?0:br*.008,Math.sin(T*.5)*.03*(1-mw)*(1-aw),0);
 // Grip targets are in character space. The hands follow the blaster, not a detached proxy.
 var grip=new THREE.Vector3(-.10,1.04+kick*.018,.29-kick*.04);
 armIK('Right',grip,aw);armIK('Left',new THREE.Vector3(.035,1.06+kick*.018,.37-kick*.04),aw);
 k.gun.visible=aw>.08&&!!o.gunOk;
 if(k.gun.visible){k.tilt.updateMatrixWorld(true);KB.RightHand.bone.getWorldPosition(_V);k.tilt.worldToLocal(_V);
 k.gun.position.copy(_V).add(new THREE.Vector3(0,.065,.055));k.gun.rotation.set(-kick*.1,0,0);
 k.flash.material.opacity=Math.max(0,kick*1.2-.3);k.beam.material.opacity=.012*aw;}
}
function fallbackKnox(){var g=knox.tilt;P(g,SPH,M(0xd9a27e),0,1.5,0,.2,.2,.2);P(g,SPH,M(0x2a1a12),0,1.6,-.02,.22,.17,.22);P(g,CYL,M(0xefe7d6),0,1,0,.24,.62,.2);P(g,CYL,M(0x3b4a7a),-.11,.35,0,.09,.7,.09);P(g,CYL,M(0x3b4a7a),.11,.35,0,.09,.7,.09)}
function loadKnox(done){if(!THREE.GLTFLoader){fallbackKnox();return done()}
 try{new THREE.GLTFLoader().load("assets/knox.glb",function(gltf){var root=gltf.scene,box=new THREE.Box3().setFromObject(root),sz=box.getSize(new THREE.Vector3()),ct=box.getCenter(new THREE.Vector3()),k=1.75/sz.y,minY=box.min.y;
   root.updateMatrixWorld(true);var bh=root.getObjectByName("head_end"),bt=root.getObjectByName("LeftToeBase"),bhip=root.getObjectByName("Hips");
   if(bh&&bt&&bhip){var ph=bh.getWorldPosition(new THREE.Vector3()),pt=bt.getWorldPosition(new THREE.Vector3()),pp=bhip.getWorldPosition(new THREE.Vector3());k=1.75/((ph.y-pt.y)*1.04);minY=pt.y-(ph.y-pt.y)*.035;ct.set(pp.x,0,pp.z);window.__kinfo=[ph.y,pt.y,pp.x,pp.z,sz.y]}
   root.scale.setScalar(k);root.position.set(-ct.x*k,-minY*k,-ct.z*k);
   var mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.78,metalness:0,emissive:0xffffff,emissiveIntensity:0,skinning:true});knox.mat=mat;
   root.updateMatrixWorld(true);
   root.traverse(function(n){if(n.isMesh){n.material=mat;n.frustumCulled=false;n.castShadow=true;if(!n.geometry.attributes.normal)n.geometry.computeVertexNormals()}
    if(n.isBone){var q=new THREE.Quaternion(),pq=new THREE.Quaternion();n.getWorldQuaternion(q);n.parent.getWorldQuaternion(pq);KB[n.name]={bone:n,rest:q,pInv:pq.invert(),local:n.quaternion.clone()}}});
   new THREE.TextureLoader().load(TEX_URI,function(t){t.flipY=false;t.encoding=THREE.sRGBEncoding;mat.map=t;mat.emissiveMap=t;mat.needsUpdate=true});
   knox.model=root;knox.tilt.add(root);done()},undefined,function(){fallbackKnox();done()})}catch(e){fallbackKnox();done()}}

/* ---------- enemy builders (all face +z) ---------- */
function eyes(g,x,y,z,s,c){var m=M(c,{em:c,ei:2.2});P(g,SPH,m,-x,y,z,s,s,s);P(g,SPH,m,x,y,z,s,s,s);var gl=glow(c,s*7,.35);gl.position.set(0,y,z+.05);g.add(gl)}
function antler(g,side,y,sc){var m=M(0xcfc6ac);var a=new THREE.Group();a.position.set(side*.14,y,0);a.rotation.z=-side*.5;P(a,CYL,m,0,.35*sc,0,.03,.7*sc,.03);P(a,CYL,m,side*.12*sc,.5*sc,0,.022,.35*sc,.022,0,0,-side*.9);P(a,CYL,m,-side*.08*sc,.62*sc,0,.02,.28*sc,.02,0,0,side*.7);P(a,CYL,m,side*.1*sc,.25*sc,.05,.02,.25*sc,.02,.5,0,-side*.8);g.add(a)}
function buildWalker(o){o=o||{};var g=new THREE.Group(),fur=M(o.boss?0x2a1f2c:0x3a2f28),bone=M(0xd9d2bd,{r:.6});
 P(g,CYL,fur,0,1.55,0,.3,1.15,.24);P(g,SPH,fur,0,2.05,-.05,.42,.3,.3);P(g,CYL,fur,-.16,.5,0,.1,1,.1);P(g,CYL,fur,.16,.5,0,.1,1,.1);
 var limbs=[];[-1,1].forEach(function(s){var a=new THREE.Group();a.position.set(s*.42,2.05,0);P(a,CYL,fur,0,-.7,0,.07,1.4,.07);P(a,CONE,bone,0,-1.5,0,.09,.25,.09,PI);a.rotation.x=-.5;g.add(a);limbs.push(a)});
 P(g,SPH,bone,0,2.42,.1,.19,.22,.28);P(g,CONE,bone,0,2.36,.48,.12,.45,.1,PI/2);eyes(g,.09,2.46,.3,.05,o.boss?0xff2a2a:0xff8a1f);antler(g,-1,2.58,o.boss?1.5:1);antler(g,1,2.58,o.boss?1.5:1);
 if(o.boss){P(g,SPH,M(0xff3d2a,{em:0xff3d2a,ei:1.6}),0,1.7,.25,.09,.14,.04);for(var i=0;i<5;i++)P(g,CONE,fur,rnd(-.4,.4),2.1,-.2,.12,.5,.12,-1.2+rnd(-.3,.3),0,rnd(-.5,.5))}
 g.userData.limbs=limbs;return g}
function buildCrawler(){var g=new THREE.Group(),fur=M(0x241a18),bone=M(0xd9d2bd,{r:.6});P(g,SPH,fur,0,.55,0,.34,.26,.75);var limbs=[];
 [[-1,.45],[1,.45],[-1,-.45],[1,-.45]].forEach(function(p){var a=new THREE.Group();a.position.set(p[0]*.3,.55,p[1]);P(a,CYL,fur,p[0]*.18,-.2,0,.06,.65,.06,0,0,p[0]*.7);g.add(a);limbs.push(a)});
 P(g,SPH,bone,0,.62,.8,.17,.16,.26);eyes(g,.08,.68,.98,.045,0xff2a2a);g.userData.limbs=limbs;return g}
function buildZombie(o){o=o||{};var g=new THREE.Group(),skin=M(o.king?0x6f9a62:0x86b072),shirts=[0x5a6f8f,0x8f5a5a,0x6b5a8f,0x4f7a6a],sh=M(o.king?0x4a2a6a:shirts[Math.floor(rnd(0,4))]),pant=M(0x2e2a3a);
 P(g,BOX,sh,0,1.2,0,.62,.8,.36);P(g,BOX,pant,-.16,.4,0,.22,.8,.26);P(g,BOX,pant,.16,.4,0,.22,.8,.26);P(g,SPH,skin,0,1.9,0,.28,.3,.28);P(g,BOX,M(0x1a0f0f),0,1.78,.24,.16,.06,.06);eyes(g,.1,1.95,.24,.05,0xfff06a);
 var limbs=[];[-1,1].forEach(function(s){var a=new THREE.Group();a.position.set(s*.4,1.45,0);P(a,BOX,skin,0,0,.38,.15,.15,.78);a.rotation.x=s*.15;g.add(a);limbs.push(a)});
 if(o.king){var gold=M(0xffd23f,{em:0xffb300,ei:.5,r:.35});P(g,CYL,gold,0,2.22,0,.26,.14,.26);for(var i=0;i<6;i++){var a2=i/6*PI*2;P(g,CONE,gold,Math.cos(a2)*.22,2.38,Math.sin(a2)*.22,.06,.2,.06)}P(g,CONE,M(0x5a1a7a,{ds:true}),0,1.0,-.22,.7,1.7,.3);P(g,SPH,M(0x7dff6a,{em:0x7dff6a,ei:1.5}),0,1.25,.2,.08,.08,.04)}
 g.userData.limbs=limbs;return g}
function buildSpitter(){var g=new THREE.Group(),sk=M(0x8a9a4a);P(g,SPH,sk,0,1.0,0,.58,.62,.52);P(g,SPH,sk,0,1.72,.08,.24,.24,.24);P(g,BOX,M(0x2e2a3a),-.2,.25,0,.2,.5,.24);P(g,BOX,M(0x2e2a3a),.2,.25,0,.2,.5,.24);
 var sac=M(0x9dff5a,{em:0x7dff3a,ei:1.4});P(g,SPH,sac,-.3,1.35,-.3,.17,.17,.17);P(g,SPH,sac,.28,1.2,-.36,.2,.2,.2);P(g,SPH,sac,0,.8,-.48,.15,.15,.15);P(g,SPH,M(0x1a0f0f),0,1.64,.28,.1,.08,.06);eyes(g,.1,1.8,.27,.045,0xb6ff5a);g.userData.limbs=[];return g}
function buildShark(o){o=o||{};var g=new THREE.Group(),b=new THREE.Group();g.add(b);b.position.y=1.4;var top=M(o.meg?0x3c4f66:0x5d7a94,{r:.5}),bel=M(0xe3edf3,{r:.5});
 P(b,SPH,top,0,0,0,.36,.4,1.15);P(b,SPH,bel,0,-.1,.02,.33,.32,1.08);P(b,CONE,top,0,.52,-.05,.05,.55,.3,-.35);
 [-1,1].forEach(function(s){P(b,CONE,top,s*.42,-.12,.25,.3,.6,.05,0,0,s*1.9)});
 var tail=new THREE.Group();tail.position.z=-1.05;P(tail,CONE,top,0,.28,-.2,.04,.7,.22,-.8);P(tail,CONE,top,0,-.2,-.15,.04,.5,.18,-2.3);b.add(tail);
 var ec=o.meg?0xff2a2a:0x0a0a0a;P(b,SPH,M(ec,o.meg?{em:ec,ei:1}:{}),-.26,.08,.75,.05,.05,.05);P(b,SPH,M(ec,o.meg?{em:ec,ei:1}:{}),.26,.08,.75,.05,.05,.05);
 P(b,BOX,M(0x300a12),0,-.14,.95,.34,.05,.2);for(var i=0;i<6;i++)P(b,CONE,M(0xffffff),-.14+i*.056,-.18,1.02,.025,.08,.025,PI);
 if(o.meg){for(var j=0;j<3;j++)P(b,BOX,M(0xc9a0a0),.2,.22,.2-j*.25,.02,.02,.16,0,.4,0);var gl=glow(0xff2a2a,1.2,.6);gl.position.set(0,.1,.8);b.add(gl)}
 g.userData.tail=tail;g.userData.body=b;g.userData.limbs=[];return g}
function buildJelly(){var g=new THREE.Group(),b=new THREE.Group();g.add(b);b.position.y=1.7;var c=[0xff7ad9,0x9d7aff,0x6ad9ff][Math.floor(rnd(0,3))];
 P(b,DOME,M(c,{em:c,ei:.9,op:.75,ds:true}),0,0,0,.55,.5,.55);P(b,SPH,M(0xffffff,{em:0xffffff,ei:1.2,op:.6}),0,.12,0,.22,.2,.22);
 for(var i=0;i<7;i++){var a=i/7*PI*2;P(b,CYL,M(c,{em:c,ei:.6,op:.7}),Math.cos(a)*.3,-.55,Math.sin(a)*.3,.03,1.1,.03)}var gl=glow(c,2.6,.35);b.add(gl);g.userData.body=b;g.userData.limbs=[];return g}

var DEFS={
 walker:{build:buildWalker,hp:3,sp:3.1,r:.55,ai:"chase",col:0xff8a1f},
 crawler:{build:buildCrawler,hp:2,sp:4.2,r:.6,ai:"lunge",col:0xff2a2a},
 shambler:{build:buildZombie,hp:4,sp:2.3,r:.55,ai:"chase",col:0x86b072},
 spitter:{build:buildSpitter,hp:3,sp:2.2,r:.65,ai:"ranged",col:0x9dff5a},
 shark:{build:buildShark,hp:3,sp:4.4,r:.7,ai:"charger",col:0x9fd0ff},
 jelly:{build:buildJelly,hp:2,sp:1.7,r:.6,ai:"drift",col:0xff7ad9},
 skinwalker:{build:function(){var g=buildWalker({boss:1});g.scale.setScalar(2.2);return g},hp:46,sp:3.4,r:1.5,ai:"boss",col:0xff3d2a,atk:["charge","volley","summon"],minion:"crawler",shot:0xff5a2a},
 king:{build:function(){var g=buildZombie({king:1});g.scale.setScalar(2.3);return g},hp:56,sp:2.6,r:1.6,ai:"boss",col:0x7dff6a,atk:["slam","volley","summon","slam"],minion:"shambler",shot:0x7dff3a},
 meg:{build:function(){var g=buildShark({meg:1});g.scale.setScalar(3);return g},hp:66,sp:4.2,r:2.2,ai:"boss",col:0xff2a2a,atk:["charge","volley","charge","summon"],minion:"shark",shot:0x6ad9ff}
};
var THEMES={
 forest:{sky:[0x02030c,0x16224a,0x05060f],mist:0x7f9cff,sunoff:[-9,16,-10],bloom:.6,exp:1.05,tint:[.95,1,1.12],icon:"🦌",name:"The Whispering Woods",sub:"Skinwalkers",boss:"skinwalker",bossName:"THE SKINWALKER",bg:0x0a1026,fog:.024,hemi:[0x8494f0,0x14142a,.8],sun:[0xa9bcff,.7],ground:["#121a2c","#1b2a3a","#0f1626","#1f3a2a"],rim:0xff7a2f,bolt:0xffe27a,lamp:1.3,ammo:"light beams",
  intro:"Something with antlers is whispering Knox's name from between the trees. Shine your light and chase the Skinwalkers out of the dream!",
  waves:[[["walker",5]],[["walker",5],["crawler",3]],[["walker",6],["crawler",5]]]},
 grave:{sky:[0x020604,0x1c3a26,0x040805],mist:0x8dffa0,sunoff:[10,15,-9],bloom:.55,exp:1.0,tint:[.97,1.06,.95],icon:"🧟",name:"Graveyard Shift",sub:"Zombies",boss:"king",bossName:"THE ZOMBIE KING",bg:0x0f1a14,fog:.024,hemi:[0x7fbf8a,0x0a100a,.62],sun:[0xc8ffd0,.5],ground:["#1a2418","#25331f","#141c12","#30382a"],rim:0x7dff6a,bolt:0xffffff,lamp:.7,ammo:"pillows",
  intro:"The graveyard gate creaks open and the zombies shuffle out, groaning. Good thing Knox brought the ultimate weapon: PILLOWS.",
  waves:[[["shambler",6]],[["shambler",6],["spitter",3]],[["shambler",8],["spitter",4]]]},
 sea:{sky:[0x0a5a8a,0x063a5e,0x021626],mist:0x7fd8ff,sunoff:[-4,20,3],bloom:.45,exp:.9,tint:[.92,1.02,1.1],icon:"🦈",name:"The Deep Dark",sub:"Sharks",boss:"meg",bossName:"MEGALODON",bg:0x052a4a,fog:.028,hemi:[0x4fb7ff,0x031526,.5],sun:[0x8fd8ff,.45],ground:["#2f5f78","#3a7088","#28506a","#4a7f8f"],rim:0x3fe0ff,bolt:0x9ff3ff,lamp:.5,ammo:"bubble blasts",
  intro:"Knox sinks into a deep blue dream. He can breathe down here... but the sharks are circling. Blast them with bubbles!",
  waves:[[["shark",4]],[["shark",4],["jelly",4]],[["shark",6],["jelly",5]]]}
};
var ORDER=["forest","grave","sea"];

/* ---------- level sets ---------- */
var level=null,animDecor=[];
function inst(geo,mat,n){var m=new THREE.InstancedMesh(geo,mat,n);m.frustumCulled=false;return m}
var dummy=new THREE.Object3D();
function setI(im,i,x,y,z,sx,sy,sz,ry,rz){dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,ry||0,rz||0);dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix)}
function ringPos(i,n,r0,r1){var a=i/n*PI*2+rnd(-.1,.1),r=rnd(r0,r1);return [Math.cos(a)*r,Math.sin(a)*r]}
function buildLevel(key){var th=THEMES[key],g=new THREE.Group();animDecor=[];
 var gr=new THREE.Mesh(new THREE.CircleGeometry(R+40,48),(function(){var gt=groundTex2(th.ground,key);return new THREE.MeshStandardMaterial({map:gt,bumpMap:gt,bumpScale:key==="sea"?.025:.045,roughness:key==="sea"?.7:.95})})());gr.rotation.x=-PI/2;gr.receiveShadow=true;g.add(gr);
 g.add(skyDome(th.sky[0],th.sky[1],th.sky[2]));
 for(var fi=0;fi<(key==="sea"?0:22);fi++){var fg=glow(th.mist,rnd(8,13),rnd(.018,.04));fg.position.set(rnd(-R-8,R+8),rnd(.6,1.6),rnd(-R-8,R+8));fg.material.depthTest=false;fg.userData={k:rnd(0,9),b:fg.position.clone()};g.add(fg);animDecor.push({o:fg,t:"mist"})}
 if(key==="sea"){var ct=causticTex();[0,1].forEach(function(n){var ct2=n?ct.clone():ct;ct2.needsUpdate=true;var cm=new THREE.Mesh(new THREE.CircleGeometry(R+30,40),new THREE.MeshBasicMaterial({map:ct2,color:0x8fe8ff,transparent:true,opacity:n?.07:.1,blending:THREE.AdditiveBlending,depthWrite:false}));cm.rotation.x=-PI/2;cm.rotation.z=n*.8;cm.position.y=.05+n*.01;g.add(cm);animDecor.push({o:cm,t:"caus",k:n})})}
 if(key==="grave")animDecor.push({o:hemi,t:"bolt",next:rnd(3,6),v:0});
 var rim=new THREE.Mesh(new THREE.TorusGeometry(R+.6,.12,8,80),M(th.rim,{em:th.rim,ei:.4}));rim.rotation.x=PI/2;rim.position.y=.03;g.add(rim);
 var sp=[];for(var i=0;i<500;i++){var v=new THREE.Vector3(rnd(-1,1),rnd(.15,1),rnd(-1,1)).normalize().multiplyScalar(140);sp.push(v.x,v.y,v.z)}
 var sg=new THREE.BufferGeometry();sg.setAttribute("position",new THREE.Float32BufferAttribute(sp,3));var stars=new THREE.Points(sg,new THREE.PointsMaterial({size:1.6,map:dotTex,transparent:true,depthWrite:false,fog:false,color:key==="sea"?0x7fd8ff:0xffffff,opacity:key==="sea"?.35:.9}));g.add(stars);
 var i,p;
 if(key==="forest"){var N=90,tr=inst(CYL,M(0x2a1d14),N),lf=inst(CONE,M(0x0f2a22,{flat:true}),N),lf2=inst(CONE,M(0x143528,{flat:true}),N);
  for(i=0;i<N;i++){p=ringPos(i,N,R+1.2,i%3?R+6:R+20);var h=rnd(7,14);setI(tr,i,p[0],h*.2,p[1],.3,h*.4,.3);setI(lf,i,p[0],h*.55,p[1],h*.3,h*.7,h*.3,rnd(0,3));setI(lf2,i,p[0],h*.85,p[1],h*.19,h*.5,h*.19,rnd(0,3))}g.add(tr,lf,lf2);
  var moon=glow(0xdfe8ff,26,.3);moon.material.fog=false;moon.position.set(-30,50,-90);g.add(moon);var mc=new THREE.Mesh(SPH,new THREE.MeshBasicMaterial({color:0xf3f6ff,fog:false}));mc.scale.setScalar(6);mc.position.copy(moon.position);g.add(mc);
  for(i=0;i<26;i++){var f=glow(0xd8ff7a,.5,.9);f.position.set(rnd(-R,R),rnd(.6,3),rnd(-R,R));f.userData={k:rnd(0,9),b:f.position.clone()};g.add(f);animDecor.push({o:f,t:"fly"})}
  for(i=0;i<8;i++){p=ringPos(i,8,R+3,R+9);var e=new THREE.Group();eyes(e,.18,0,0,.07,0xff8a1f);e.position.set(p[0],rnd(1.5,3.2),p[1]);e.lookAt(0,2,0);g.add(e);animDecor.push({o:e,t:"blink",k:rnd(0,9)})}
  var tuft=inst(CONE,M(0x1f3a2a,{flat:true}),60);for(i=0;i<60;i++)setI(tuft,i,rnd(-R,R),.2,rnd(-R,R),.18,.45,.18);g.add(tuft)}
 if(key==="grave"){var T=70,tb=inst(BOX,M(0x7a8088,{flat:true}),T),tt=inst(CYL,M(0x7a8088,{flat:true}),T);
  for(i=0;i<T;i++){p=i<22?[rnd(-R+2,R-2),rnd(-R+2,R-2)]:ringPos(i,T,R+2,R+18);var s=i<22?.5:1;setI(tb,i,p[0],.55*s,p[1],.8*s,1.1*s,.22*s,rnd(-.3,.3),rnd(-.12,.12));setI(tt,i,p[0],1.1*s,p[1],.4*s,.22*s,.4*s,rnd(-.3,.3),PI/2)}g.add(tb,tt);
  var D=26,dt=inst(CYL,M(0x1c1712),D*3);for(i=0;i<D;i++){p=ringPos(i,D,R+4,R+20);var hh=rnd(5,9);setI(dt,i*3,p[0],hh/2,p[1],.28,hh,.28);setI(dt,i*3+1,p[0]+.8,hh*.8,p[1],.1,hh*.5,.1,0,-.8);setI(dt,i*3+2,p[0]-.7,hh*.7,p[1],.09,hh*.45,.09,0,.9)}g.add(dt);
  var F=64,fe=inst(BOX,M(0x15151c),F);for(i=0;i<F;i++){var a=i/F*PI*2;setI(fe,i,Math.cos(a)*(R+1.4),.7,Math.sin(a)*(R+1.4),.08,1.4,.08)}g.add(fe);
  var mo=glow(0xcfffd8,30,1);mo.material.fog=false;mo.position.set(40,45,-90);g.add(mo);var mc2=new THREE.Mesh(SPH,new THREE.MeshBasicMaterial({color:0xefffe8,fog:false}));mc2.scale.setScalar(7);mc2.position.copy(mo.position);g.add(mc2);
  for(i=0;i<14;i++){var m2=glow(0x7dff6a,5,.12);m2.position.set(rnd(-R,R),.5,rnd(-R,R));m2.userData={k:rnd(0,9),b:m2.position.clone()};g.add(m2);animDecor.push({o:m2,t:"mist"})}}
 if(key==="sea"){var W=80,wd=inst(CONE,M(0x1f8a5a,{flat:true}),W);for(i=0;i<W;i++){p=i<20?[rnd(-R,R),rnd(-R,R)]:ringPos(i,W,R+1.5,R+16);var wh=i<20?rnd(.6,1.2):rnd(3,7);setI(wd,i,p[0],wh/2,p[1],.25,wh,.25,0,rnd(-.15,.15))}g.add(wd);
  var C=40,co=inst(SPH,M(0xff6a8a,{flat:true}),C),co2=inst(SPH,M(0xffb04a,{flat:true}),C);for(i=0;i<C;i++){p=ringPos(i,C,R+2,R+15);setI(co,i,p[0],.6,p[1],rnd(.8,2),rnd(.6,1.6),rnd(.8,2));p=ringPos(i,C,R+2,R+18);setI(co2,i,p[0],.4,p[1],rnd(.5,1.4),rnd(.5,1.2),rnd(.5,1.4))}g.add(co,co2);
  var rk=inst(new THREE.IcosahedronGeometry(1,0),M(0x3a4a5a,{flat:true}),24);for(i=0;i<24;i++){p=ringPos(i,24,R+5,R+22);setI(rk,i,p[0],1,p[1],rnd(2,5),rnd(2,6),rnd(2,5),rnd(0,3))}g.add(rk);
  for(i=0;i<7;i++){var ray=new THREE.Mesh(CONE,new THREE.MeshBasicMaterial({color:0x9fe8ff,transparent:true,opacity:.07,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));ray.scale.set(rnd(2,4),40,rnd(2,4));ray.position.set(rnd(-R,R),20,rnd(-R,R));ray.rotation.z=.2;g.add(ray);animDecor.push({o:ray,t:"ray",k:rnd(0,9)})}
  var bp=[];for(i=0;i<160;i++)bp.push(rnd(-R-6,R+6),rnd(0,14),rnd(-R-6,R+6));var bg=new THREE.BufferGeometry();bg.setAttribute("position",new THREE.Float32BufferAttribute(bp,3));var bub=new THREE.Points(bg,new THREE.PointsMaterial({size:.3,map:dotTex,transparent:true,opacity:.6,depthWrite:false,color:0xcff6ff}));g.add(bub);animDecor.push({o:bub,t:"bub"});
  P(g,BOX,M(0x6a4a2a),-8,.5,-R-5,3,1.6,2,0,.4,.2);P(g,BOX,M(0xffd23f,{em:0xffb300,ei:.8}),-8,1.35,-R-5,2.6,.2,1.6,0,.4,.2)}
 scene.background=new THREE.Color(th.bg);scene.fog=new THREE.FogExp2(th.bg,th.fog);hemi.color.set(th.hemi[0]);hemi.groundColor.set(th.hemi[1]);hemi.intensity=th.hemi[2];sun.color.set(th.sun[0]);sun.intensity=th.sun[1];knox.lamp.intensity=th.lamp*.55;knox.lamp.position.set(0,2.6,1.2);
 animDecor.forEach(function(d){if(d.t==="mist"){d.o.material.depthTest=false;d.o.position.y=Math.max(d.o.position.y,1.2)}}); SUNOFF.set(th.sunoff[0],th.sunoff[1],th.sunoff[2]);g.traverse(function(n){if(n.isInstancedMesh){n.castShadow=true;n.receiveShadow=true}});if(composer){composer.grade.uniforms.uExp.value=th.exp;bloom.strength=th.bloom;composer.grade.uniforms.uTint.value.set(th.tint[0],th.tint[1],th.tint[2])}
 scene.add(g);return g}

/* ---------- home set: parents' room, hall, Knox's room ---------- */
var home=new THREE.Group(),homeLights=[],nightStars=[];
(function(){var g=home,wood=M(0x8a6a4a),wallA=M(0xc9b8d8),wallB=M(0x9fc4e8),hallW=M(0xe6dcc8);
 P(g,BOX,M(0x7a5a8a),0,-.1,0,14,.2,11);P(g,BOX,wood,14,-.1,0,14,.2,11);P(g,BOX,M(0x3f5f9a),28,-.1,0,14,.2,11);
 P(g,BOX,wallA,0,3,-5.4,14,6.4,.3);P(g,BOX,hallW,14,3,-5.4,14,6.4,.3);P(g,BOX,wallB,28,3,-5.4,14,6.4,.3);
 [7,21].forEach(function(x){P(g,BOX,M(0xf2ece0),x,3,-3.4,.3,6.4,4);P(g,BOX,M(0xf2ece0),x,5.4,1,.3,1.6,5)});
 P(g,BOX,wallA,-7,3,0,.3,6.4,11);P(g,BOX,wallB,35,3,0,.3,6.4,11);
 /* parents' bed */
 P(g,BOX,M(0x5a3a2a),0,.35,-2.4,5.6,.5,4.4);P(g,BOX,M(0xf4f0ea),0,.75,-2.4,5.4,.35,4.2);P(g,BOX,M(0x5a3a2a),0,1.5,-4.75,5.8,2.4,.3);
 P(g,BOX,M(0x7a4aa8),0,.98,-1.5,5.5,.14,2.5);[-1.7,0,1.7].forEach(function(x){P(g,BOX,M(0xffffff),x,1.02,-3.9,1.4,.22,.8)});
 [[-1.7,0x5a3a22],[1.7,0x2a1a12]].forEach(function(q){P(g,SPH,M(0x7a4aa8),q[0],1.1,-1.9,.62,.38,1.35);P(g,SPH,M(0xd9a27e),q[0],1.25,-3.75,.3,.28,.3);P(g,SPH,M(q[1]),q[0],1.3,-3.88,.33,.28,.33)});
 P(g,BOX,M(0x5a3a2a),-4.4,.6,-4.4,1.3,1.2,1.2);var lampA=P(g,CONE,M(0xffe2a8,{em:0xffc46a,ei:1.2}),-4.4,1.75,-4.4,.45,.6,.45);P(g,CYL,M(0x333333),-4.4,1.35,-4.4,.05,.4,.05);
 var l1=new THREE.PointLight(0xffc98a,1.3,16,2);l1.position.set(-4,2.6,-3);g.add(l1);homeLights.push(l1);
 P(g,BOX,M(0x16224a,{em:0x16224a,ei:.8}),3.8,3.6,-5.2,2.4,2.2,.1);P(g,BOX,M(0xffffff),3.8,3.6,-5.18,.12,2.2,.12);P(g,BOX,M(0xffffff),3.8,3.6,-5.18,2.4,.12,.12);var mn=glow(0xf3f6ff,1.4,1);mn.position.set(4.4,4.1,-5.1);g.add(mn);
 /* hall */
 [10,14,18].forEach(function(x,i){P(g,BOX,M(0x3a2a1a),x,3.4,-5.2,1.5,1.2,.08);P(g,BOX,M([0xffb04a,0x6ad9ff,0xff7ad9][i],{em:[0xffb04a,0x6ad9ff,0xff7ad9][i],ei:.25}),x,3.4,-5.14,1.2,.9,.06)});
 P(g,BOX,M(0xb24a4a),14,.02,.5,12,.04,2.2);var l2=new THREE.PointLight(0xfff0d0,.9,16,2);l2.position.set(14,4.5,0);g.add(l2);homeLights.push(l2);
 var sign=new THREE.Mesh(PLANE,new THREE.MeshBasicMaterial({map:textTex("KNOX'S ROOM","#1d3a7a","#ffd23f",512,160,"bold 64px Fredoka, Arial")}));sign.scale.set(2.4,.75,1);sign.position.set(21.0,4.0,-1.35);sign.rotation.y=-PI/2;sign.position.x=20.82;g.add(sign);
 var sign2=sign.clone();sign2.rotation.y=0;sign2.position.set(19,4.4,-5.2);g.add(sign2);
 /* Knox's room */
 P(g,BOX,M(0x2a4a8a),28,.35,-3,2.6,.5,4.2);P(g,BOX,M(0xf4f0ea),28,.75,-3,2.4,.35,4);P(g,BOX,M(0x2a4a8a),28,1.4,-5.1,2.8,2,.3);P(g,BOX,M(0x2f6bd8),28,.98,-2.2,2.5,.14,2.4);P(g,BOX,M(0xffffff),28,1.02,-4.4,1.5,.22,.8);
 for(var i=0;i<9;i++){var s=P(g,SPH,M(0xffd23f,{em:0xffd23f,ei:.4}),28+rnd(-1.1,1.1),1.07,-2.2+rnd(-1,1),.09,.03,.09)}
 P(g,BOX,M(0xe8e0d0),32.5,1.2,-4.6,2.6,2.4,1);[0xff5a5a,0x5aff8a,0x5ab4ff,0xffd23f,0xff7ad9].forEach(function(c,i){P(g,BOX,M(c),31.6+i*.45,1.7,-4.2,.3,.6,.4)});P(g,SPH,M(0xffffff),32,.9,-4.1,.3,.3,.3);P(g,SPH,M(0xc47a3a),33,.85,-4.1,.26,.26,.26);
 P(g,BOX,M(0x16224a,{em:0x16224a,ei:.8}),24.2,3.6,-5.2,2.2,2,.1);
 var nl=P(g,SPH,M(0xffe27a,{em:0xffd23f,ei:2}),25.2,.5,-4.6,.3,.3,.3);var l3=new THREE.PointLight(0xffd98a,1.1,14,2);l3.position.set(27,3,-1);g.add(l3);homeLights.push(l3);
 for(i=0;i<40;i++){var st=glow([0xffe27a,0x9fd0ff,0xff9fe0][i%3],rnd(.25,.6),0);st.position.set(rnd(22,34),rnd(2.4,6),rnd(-5,-1));g.add(st);nightStars.push(st)}
 home.traverse(function(n){if(n.isMesh&&n.material.isMeshStandardMaterial){n.castShadow=true;n.receiveShadow=true}});home.visible=false;scene.add(home)})();
function homeLook(){scene.background=new THREE.Color(0x0b0a1e);scene.fog=null;hemi.color.set(0x9a8ad8);hemi.groundColor.set(0x1a1428);hemi.intensity=.55;sun.color.set(0xbfc8ff);sun.intensity=.35;knox.lamp.intensity=0;SUNOFF.set(6,14,9);if(composer){bloom.strength=.3;composer.grade.uniforms.uExp.value=.85;composer.grade.uniforms.uTint.value.set(1.04,1,1.06)}}
function knoxInBed(sit){knox.sit=!!sit;knox.moving=false;knox.rig.position.set(0,sit?.42:1.22,sit?-3.2:-1.2);knox.rig.rotation.set(0,0,0);knox.tilt.rotation.set(sit?0:-PI/2,0,0);knox.tilt.position.y=0;knox.shadow.visible=false;knox.aura.visible=false;knox.rig.scale.set(1,1,1)}
function viewShift(on){var w=window.innerWidth,h=window.innerHeight;if(!on){camera.clearViewOffset();return}if(aspect>1.15)camera.setViewOffset(w,h,w*.24,0,w,h);else camera.setViewOffset(w,h,0,h*.2,w,h)}
function camHome(x,dt){var f=aspect<1?1.7:1.05;var tx=x,ty=5*f*.8,tz=8.6*f;if(dt==null){camera.position.set(tx,ty,tz)}else{camera.position.x=lerp(camera.position.x,tx,1-Math.exp(-dt*3));camera.position.y=ty;camera.position.z=tz}camera.lookAt(camera.position.x,1.4,-2.2)}

/* ---------- game state ---------- */
var state="load",paused=false,curKey=null,waveIdx=0,enemies=[],shots=[],eshots=[],picks=[],tele=[],spawnQ=[],boss=null,waveGap=0,shake=0,slow=1,T=0,endT=0,progress={};
try{progress=JSON.parse(localStorage.getItem("kn_prog")||"{}")||{}}catch(e){progress={}}
function save(){try{localStorage.setItem("kn_prog",JSON.stringify(progress))}catch(e){}}
var ov=$("ov"),hud=$("hud"),ctl=$("ctl");
function panel(html,opts){opts=opts||{};ov.innerHTML='<div class="panel'+(opts.low?" low":"")+'">'+html+"</div>";ov.className="on"+(opts.dim?" dim":"");
 Array.prototype.forEach.call(ov.querySelectorAll("[data-a]"),function(b){b.addEventListener("click",function(){audioOn();SFX.tap();act(b.getAttribute("data-a"))})})}
function hidePanel(){ov.className="";ov.innerHTML=""}
function banner(t,ms){var b=$("banner");b.textContent=t;b.classList.add("on");setTimeout(function(){b.classList.remove("on")},ms||1500)}
function hearts(){var s="";for(var i=0;i<knox.maxhp;i++)s+=i<knox.hp?"❤️":"🖤";$("hearts").textContent=s}
function act(a){
 if(a==="start"){goHub()}
 else if(a.indexOf("dream:")===0){intro(a.slice(6))}
 else if(a==="go"){startLevel(curKey)}
 else if(a==="retry"){startLevel(curKey)}
 else if(a==="hub"){goHub()}
 else if(a==="resume"){setPause(false)}
 else if(a==="quit"){setPause(false);clearLevel();goHub()}
 else if(a==="ending"){startEnding()}
 else if(a==="reset"){progress={};save();goHub()}
 else if(a==="fs"){var el=document.documentElement;try{(el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el)}catch(e){}}}
function title(){state="title";viewShift(true);home.visible=true;homeLook();knoxInBed(false);camHome(0);hud.className="";ctl.className="";
 panel('<h1>Knox\'s<br>Nightmares</h1><p>Knox is fast asleep in Mommy and Daddy\'s bed... and three nightmares are waiting. Beat them all and Knox can sleep in his <b>own room</b> forever!</p><button class="btn" data-a="start">Start Dreaming</button><p class="hint">Left thumb moves. THROW auto-aims. DASH dodges.<br>Keyboard: WASD / arrows, Space, Shift.</p>',{low:true})}
function goHub(){paused=false;slow=1;state="hub";viewShift(true);clearLevel();home.visible=true;homeLook();knoxInBed(false);knox.rig.visible=true;camHome(0);hud.className="";ctl.className="";music("home");
 var all=ORDER.every(function(k){return progress[k]});
 var h='<h2>'+(all?"No more nightmares!":"Pick a nightmare")+'</h2><div class="dreams">';
 ORDER.forEach(function(k){var t=THEMES[k];h+='<button class="dream'+(progress[k]?" done":"")+'" data-a="dream:'+k+'"><span>'+(progress[k]?"⭐":t.icon)+"</span>"+t.name+"<em>"+(progress[k]?"Defeated!":t.sub)+"</em></button>"});
 h+="</div>";if(all)h+='<button class="btn" data-a="ending">Go to Knox\'s room ➜</button><br><button class="btn alt" data-a="reset">Start over</button>';else h+='<p class="hint">Beat all three to win. If Knox loses, he just wakes up.</p>';
 panel(h,{low:true})}
function intro(k){curKey=k;var t=THEMES[k];panel("<h2>"+t.icon+" "+t.name+"</h2><p>"+t.intro+"</p><p class='hint'>3 waves, then the boss: <b>"+t.bossName+"</b>. Knox throws "+t.ammo+".</p><button class='btn' data-a='go'>Enter the dream</button><button class='btn alt' data-a='hub'>Back</button>",{dim:true})}
function clearLevel(){resetInput();$("touchHint").classList.remove("on");$("banner").classList.remove("on");if($("victoryCard"))$("victoryCard").className="";enemies.forEach(function(e){releaseObject(e.mesh)});shots.concat(eshots).forEach(function(s){releaseObject(s.mesh)});picks.forEach(function(p){releaseObject(p.mesh)});tele.forEach(function(t){releaseObject(t.mesh)});
 enemies=[];shots=[];eshots=[];picks=[];tele=[];spawnQ=[];boss=null;if(level){releaseObject(level);level=null}$("boss").className="";$("power").textContent=""}
function startLevel(k){resetInput();paused=false;slow=1;runScore=0;combo=0;comboTimer=0;special=100;runTime=0;viewShift(false);clearLevel();hidePanel();curKey=k;home.visible=false;level=buildLevel(k);state="play";waveIdx=-1;waveGap=1.2;slow=1;
 knox.x=0;knox.z=4;knox.hp=knox.maxhp;knox.inv=1.5;knox.power=0;knox.dash=0;knox.dashCd=0;knox.face=PI;knox.aimT=0;knox.kick=0;knox.tilt.rotation.set(0,0,0);knox.tilt.position.set(0,0,0);knox.rig.scale.set(1,1,1);knox.rig.rotation.set(0,PI,0);knox.shadow.visible=true;knox.aura.visible=true;knox.rig.visible=true;
 hud.className="on";ctl.className="on";hearts();$("wave").textContent=THEMES[k].name;banner(THEMES[k].name,1800);music(k);camSnap()}
function nextWave(){waveIdx++;var th=THEMES[curKey];
 if(waveIdx<th.waves.length){banner("Wave "+(waveIdx+1),1300);$("wave").textContent=th.name+" · Wave "+(waveIdx+1)+"/3";var d=0;th.waves[waveIdx].forEach(function(w){for(var i=0;i<w[1];i++){spawnQ.push({type:w[0],t:d});d+=.45}})}
 else{banner("BOSS!",1600);SFX.roar();$("wave").textContent="";knox.hp=knox.maxhp;hearts();spawnQ.push({type:th.boss,t:1.4,boss:true})}}
function spawn(type,x,z,isBoss){var d=DEFS[type],m=d.build();if(x==null){var a=rnd(0,PI*2);x=Math.cos(a)*(R-1.5);z=Math.sin(a)*(R-1.5);if(isBoss){x=0;z=-R+5}}
 var e={type:type,d:d,mesh:m,x:x,z:z,hp:Math.ceil(d.hp*(expert?1.4:1)),maxhp:Math.ceil(d.hp*(expert?1.4:1)),r:d.r,t:rnd(0,9),cd:rnd(1.2,2.6),st:"move",stT:0,vx:0,vz:0,face:0,pop:0,grow:0,boss:!!isBoss,ai:d.ai,atkI:0,y:0};
 m.traverse(function(n){if(n.isMesh&&!n.material.transparent)n.castShadow=true});m.add(blob(d.r*2.2));m.position.set(x,0,z);var bs=m.scale.x;e.bs=bs;m.scale.setScalar(.01);scene.add(m);enemies.push(e);burst(x,1,z,d.col,isBoss?60:14,isBoss?9:4,2);
 if(isBoss){boss=e;$("boss").className="on";$("bossName").textContent=THEMES[curKey].bossName;$("bossBar").style.width="100%"}return e}
function addTele(kind,x,z,r,life,ang,len){var m;if(kind==="ring"){m=new THREE.Mesh(new THREE.RingGeometry(.86,1,40),new THREE.MeshBasicMaterial({color:0xff3344,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));m.scale.set(r,r,1);m.rotation.x=-PI/2;
  var f=new THREE.Mesh(new THREE.CircleGeometry(.86,32),new THREE.MeshBasicMaterial({color:0xff3344,transparent:true,opacity:.18,depthWrite:false}));m.add(f)}
 else{m=new THREE.Mesh(PLANE,new THREE.MeshBasicMaterial({color:0xff3344,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide}));m.scale.set(r*2,len,1);m.rotation.set(-PI/2,0,-ang);m.rotation.order="YXZ";m.rotation.set(-PI/2,ang,0);x+=Math.sin(ang)*len/2;z+=Math.cos(ang)*len/2}
 m.position.set(x,.08,z);scene.add(m);var t={mesh:m,life:life,max:life};tele.push(t);return t}
function shootE(x,y,z,ang,sp,col){var m=new THREE.Mesh(SPH,M(col,{em:col,ei:2}));m.scale.setScalar(.28);m.add(glow(col,5,.6));m.position.set(x,y,z);scene.add(m);eshots.push({mesh:m,x:x,z:z,vx:Math.sin(ang)*sp,vz:Math.cos(ang)*sp,life:4})}
function hurt(n){if(knox.inv>0||knox.dash>0||state!=="play")return;combo=0;comboTimer=0;knox.hp-=n;knox.inv=1.2;shake=.5;hearts();SFX.hurt();var f=$("flash");f.style.transition="none";f.style.opacity=.45;setTimeout(function(){f.style.transition="opacity .4s";f.style.opacity=0},70);
 burst(knox.x,1.2,knox.z,0xff5a7a,16,5);if(navigator.vibrate)try{navigator.vibrate(60)}catch(e){}if(knox.hp<=0)wake()}
function wake(){state="woke";SFX.wake();music(null);hud.className="";ctl.className="";var f=$("flash");f.style.background="#fff";f.style.transition="opacity .5s";f.style.opacity=1;
 setTimeout(function(){viewShift(true);clearLevel();home.visible=true;homeLook();knoxInBed(true);camHome(0);f.style.opacity=0;setTimeout(function(){f.style.background="#ff2a4a"},600);music("home");
  panel("<h2>Knox woke up!</h2><p>Phew... it was only a dream. Mommy and Daddy are right here. Take a deep breath, snuggle back in, and try again.</p><button class='btn' data-a='retry'>Back to sleep (try again)</button><button class='btn alt' data-a='hub'>Pick another dream</button>",{low:true})},550)}
function bossDown(){state="cleared";slow=.25;SFX.win();music(null);progress[curKey]=true;save();$("boss").className="";
 enemies.forEach(function(e){if(e!==boss){e.hp=0}});
 setTimeout(function(){slow=1;hud.className="";ctl.className="";var all=ORDER.every(function(k){return progress[k]});
  panel("<h2>Nightmare defeated!</h2><p>"+THEMES[curKey].bossName+" pops like a soap bubble. "+(all?"That was the LAST nightmare. Knox did it!":"Knox is getting braver every dream.")+"</p>"+(all?"<button class='btn' data-a='ending'>Wake up a hero ➜</button>":"<button class='btn' data-a='hub'>Next nightmare</button>"),{dim:true})},2200)}
function dmg(e,n,sx,sz){e.hp-=n;e.pop=.12;SFX.hit();burst(e.x,1.2*(e.boss?2:1),e.z,e.d.col,6,4);if(!e.boss){var l=Math.hypot(sx,sz)||1;e.x+=sx/l*.5;e.z+=sz/l*.5}
 if(e.boss)$("bossBar").style.width=Math.max(0,e.hp/e.maxhp*100)+"%";
 if(e.hp<=0)kill(e)}
function kill(e){if(state==="play"){combo=comboTimer>0?combo+1:1;comboTimer=4;runScore+=(e.boss?1500:100)*Math.min(combo,5);special=Math.min(100,special+(e.boss?25:8));}var i=enemies.indexOf(e);if(i>=0)enemies.splice(i,1);releaseObject(e.mesh);SFX.kill();burst(e.x,1.2,e.z,e.d.col,e.boss?160:26,e.boss?14:7,3);burst(e.x,1.2,e.z,0xffffff,e.boss?60:8,e.boss?10:5,3);shake=Math.max(shake,e.boss?1:.2);
 if(e.boss){boss=null;bossDown();return}
 var r=Math.random();if(r<.12&&knox.hp<knox.maxhp)addPick("heart",e.x,e.z);else if(r<.2)addPick("star",e.x,e.z)}
function addPick(kind,x,z){var g=new THREE.Group();if(kind==="heart"){var b=M(0xc48a4a);P(g,SPH,b,0,0,0,.3,.34,.26);P(g,SPH,b,0,.42,0,.22,.22,.22);P(g,SPH,b,-.17,.62,0,.09,.09,.06);P(g,SPH,b,.17,.62,0,.09,.09,.06);g.add(glow(0xff7a9a,2.4,.5))}
 else{P(g,new THREE.OctahedronGeometry(.35),M(0xffe27a,{em:0xffd23f,ei:2}),0,.2,0);g.add(glow(0xffe27a,3,.6))}g.position.set(x,.8,z);scene.add(g);picks.push({mesh:g,kind:kind,x:x,z:z,life:9})}

/* ---------- input ---------- */
var keys={},joy={id:null,ox:0,oy:0,x:0,y:0},fireHeld=false,stick=$("stick");
window.addEventListener("keydown",function(e){keys[e.code]=true;if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.code)>=0)e.preventDefault();if(e.code==="KeyP"||e.code==="Escape")if(state==="play")setPause(!paused);audioOn()});
window.addEventListener("keyup",function(e){keys[e.code]=false});
var pad=$("pad");
pad.addEventListener("pointerdown",function(e){audioOn();if(state!=="play"||paused||joy.id!==null)return;if(e.pointerType!=="mouse"||true){joy.id=e.pointerId;joy.ox=e.clientX;joy.oy=e.clientY;joy.x=joy.y=0;stick.style.left=e.clientX+"px";stick.style.top=e.clientY+"px";stick.firstChild.style.transform="";stick.classList.add("on");try{pad.setPointerCapture(e.pointerId)}catch(x){}}});
pad.addEventListener("pointermove",function(e){if(e.pointerId!==joy.id)return;var dx=e.clientX-joy.ox,dy=e.clientY-joy.oy,l=Math.hypot(dx,dy),m=52;if(l>m){dx*=m/l;dy*=m/l}joy.x=dx/m;joy.y=dy/m;stick.firstChild.style.transform="translate("+dx+"px,"+dy+"px)"});
function joyEnd(e){if(e.pointerId!==joy.id)return;joy.id=null;joy.x=joy.y=0;stick.classList.remove("on")}
pad.addEventListener("pointerup",joyEnd);pad.addEventListener("pointercancel",joyEnd);
function hold(btn,down,up){btn.addEventListener("pointerdown",function(e){e.preventDefault();audioOn();btn.classList.add("dn");try{btn.setPointerCapture(e.pointerId)}catch(x){}down()});
 ["pointerup","pointercancel","lostpointercapture"].forEach(function(n){btn.addEventListener(n,function(){btn.classList.remove("dn");if(up)up()})})}
hold($("bFire"),function(){fireHeld=true},function(){fireHeld=false});hold($("bDash"),function(){doDash()});
document.addEventListener("contextmenu",function(e){e.preventDefault()});document.addEventListener("gesturestart",function(e){e.preventDefault()});
document.addEventListener("touchmove",function(e){if(!e.target.closest||!e.target.closest("#ov"))e.preventDefault()},{passive:false});
$("bPause").addEventListener("click",function(){if(state==="play")setPause(!paused)});
var bm=$("bMute");function muteUI(){bm.textContent=muted?"🔇":"🔊";if(master)master.gain.value=muted?0:.5}
bm.addEventListener("click",function(){audioOn();muted=!muted;try{localStorage.setItem("kn_mute",muted?"1":"0")}catch(e){}muteUI()});muteUI();
document.addEventListener("visibilitychange",function(){if(document.hidden&&state==="play")setPause(true)});
function setPause(p){resetInput();paused=p;if(p){fireHeld=false;panel("<h2>Paused</h2><button class='btn' data-a='resume'>Keep dreaming</button><button class='btn alt' data-a='quit'>Wake up (quit)</button><br><button class='btn alt' data-a='quality'>Graphics: "+(fxOn?"Cinematic":"Performance")+"</button><button class='btn alt' id='bAssist' data-a='assist'>"+(autoFire?"AUTO FIRE ON":"AUTO FIRE OFF")+"</button><button class='btn alt' data-a='fs'>Full screen</button>",{dim:true})}else{hidePanel();last=performance.now()}}
function doDash(){if(state!=="play"||paused||knox.dashCd>0)return;knox.dash=.22;knox.dashCd=1.1;knox.inv=Math.max(knox.inv,.3);SFX.dash();burst(knox.x,1,knox.z,0x9fd0ff,14,4,1)}

/* ---------- player update ---------- */
function nearest(maxD){var b=null,bd=maxD*maxD;for(var i=0;i<enemies.length;i++){var e=enemies[i];if(e.grow<1)continue;var d=(e.x-knox.x)*(e.x-knox.x)+(e.z-knox.z)*(e.z-knox.z);if(d<bd){bd=d;b=e}}return b}
function fire(){var th=THEMES[curKey],t=nearest(17),ang=t?Math.atan2(t.x-knox.x,t.z-knox.z):knox.face;knox.face=ang;var n=knox.power>0?3:1;
 for(var i=0;i<n;i++){var a=ang+(n===3?(i-1)*.2:0),m;if(curKey==="grave"){m=new THREE.Mesh(BOX,M(0xffffff,{em:0xddddff,ei:.5}));m.scale.set(.55,.28,.4)}else{m=new THREE.Mesh(SPH,M(th.bolt,{em:th.bolt,ei:2,op:curKey==="sea"?.7:1}));m.scale.setScalar(curKey==="sea"?.3:.2)}
  m.add(glow(th.bolt,curKey==="grave"?3:6,.5));var sea=curKey==="sea";var mx=knox.x+Math.sin(ang)*.7,mz=knox.z+Math.cos(ang)*.7;m.position.set(mx,1.2,mz);scene.add(m);shots.push({mesh:m,x:mx,z:mz,vx:Math.sin(a)*24,vz:Math.cos(a)*24,life:.9})}
 knox.kick=1;knox.aimT=.55;SFX.throw();knox.fireCd=knox.power>0?.22:.27}
function updPlayer(dt){var ix=joy.x,iz=joy.y;if(keys.KeyA||keys.ArrowLeft)ix-=1;if(keys.KeyD||keys.ArrowRight)ix+=1;if(keys.KeyW||keys.ArrowUp)iz-=1;if(keys.KeyS||keys.ArrowDown)iz+=1;
 var l=Math.hypot(ix,iz);if(l>1){ix/=l;iz/=l;l=1}knox.moving=l>.12;if(keys.KeyE){keys.KeyE=false;dreamPulse()}if(keys.ShiftLeft||keys.ShiftRight||keys.KeyK){keys.ShiftLeft=keys.ShiftRight=keys.KeyK=false;doDash()}
 if(knox.moving){knox.dvx=ix/l;knox.dvz=iz/l}
 var sp=curKey==="sea"?6.2:6.8;knox.speed=l;
 if(knox.dash>0){knox.dash-=dt;knox.x+=knox.dvx*24*dt;knox.z+=knox.dvz*24*dt;if(Math.random()<.6)burst(knox.x,1,knox.z,0x9fd0ff,1,1,0)}
 else if(knox.moving){knox.x+=ix*sp*dt;knox.z+=iz*sp*dt}
 var d=Math.hypot(knox.x,knox.z);if(d>R-.6){knox.x*=(R-.6)/d;knox.z*=(R-.6)/d}
 knox.fireCd-=dt;knox.dashCd-=dt;knox.inv-=dt;$("bDash").className=knox.dashCd>0?"cd":"";
 var firing=fireHeld||keys.Space||keys.KeyJ||(autoFire&&!!nearest(15));if(firing&&knox.fireCd<=0)fire();
 if(knox.moving&&!(firing&&nearest(17)))knox.face=Math.atan2(knox.dvx,knox.dvz);
 if(knox.power>0){knox.power-=dt;$("power").textContent="⭐ Triple throw! "+Math.ceil(knox.power)+"s";if(knox.power<=0)$("power").textContent=""}
 knox.rig.position.set(knox.x,0,knox.z);knox.rig.rotation.y=angLerp(knox.rig.rotation.y,knox.face,1-Math.exp(-dt*16));
 if(knox.moving)knox.walk+=dt*10*l;var sea=curKey==="sea";
 knox.aimT=(knox.aimT||0)-dt;knox.tilt.position.y=sea?1.0+Math.sin(T*2)*.15:(knox.moving?Math.abs(Math.sin(knox.walk))*.05:0);
 knox.tilt.rotation.x=lerp(knox.tilt.rotation.x,sea?.12:(knox.dash>0?.18:(knox.moving?.035:0)),1-Math.exp(-dt*9));
 knox.tilt.rotation.z=0;
 knox.rig.visible=true;if(knox.mat){var hurtF=knox.inv>0&&state==="play"&&knox.inv<1.2?(.5+.5*Math.sin(T*30)):0;knox.mat.emissiveIntensity=(sea?.1:.08)+hurtF*.9;knox.mat.emissive.setRGB(1,1-hurtF*.6,1-hurtF*.6)}
 for(var i=picks.length-1;i>=0;i--){var p=picks[i];p.life-=dt;p.mesh.rotation.y+=dt*2;p.mesh.position.y=.8+Math.sin(T*3+i)*.15;
  if(Math.hypot(p.x-knox.x,p.z-knox.z)<1.2){if(p.kind==="heart"){knox.hp=Math.min(knox.maxhp,knox.hp+1);hearts()}else knox.power=8;SFX.pick();burst(p.x,1,p.z,p.kind==="heart"?0xff7a9a:0xffe27a,18,5,2);releaseObject(p.mesh);picks.splice(i,1)}
  else if(p.life<=0){releaseObject(p.mesh);picks.splice(i,1)}}}

/* ---------- enemies ---------- */
function moveTo(e,tx,tz,sp,dt){var dx=tx-e.x,dz=tz-e.z,l=Math.hypot(dx,dz)||1;e.x+=dx/l*sp*(expert?1.16:1)*dt;e.z+=dz/l*sp*(expert?1.16:1)*dt;e.face=angLerp(e.face,Math.atan2(dx,dz),1-Math.exp(-dt*8))}
function updEnemy(e,dt){e.t+=dt;if(e.grow<1){e.grow=Math.min(1,e.grow+dt*2.2);e.mesh.scale.setScalar(e.bs*ease(e.grow));e.mesh.position.set(e.x,0,e.z);return}
 var dx=knox.x-e.x,dz=knox.z-e.z,dist=Math.hypot(dx,dz),toP=Math.atan2(dx,dz),ai=e.ai;e.stT-=dt;e.cd-=dt;
 if(ai==="chase"){moveTo(e,knox.x,knox.z,e.d.sp,dt)}
 else if(ai==="lunge"){if(e.st==="move"){moveTo(e,knox.x,knox.z,e.d.sp,dt);if(dist<7&&e.cd<=0){e.st="wind";e.stT=.5}}
  else if(e.st==="wind"){e.face=toP;e.mesh.position.y=0;if(e.stT<=0){e.st="dash";e.stT=.45;e.vx=Math.sin(toP)*15;e.vz=Math.cos(toP)*15}}
  else if(e.st==="dash"){e.x+=e.vx*dt;e.z+=e.vz*dt;if(e.stT<=0){e.st="move";e.cd=rnd(1.4,2.4)}}}
 else if(ai==="ranged"){if(dist>10)moveTo(e,knox.x,knox.z,e.d.sp,dt);else if(dist<6)moveTo(e,e.x-dx,e.z-dz,e.d.sp,dt);else e.face=angLerp(e.face,toP,.1);
  if(e.cd<=0&&dist<14){e.cd=rnd(2,3);shootE(e.x,1.5,e.z,toP,8.5,0x7dff3a);tone(200,.15,"square",.06,90)}}
 else if(ai==="charger"){if(e.st==="move"){var a=Math.atan2(e.x-knox.x,e.z-knox.z)+.9*dt*(e.type.length%2?1:-1)*4;moveTo(e,knox.x+Math.sin(a)*8,knox.z+Math.cos(a)*8,e.d.sp,dt);if(e.cd<=0&&dist<13){e.st="wind";e.stT=.7;e.tl=addTele("line",e.x,e.z,.7,.7,toP,14);e.ca=toP;SFX.warn()}}
  else if(e.st==="wind"){e.face=angLerp(e.face,e.ca,.25);if(e.stT<=0){e.st="dash";e.stT=.8;e.vx=Math.sin(e.ca)*18;e.vz=Math.cos(e.ca)*18}}
  else if(e.st==="dash"){e.x+=e.vx*dt;e.z+=e.vz*dt;if(e.stT<=0||Math.hypot(e.x,e.z)>R){e.st="move";e.cd=rnd(2,3.4)}}}
 else if(ai==="drift"){moveTo(e,knox.x,knox.z,e.d.sp,dt);if(e.cd<=0&&dist<6){e.cd=rnd(3,4.2);e.st="zap";e.stT=.9;e.zx=e.x;e.zz=e.z;addTele("ring",e.x,e.z,3.3,.9)}
  if(e.st==="zap"&&e.stT<=0){e.st="move";burst(e.zx,1.5,e.zz,0xff7ad9,40,9,0);tone(900,.2,"sawtooth",.1,200);if(Math.hypot(knox.x-e.zx,knox.z-e.zz)<3.3)hurt(1)}}
 else if(ai==="boss")updBoss(e,dt,dist,toP);
 var dd=Math.hypot(e.x,e.z);if(dd>R-.3&&!e.boss){e.x*=(R-.3)/dd;e.z*=(R-.3)/dd}if(e.boss&&dd>R+1){e.x*=(R+1)/dd;e.z*=(R+1)/dd}
 if(dist<e.r+.45&&e.y<1.5){hurt(1);if(!e.boss){e.x-=dx/(dist||1)*1.2;e.z-=dz/(dist||1)*1.2}}
 /* anim */
 var m=e.mesh,L=m.userData.limbs||[],w=Math.sin(e.t*(e.ai==="lunge"?14:6));
 if(e.type==="walker"||e.type==="skinwalker"){L[0].rotation.x=-.5+w*.5;L[1].rotation.x=-.5-w*.5;m.rotation.z=w*.04}
 else if(e.type==="crawler"){for(var i=0;i<L.length;i++)L[i].rotation.x=(i%2?w:-w)*.7;m.position.y=e.st==="wind"?-.15:0}
 else if(e.type==="shambler"||e.type==="king"){L[0].rotation.x=.15+w*.12;L[1].rotation.x=-.15-w*.12;m.rotation.z=w*.09}
 else if(e.type==="spitter"){var q=1+Math.sin(e.t*3)*.04;m.scale.set(e.bs*q,e.bs/q,e.bs*q)}
 else if(m.userData.tail){m.userData.tail.rotation.y=Math.sin(e.t*(e.st==="dash"?20:8))*.5;m.userData.body.position.y=1.4+Math.sin(e.t*2)*.15;m.userData.body.rotation.z=Math.sin(e.t*8)*.05}
 else if(e.type==="jelly"){var pz=1+Math.sin(e.t*4)*.12;m.userData.body.scale.set(pz,1/pz,pz);m.userData.body.position.y=1.7+Math.sin(e.t*1.5)*.3}
 if(e.pop>0){e.pop-=dt;if(e.type!=="spitter")m.scale.setScalar(e.bs*(1+e.pop*1.4))}else if(e.type!=="spitter")m.scale.setScalar(e.bs);
 m.position.x=e.x;m.position.z=e.z;if(e.boss)m.position.y=e.y;m.rotation.y=e.face}
function updBoss(e,dt,dist,toP){var rage=e.hp<e.maxhp*.4,d=e.d;
 if(e.st==="move"){moveTo(e,knox.x,knox.z,d.sp*(rage?1.25:1),dt);if(e.cd<=0){var a=d.atk[e.atkI%d.atk.length];e.atkI++;e.st=a;
   if(a==="charge"){e.stT=.95;e.ca=toP;e.ph=0;addTele("line",e.x,e.z,e.r,.95,toP,26);SFX.warn()}
   else if(a==="volley"){e.stT=1.6;e.ph=0;SFX.roar()}
   else if(a==="slam"){e.stT=1.15;e.ph=0;e.sx=e.x;e.sz=e.z;e.tx=knox.x;e.tz=knox.z;addTele("ring",e.tx,e.tz,5.2,1.15);SFX.warn()}
   else if(a==="summon"){e.stT=1;e.ph=0;SFX.roar()}}}
 else if(e.st==="charge"){if(e.ph===0){e.face=angLerp(e.face,e.ca,.3);if(e.stT<=0){e.ph=1;e.stT=1.1;e.vx=Math.sin(e.ca)*22;e.vz=Math.cos(e.ca)*22}}
  else{e.x+=e.vx*dt;e.z+=e.vz*dt;if(Math.random()<.5)burst(e.x,1,e.z,d.col,1,2,0);if(e.stT<=0||Math.hypot(e.x,e.z)>R){e.st="move";e.cd=rage?1.1:1.9}}}
 else if(e.st==="volley"){e.face=angLerp(e.face,toP,.1);var k=Math.floor((1.6-e.stT)/.5);if(k>e.ph-1&&e.ph<3){e.ph++;var n=rage?14:10,off=e.ph*.3;for(var i=0;i<n;i++)shootE(e.x,1.4,e.z,off+i/n*PI*2,7.5,d.shot);tone(160,.25,"sawtooth",.12,80)}if(e.stT<=0){e.st="move";e.cd=rage?1.2:2}}
 else if(e.st==="slam"){var t=1-e.stT/1.15;if(e.ph===0){e.x=lerp(e.sx,e.tx,ease(t));e.z=lerp(e.sz,e.tz,ease(t));e.y=Math.sin(clamp(t,0,1)*PI)*7;
   if(e.stT<=0){e.ph=1;e.y=0;e.stT=.5;shake=1;noise(.4,.5,300);burst(e.x,.5,e.z,d.col,70,11,4);if(Math.hypot(knox.x-e.x,knox.z-e.z)<5.2)hurt(1)}}else if(e.stT<=0){e.st="move";e.cd=rage?1:1.8}}
 else if(e.st==="summon"){if(e.ph===0&&e.stT<.5){e.ph=1;var c=enemies.length;for(var j=0;j<(rage?4:3)&&c<8;j++,c++){var a2=rnd(0,PI*2);spawn(d.minion,e.x+Math.sin(a2)*4,e.z+Math.cos(a2)*4)}}if(e.stT<=0){e.st="move";e.cd=rage?1.5:2.4}}}

/* ---------- camera ---------- */
var camT=new THREE.Vector3();
function camOffset(){var z=boss?1.15:1;return aspect<1?[0,4.5*z,7.5*z]:[0,3.15*z,5.7*z]}
function camSnap(){var o=camOffset();camera.position.set(knox.x+o[0],o[1],knox.z+o[2]);camera.lookAt(knox.x,1.35,knox.z-2.4)}
function updCam(dt){var o=camOffset(),k=1-Math.exp(-dt*6);camT.set(knox.x+o[0],o[1],knox.z+o[2]);camera.position.lerp(camT,k);
 if(shake>0){shake=Math.max(0,shake-dt*2.2);if(!reducedMotion){camera.position.x+=rnd(-1,1)*shake*.10;camera.position.y+=rnd(-1,1)*shake*.08}}camera.lookAt(camera.position.x-o[0],1.35,camera.position.z-o[2]-2.4)}

/* ---------- ending ---------- */
var endText=[[0,"The last nightmare is gone."],[3.2,"Knox found his courage."],[7.5,"He tiptoes past Mommy and Daddy..."],[11.5,"...down the hall..."],[15,"...to his very own room."],[19.5,"Safe, cozy, and ready to dream."]];
function startEnding(){resetInput();paused=false;slow=1;updEnding.last=-1;viewShift(false);state="ending";endT=0;clearLevel();hidePanel();home.visible=true;homeLook();knoxInBed(false);hud.className="";ctl.className="";music("home");camHome(0);knox.rig.visible=true;$("banner").style.fontSize="clamp(24px,6vw,44px)"}
var PATH=[[0,1.22,-1.2],[0,0,1.4],[6.2,0,1.6],[14,0,.8],[22,0,1.4],[26.2,0,-.6],[28,1.22,-2.6]];
function updEnding(dt){endT=Math.min(endT+dt,28);var t=endT,k=knox,seg,u;k.moving=false;k.sit=false;
 for(var i=endText.length-1;i>=0;i--)if(t>=endText[i][0]){if(updEnding.last!==i){updEnding.last=i;banner(endText[i][1],2600)}break}
 function go(a,b,u,walk){var A=PATH[a],B=PATH[b];k.rig.position.set(lerp(A[0],B[0],u),lerp(A[1],B[1],u)+(walk?Math.abs(Math.sin(k.walk))*.04:0),lerp(A[2],B[2],u));if(walk){k.moving=true;k.walk+=dt*7.5;k.tilt.rotation.x=.04;k.shadow.visible=true;k.rig.rotation.y=angLerp(k.rig.rotation.y,Math.atan2(B[0]-A[0],B[2]-A[2]),.12);k.tilt.rotation.z=0}}
 k.rig.scale.set(1,1,1);
 if(t<2){knoxInBed(false)}
 else if(t<4){u=ease((t-2)/2);go(0,1,u,false);k.tilt.rotation.x=lerp(-PI/2,0,u);k.rig.rotation.y=0;k.shadow.visible=true}
 else if(t<7.5){go(1,2,ease((t-4)/3.5),true)}
 else if(t<11.5){go(2,3,(t-7.5)/4,true)}
 else if(t<15){go(3,4,(t-11.5)/3.5,true)}
 else if(t<18){go(4,5,ease((t-15)/3),true)}
 else if(t<20){u=ease((t-18)/2);go(5,6,u,false);k.tilt.rotation.x=lerp(0,-PI/2,u);k.tilt.rotation.z=0;k.rig.rotation.y=angLerp(k.rig.rotation.y,0,.2);k.shadow.visible=u<.5}
 else{k.rig.position.set(28,1.22,-2.6);k.tilt.rotation.set(-PI/2,0,0);k.rig.rotation.y=0}
 if(t<=20)camHome(clamp(k.rig.position.x,0,28),dt);endingPolish(t,dt);
 var dim=ease((t-19.5)/3);homeLights[0].intensity=1.3*(1-dim*.8);homeLights[1].intensity=.9*(1-dim*.85);homeLights[2].intensity=1.1-dim*.5;hemi.intensity=.55-dim*.25;
 nightStars.forEach(function(s,i){s.material.opacity=dim*(.55+.45*Math.sin(t*2+i))});
 if(t>20&&Math.random()<.25)burst(rnd(23,33),rnd(3,6),rnd(-4,0),[0xffe27a,0x9fd0ff,0xff9fe0][Math.floor(rnd(0,3))],2,1.5,.6);
 if(t>27&&state==="ending"){state="theend";SFX.win();$("banner").style.fontSize="";panel("<div class='eyebrow'>ALL THREE DREAM WORLDS SAVED</div><h1>Dream<br>Champion.</h1><p>Three dream worlds saved. One incredible hero. Knox settles into his own cozy bed. Mommy and Daddy are always nearby.</p><p><b>Goodnight, Knox. Sweet dreams. 💛</b></p><button class='btn' data-a='reset'>Play again</button><button class='btn alt' data-a='ending'>Watch again</button>",{low:true})}}

var arrowEls=[];(function(){var c=$("arrows");for(var i=0;i<8;i++){var e=document.createElement("i");c.appendChild(e);arrowEls.push(e)}})();
function updArrows(on){var n=0,w=window.innerWidth,h=window.innerHeight;if(on)for(var i=0;i<enemies.length&&n<8;i++){var e=enemies[i];_V.set(e.x,1,e.z).project(camera);var behind=_V.z>1;if(behind){_V.x=-_V.x;_V.y=-_V.y}
  if(!behind&&Math.abs(_V.x)<.97&&Math.abs(_V.y)<.97)continue;var m=Math.max(Math.abs(_V.x),Math.abs(_V.y))||1,x=_V.x/m*.9,y=_V.y/m*.84,el=arrowEls[n++];el.style.display="block";el.style.borderBottomColor=e.boss?"#ffd23f":"#ff5a4a";
  el.style.transform="translate("+((x*.5+.5)*w)+"px,"+((-y*.5+.5)*h)+"px) rotate("+Math.atan2(x,y)+"rad)"}
 for(;n<8;n++)arrowEls[n].style.display="none"}
/* ---------- main loop ---------- */
var last=performance.now(),fpsAcc=0,fpsN=0;
function frame(now){requestAnimationFrame(frame);var rdt=Math.min(.05,(now-last)/1000);last=now;if(paused){draw();return}
 var dt=rdt*slow;T+=dt;fpsAcc+=rdt;fpsN++;if(fpsN===90){if(fpsAcc/90>.03){if(PR>1){PR=Math.max(1,PR-.5);renderer.setPixelRatio(PR);resize()}else if(fxOn&&fpsAcc/90>.045){fxOn=false;renderer.shadowMap.enabled=false}}fpsAcc=0;fpsN=0}
 if(state==="play"||state==="cleared"){
  if(state==="play"){updPlayer(dt);
   for(var q=spawnQ.length-1;q>=0;q--){spawnQ[q].t-=dt;if(spawnQ[q].t<=0){spawn(spawnQ[q].type,null,null,spawnQ[q].boss);spawnQ.splice(q,1)}}
   if(!enemies.length&&!spawnQ.length&&!boss&&state==="play"){waveGap-=dt;if(waveGap<=0){waveGap=1.6;nextWave()}}}
  for(var i=enemies.length-1;i>=0;i--){var e=enemies[i];if(e.hp<=0&&!e.boss){kill(e);continue}if(state==="play")updEnemy(e,dt)}
  for(i=0;i<enemies.length;i++)for(var j=i+1;j<enemies.length;j++){var a=enemies[i],b=enemies[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),mn=a.r+b.r;if(d<mn&&d>.001){var p=(mn-d)/2;if(!a.boss){a.x-=dx/d*p;a.z-=dz/d*p}if(!b.boss){b.x+=dx/d*p;b.z+=dz/d*p}}}
  for(i=shots.length-1;i>=0;i--){var s=shots[i];s.life-=dt;s.x+=s.vx*dt;s.z+=s.vz*dt;s.mesh.position.set(s.x,1.2,s.z);if(Math.random()<.7)burst(s.x,1.2,s.z,THEMES[curKey].bolt,1,.4,0);s.mesh.rotation.x+=dt*12;s.mesh.rotation.z+=dt*9;var hit=false;
   for(j=0;j<enemies.length;j++){var en=enemies[j];if(en.grow<1||en.y>2.5)continue;if(Math.hypot(en.x-s.x,en.z-s.z)<en.r+.35){dmg(en,1,s.vx,s.vz);hit=true;break}}
   if(hit||s.life<=0){releaseObject(s.mesh);shots.splice(i,1)}}
  for(i=eshots.length-1;i>=0;i--){var es=eshots[i];es.life-=dt;es.x+=es.vx*dt;es.z+=es.vz*dt;es.mesh.position.x=es.x;es.mesh.position.z=es.z;var h2=Math.hypot(es.x-knox.x,es.z-knox.z)<.6;if(h2)hurt(1);
   if(h2||es.life<=0||Math.hypot(es.x,es.z)>R+3){releaseObject(es.mesh);eshots.splice(i,1)}}
  for(i=tele.length-1;i>=0;i--){var tl=tele[i];tl.life-=dt;tl.mesh.material.opacity=(.35+.45*Math.abs(Math.sin(T*16)))*(tl.mesh.geometry.type==="RingGeometry"?1:.6);if(tl.life<=0){releaseObject(tl.mesh);tele.splice(i,1)}}
  animDecor.forEach(function(d){var o=d.o;if(d.t==="fly"){o.position.set(o.userData.b.x+Math.sin(T*.7+o.userData.k)*1.5,o.userData.b.y+Math.sin(T+o.userData.k*2)*.5,o.userData.b.z+Math.cos(T*.6+o.userData.k)*1.5);o.material.opacity=.5+.5*Math.sin(T*3+o.userData.k)}
   else if(d.t==="blink"){o.visible=Math.sin(T*.8+d.k)>-.6}else if(d.t==="mist"){o.position.x=o.userData.b.x+Math.sin(T*.2+o.userData.k)*3}
   else if(d.t==="caus"){o.material.map.offset.set(T*(d.k?-.012:.016),T*(d.k?.01:.008))}else if(d.t==="bolt"){d.next-=dt;if(d.next<=0){d.next=rnd(5,11);d.v=1;SFX.roar&&0}if(d.v>0){d.v-=dt*2.6;hemi.intensity=THEMES.grave.hemi[2]+Math.max(0,d.v)*(Math.random()<.5?2.4:.8)}}else if(d.t==="ray"){o.material.opacity=.05+.04*Math.sin(T+d.k)}else if(d.t==="bub"){var ar=o.geometry.attributes.position;for(var n=0;n<ar.count;n++){var y=ar.getY(n)+dt*1.4;if(y>14)y=0;ar.setY(n,y)}ar.needsUpdate=true}});
  if(curKey==="forest"&&Math.random()<.25)burst(knox.x+rnd(-14,14),rnd(.2,1),knox.z+rnd(-12,8),Math.random()<.5?0xff8a3a:0xd8ff7a,1,.4,-.8);if(curKey==="grave"&&Math.random()<.2)burst(knox.x+rnd(-14,14),.2,knox.z+rnd(-12,8),0x7dff6a,1,.3,-1.2);
  if(curKey==="sea"&&Math.random()<.3)burst(knox.x+rnd(-.3,.3),1.8,knox.z,0xcff6ff,1,.6,-3);
  updCam(dt)}
 else if(state==="ending"||state==="theend")updEnding(dt);
 else if(state==="hub"||state==="title"||state==="woke"){camHome(0);camera.position.x=Math.sin(T*.3)*.5;if(state!=="woke"){knox.tilt.position.y=Math.sin(T*1.6)*.015}
  if(Math.random()<.04)burst(rnd(-.6,.6),2.6,-2.6,0xcfd8ff,1,.5,-.6)}
 updateUpgrade(dt);var playing=state==="play"||state==="cleared";updArrows(state==="play");
 animKnox(dt,playing?{move:state==="play"&&knox.moving?1:0,aim:state==="play"&&knox.aimT>0,swim:curKey==="sea",gunOk:true}:(state==="ending"||state==="theend")?{move:knox.moving?.62:0,rest:!knox.moving}:{rest:true,sit:knox.sit});
 updParts(dt);sunFollow(knox.rig.position);draw()}

var internalDebug={move:function(x,y){joy.x=x;joy.y=y},enemies:function(){return enemies},knox:knox,camera:camera,start:startLevel,state:function(){return state},win:function(k){progress[k]=true},boss:function(){enemies.forEach(function(e){e.hp=0});spawnQ=[];waveIdx=2;waveGap=.1},ending:startEnding,t:function(v){endT=v},god:function(){knox.maxhp=99;knox.hp=99},hub:goHub,wake:wake,fire:function(v){fireHeld=v},killboss:function(){if(boss)dmg(boss,999,0,1)},info:function(){return {e:enemies.length,w:waveIdx,hp:knox.hp,boss:!!boss}}};
// Dispose scene-owned resources while retaining the shared primitives and texture atlas.
function releaseObject(object){
 scene.remove(object);var geos=new Set(),mats=new Set(),textures=new Set(),shared=[SPH,CYL,CONE,BOX,DOME,PLANE],cached=Object.keys(mcache).map(function(k){return mcache[k]});
 object.traverse(function(n){if(n.geometry&&shared.indexOf(n.geometry)<0)geos.add(n.geometry);if(n.material){(Array.isArray(n.material)?n.material:[n.material]).forEach(function(m){if(cached.indexOf(m)<0&&m!==shadowMat)mats.add(m)})}});
 mats.forEach(function(m){['map','bumpMap','normalMap','emissiveMap'].forEach(function(k){if(m[k]&&m[k]!==dotTex&&m[k]!==dreamSky)textures.add(m[k])});m.dispose()});geos.forEach(function(g){g.dispose()});textures.forEach(function(t){t.dispose()});
}
/* Dream Champion edition — mobile controls, progression, scenery and finale. */
var reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var expert=true,autoFire=false,special=100,runScore=0,combo=0,comboTimer=0,runTime=0,bestScore=0;
try{expert=localStorage.getItem('kn_expert')!=='0';bestScore=Number(localStorage.getItem('kn_best')||0)}catch(e){}
var pulseFX=[],heroMode=false,worldAccent=0x58f5ce;
function resetInput(){if(typeof keys!=='undefined')keys={};fireHeld=false;if(typeof joy!=='undefined'){joy.id=null;joy.x=joy.y=0;}if(typeof stick!=='undefined')stick.classList.remove('on');}
window.addEventListener('blur',function(){resetInput();if(state==='play')setPause(true)});
function dreamPulse(){
 if(state!=='play'||paused||special<100)return;special=0;knox.inv=Math.max(knox.inv,1.1);
 var mesh=new THREE.Mesh(new THREE.TorusGeometry(1,.045,8,64),M(0x82fff0,{em:0x35f5d5,ei:3}));mesh.rotation.x=PI/2;mesh.position.set(knox.x,.22,knox.z);scene.add(mesh);pulseFX.push({mesh:mesh,t:0});
 var targets=enemies.slice();targets.forEach(function(e){var dx=e.x-knox.x,dz=e.z-knox.z,d=Math.hypot(dx,dz);if(d<8){dmg(e,e.boss?8:4,dx*5,dz*5);if(e.hp>0&&!e.boss){e.x+=dx/(d||1)*2;e.z+=dz/(d||1)*2;}}});
 eshots.forEach(function(s){releaseObject(s.mesh)});eshots=[];burst(knox.x,1,knox.z,0x66ffdf,70,9,1);banner('DREAM PULSE',850);tone(160,.5,'sine',.2,900);tone(784,.7,'triangle',.15);
}
hold($('bPulse'),dreamPulse);
function safeStore(k,v){try{localStorage.setItem(k,v)}catch(e){}}
var originalAct=act;act=function(a){
 if(a==='quality'){fxOn=!fxOn;setPause(true);return}
 if(a==='difficulty'){expert=!expert;safeStore('kn_expert',expert?'1':'0');showHub();return}
 if(a==='assist'){autoFire=!autoFire;$('bAssist').textContent=autoFire?'AUTO FIRE ON':'AUTO FIRE OFF';return}
 if(a==='preview-ending'){startEnding();return}
 if(a==='hero'){title();return}
 originalAct(a);
};
var originalStart=startLevel;startLevel=function(k){heroMode=false;originalStart(k);$('bFire').innerHTML='<span>✦</span>BLAST';$('bPulse').disabled=false;$('touchHint').classList.add('on');setTimeout(function(){$('touchHint').classList.remove('on')},5500)};
// A deliberate hero presentation: Knox is recognizable before play begins.
function setupHero(){
 resetInput();clearLevel();home.visible=false;level=buildLevel('forest');heroMode=true;viewShift(true);hud.className='';ctl.className='';
 knox.rig.visible=true;knox.rig.position.set(0,0,0);knox.rig.rotation.set(0,-.18,0);knox.tilt.rotation.set(0,0,0);knox.tilt.position.set(0,0,0);knox.shadow.visible=true;knox.aura.visible=false;knox.moving=false;knox.speed=0;knox.aimT=0;
 camera.position.set(.35,1.65,3.55);camera.lookAt(0,.92,0);music('home');
}
title=function(){state='title';setupHero();panel('<div class="eyebrow"><i></i> A KNOX ORIGINAL ADVENTURE</div><h1 class="wordmark">KNOX<span>& THE NIGHTMARES</span></h1><p class="tagline">Little hero. Big dreams.</p><p>Fast asleep in Mommy and Daddy’s bed,<br>Knox enters three worlds only he can save.</p><button class="btn primary" data-a="start">LET’S DREAM <span>↗</span></button><div class="menu-meta"><span>3 WORLDS</span><span>YOUR HERO</span><span>YOUR ADVENTURE</span></div><p class="hint">Best in landscape · headphones recommended</p>',{low:true})};
function showHub(){state='hub';setupHero();var all=ORDER.every(function(k){return progress[k]});var count=ORDER.filter(function(k){return progress[k]}).length;
 var html='<div class="eyebrow">THE DREAM ATLAS <span>'+count+' / 3 SAVED</span></div><h2>'+(all?'You did it,<br>dream champion.':'Choose your<br>next adventure.')+'</h2><div class="dreams">';
 ORDER.forEach(function(key,i){var t=THEMES[key];html+='<button class="dream '+key+(progress[key]?' done':'')+'" data-a="dream:'+key+'"><span class="world-number">0'+(i+1)+'</span><div><b>'+t.name+'</b><em>'+ (progress[key]?'★ DREAM RESTORED':t.sub+' · 3 waves + boss')+'</em></div><span class="world-arrow">↗</span></button>'});
 html+='</div><button class="mode" data-a="difficulty">'+(expert?'◆ NIGHTMARE MODE':'◇ HERO MODE')+' <span>CHANGE</span></button>';
 if(all)html+='<button class="btn primary" data-a="ending">THE WAY HOME <span>↗</span></button>';
 else html+='<p class="hint">Move with your left thumb. Hold BLAST to aim and fire.<br>DASH through danger. PULSE when surrounded.</p>';
 if(bestScore)html+='<div class="personal-best">PERSONAL BEST <b>'+bestScore.toLocaleString()+'</b></div>';
 panel(html,{low:true});
}
goHub=function(){paused=false;slow=1;showHub()};
intro=function(k){curKey=k;var t=THEMES[k];panel('<div class="eyebrow">DREAM WORLD 0'+(ORDER.indexOf(k)+1)+'</div><h2>'+t.name+'</h2><p>'+t.intro+'</p><div class="mission"><span>YOUR MISSION</span><b>Survive three waves. Defeat '+t.bossName.toLowerCase()+'.</b><em>'+ (expert?'Faster enemies. Tougher bosses. Bring your best.':'Watch for red attack warnings. Dash to dodge.')+'</em></div><button class="btn primary" data-a="go">ENTER THE DREAM ↗</button><button class="btn alt" data-a="hub">Back</button>',{dim:true})};
// Rich, batched environment details stay affordable on an iPhone GPU.
var dreamSky=new THREE.TextureLoader().load('assets/dream-sky.jpg');dreamSky.encoding=THREE.sRGBEncoding;
var originalBuildLevel=buildLevel;
buildLevel=function(key){var th=THEMES[key];
 th.fog=key==='sea'?.016:.012;th.hemi[2]=.65;th.sun[1]=1.1;th.exp=1.0;th.bloom=.32;
 if(key==='forest'){th.sky=[0x10265e,0x5b6faa,0x182d44];th.bg=0x283f69;th.ground=['#254548','#345b51','#263c46','#3d6359'];th.sun=[0xffe5b6,1.2];th.rim=0x66ffdc;}
 if(key==='grave'){th.sky=[0x241e56,0x7973a1,0x1b3049];th.bg=0x454269;th.ground=['#2c4445','#47605a','#273743','#51595f'];th.sun=[0xf6deff,1.15]}
 if(key==='sea'){th.sky=[0x42b9d2,0x147eae,0x063849];th.bg=0x187492;th.ground=['#547f88','#6a9597','#426e80','#7a9d99'];th.sun=[0xd0ffff,1.4]}
 var g=originalBuildLevel(key);worldAccent=th.rim;
 if(key!=='sea'){
  var sky=new THREE.Mesh(new THREE.SphereGeometry(190,48,24,0,PI*2,0,PI/2+.15),new THREE.MeshBasicMaterial({map:dreamSky,side:THREE.BackSide,fog:false,color:key==='grave'?0xb6b0ff:0xffffff}));sky.rotation.y=1.8;sky.renderOrder=-8;g.add(sky);
 }

 if(key==='forest'){g.children.slice().forEach(function(n){if(n.isInstancedMesh&&(n.geometry===CONE||n.geometry===CYL))g.remove(n)});}

 // Distant layered silhouettes and islands create depth above the horizon.
 var rockGeo=new THREE.IcosahedronGeometry(1,1),rocks=inst(rockGeo,M(key==='sea'?0x426c7c:0x425c79,{flat:true}),42);
 for(var i=0;i<42;i++){var a=i/42*PI*2,r=33+(i%3)*9,h=4+(i*7%13);setI(rocks,i,Math.cos(a)*r,h*.2,Math.sin(a)*r,4+i%4,h*.65,4+i%5,i*.7)}g.add(rocks);
 if(key==='forest'){
  var trunks=inst(CYL,M(0x635447),40),leaves=inst(new THREE.IcosahedronGeometry(1,2),M(0x236848,{r:.9}),120);
  for(i=0;i<40;i++){var a=i/40*PI*2,r=28+i%5*2,x=Math.cos(a)*r,z=Math.sin(a)*r,h=3.5+i%4;setI(trunks,i,x,h*.45,z,.22,h,.22);for(var n=0;n<3;n++)setI(leaves,i*3+n,x+Math.cos(n*2+i)*1.6,h+n*.9,z+Math.sin(n*2+i)*1.6,2.9+n*.1,2.2,2.9,i)}g.add(trunks,leaves);
  var blades=inst(new THREE.ConeGeometry(1,1,3),M(0x4b8a76),900);
  for(i=0;i<900;i++){a=rnd(0,PI*2);r=rnd(5,25);setI(blades,i,Math.sin(a)*r,.12,Math.cos(a)*r,.025,rnd(.15,.35),.055,a)}g.add(blades);
 }
 // Crystalline dream beacons: distinct colors for each world, framing the arena.
 var crystalGeo=new THREE.OctahedronGeometry(1),crystalMat=M(th.rim,{em:th.rim,ei:.35,r:.2});
 for(i=0;i<12;i++){var a=i/12*PI*2,x=Math.sin(a)*21,z=Math.cos(a)*21;
 P(g,CYL,M(0x45556b),x,.22,z,.8,.44,.8);P(g,crystalGeo,crystalMat,x,1.25,z,.33,1.1,.33,0,a,.12);
 var light=glow(th.rim,2,.24);light.position.set(x,1.1,z);g.add(light);
 }
 // Monumental gate visible across the battlefield.
 var gate=new THREE.Group();gate.position.set(0,0,-25);g.add(gate);var stone=M(key==='sea'?0x3b7890:0x627080,{r:.75});
 [-1,1].forEach(function(sign){P(gate,BOX,stone,sign*3,3,0,1.1,6,1.5,0,sign*.07);P(gate,BOX,stone,sign*3,6.1,0,1.6,.4,1.8);P(gate,crystalGeo,crystalMat,sign*3,6.85,0,.3,.7,.3)});
 var arch=new THREE.Mesh(new THREE.TorusGeometry(3,.48,12,32,PI),stone);arch.position.y=4.8;gate.add(arch);
 var portal=new THREE.Mesh(new THREE.CircleGeometry(2.55,64),new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uTime:{value:0},color:{value:new THREE.Color(th.rim)}},vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 uvv;uniform float uTime;uniform vec3 color;void main(){vec2 p=uvv-.5;float r=length(p)*2.;float v=.45+.25*sin(r*24.-uTime*2.);float a=(1.-smoothstep(.75,1.,r))*.5;gl_FragColor=vec4(color*(.4+v),a);}'}));portal.position.set(0,3.2,.15);gate.add(portal);g.userData.portal=portal;
 if(key==='grave'){
  for(i=0;i<10;i++){a=i/10*PI*2;var lantern=new THREE.Group();lantern.position.set(Math.cos(a)*22,0,Math.sin(a)*22);g.add(lantern);P(lantern,CYL,M(0x27334b),0,1.5,0,.07,3,.07);P(lantern,BOX,M(0xffd68b,{em:0xffbb66,ei:1.4}),0,3,0,.32,.5,.32);P(lantern,CONE,M(0x35425b),0,3.38,0,.38,.25,.38);}
 }
 if(key==='sea'){
  var coral=inst(CYL,M(0xc57ca4,{r:.6}),120);for(i=0;i<120;i++){a=i/120*PI*2;r=20+i%6;setI(coral,i,Math.sin(a)*r,.7+i%3*.2,Math.cos(a)*r,.13,1.4+i%3*.4,.13,a,(i%3-1)*.6)}g.add(coral);
 }
 g.traverse(function(n){if(n.isInstancedMesh){n.receiveShadow=true;n.castShadow=true}});
 return g;
};
// One amber key light keeps Knox's real texture visible in every world.
var heroFill=new THREE.DirectionalLight(0xffead9,.55);heroFill.position.set(2,5,7);scene.add(heroFill);scene.add(heroFill.target);
function updateUpgrade(dt){
 if(heroMode&&(state==='title'||state==='hub')){knox.tilt.rotation.set(0,0,0);knox.rig.position.set(0,0,0);knox.tilt.position.y=Math.sin(T*1.6)*.007;camera.position.set(.35,1.8,aspect<1?4.9:3.55);camera.lookAt(0,.92,0)}
 heroFill.position.set(knox.rig.position.x+2,5,knox.rig.position.z+7);heroFill.target.position.copy(knox.rig.position);
 if(level&&level.userData.portal)level.userData.portal.material.uniforms.uTime.value=T;
 for(var i=pulseFX.length-1;i>=0;i--){var fx=pulseFX[i];fx.t+=dt;fx.mesh.scale.setScalar(1+fx.t*15);if(fx.t>.65){scene.remove(fx.mesh);fx.mesh.geometry.dispose();pulseFX.splice(i,1)}}
 if(state==='play'){runTime+=dt;comboTimer=Math.max(0,comboTimer-dt);if(!comboTimer)combo=0;special=Math.min(100,special+dt*2.4);
 $('score').textContent=runScore.toLocaleString();$('combo').textContent=combo>1?Math.min(combo,5)+'× COMBO':'';
 $('bPulse').disabled=special<100;$('bPulse').innerHTML='<span>◎</span>'+(special>=100?'PULSE':Math.floor(special)+'%');
 $('bPulse').style.setProperty('--charge',special+'%');$('bDash').textContent=knox.dashCd>0?'•••':'DASH';
 $('objective').textContent=expert?'NIGHTMARE MODE · '+(boss?'BREAK THE NIGHTMARE':'STAY SHARP. KEEP MOVING.'):(boss?'DODGE THE RED WARNINGS · DEFEAT THE BOSS':'RESTORE THE DREAM · '+enemies.length+' SHADOWS NEARBY');
 if(knox.dash>0&&Math.random()<.4)burst(knox.x,.2,knox.z,0x89ffdf,2,1.2,0);
 }
}
var oldBossDown=bossDown;bossDown=function(){bestScore=Math.max(bestScore,runScore);safeStore('kn_best',String(bestScore));oldBossDown();for(var i=0;i<6;i++)(function(n){setTimeout(function(){if(state==='cleared'){burst(knox.x+rnd(-6,6),rnd(2,5),knox.z+rnd(-5,4),[0xffdc82,0x66ffdc,0xb494ff][n%3],50,7,2)}},n*300)})(i)};
// Home gets warm lighting, a star rug and a trail of little guiding lights.
(function(){
 var rug=new THREE.Mesh(new THREE.CircleGeometry(2.5,64),M(0x496db0));rug.rotation.x=-PI/2;rug.position.set(28,.025,1.5);home.add(rug);
 for(var i=0;i<15;i++){var x=4+i*1.45;P(home,SPH,M(0xffd98a,{em:0xffc466,ei:1}),x,.09,2.4,.07,.045,.07)}
 [0,28].forEach(function(x){for(var i=0;i<7;i++)P(home,BOX,M(i%2?0x8b725d:0x786450),x-6+i*2,-.005,0,1.97,.02,10.6)});
 var flag=new THREE.Mesh(PLANE,new THREE.MeshBasicMaterial({map:textTex('DREAM BIG, KNOX','#233e70','#ffe4a0',1024,256,'bold 72px Arial')}));flag.position.set(28,3.7,-5.18);flag.scale.set(4,1,1);home.add(flag);
})();
function endingPolish(t,dt){
 heroMode=false;knox.gun.visible=false;
 // Follow close during the walk, settle on a warm bedside portrait at the end.
 if(t>4&&t<19){camera.position.y=4.3;camera.position.z=8;camera.lookAt(camera.position.x,1.15,-1.2)}
 if(t>20){var blend=1-Math.exp(-dt*.8);camera.position.lerp(new THREE.Vector3(29.8,3.2,1.1),blend);camera.lookAt(28,1.2,-3.5)}
 if(t<1&&endT===t){homeLights[0].intensity=1.3;homeLights[1].intensity=.9;homeLights[2].intensity=1.1}
}
endText=[[0,'All three dream worlds are safe.'],[3.5,'Time for a new adventure.'],[7.5,'Mommy and Daddy are nearby.'],[12,'A little courage. One step at a time.'],[16,'His room. His cozy bed.'],[21,'Goodnight, Knox. You are so loved.']];
function verifyRig(){
 var results=[],oldWalk=knox.walk,oldSpeed=knox.speed,oldState=state;knox.speed=1;
 function check(name,ok){results.push((ok?'PASS ':'FAIL ')+name)}
 for(var phase=0;phase<4;phase++){knox.walk=phase*Math.PI/2;animKnox(.2,{move:1,aim:true,gunOk:true});knox.tilt.updateMatrixWorld(true);
 var finite=Object.keys(KB).every(function(n){return KB[n].bone.matrixWorld.elements.every(Number.isFinite)});check('finite skeleton phase '+phase,finite);
 var rHand=knox.tilt.worldToLocal(KB.RightHand.bone.getWorldPosition(new THREE.Vector3()));check('blaster follows hand phase '+phase,rHand.distanceTo(knox.gun.position)<.12);
 }
 var bad=0;knox.model.traverse(function(n){if(n.isSkinnedMesh){var skin=n.geometry.attributes.skinWeight;for(var i=0;i<skin.count;i++){var sum=skin.getX(i)+skin.getY(i)+skin.getZ(i)+skin.getW(i);if(Math.abs(sum-1)>.001)bad++}}});check('normalized skin weights',bad===0);
 knox.walk=oldWalk;knox.speed=oldSpeed;var report=document.getElementById('testReport');if(!report){report=document.createElement('pre');report.id='testReport';report.style.cssText='position:absolute;left:90px;top:110px;padding:15px;background:#082139ed;color:#aaffda;font-size:11px;z-index:100';document.body.appendChild(report)}report.textContent=results.join('\n');report.onclick=function(){report.remove()};
}
var victoryT=0,victoryFire=0,victoryMedal=null;
var quietEnding=startEnding;
startEnding=function(){
 heroMode=false;resetInput();paused=false;slow=1;clearLevel();hidePanel();home.visible=false;level=buildLevel('forest');state='celebration';victoryT=0;victoryFire=0;hud.className='';ctl.className='';viewShift(false);music(null);SFX.win();
 knox.rig.visible=true;knox.rig.position.set(0,0,0);knox.rig.rotation.set(0,0,0);knox.tilt.rotation.set(0,0,0);knox.tilt.position.set(0,0,0);knox.shadow.visible=true;knox.moving=false;knox.aimT=0;
 victoryMedal=new THREE.Group();level.add(victoryMedal);
 var ring=new THREE.Mesh(new THREE.TorusGeometry(1.25,.025,8,96),M(0xffd98a,{em:0xffc666,ei:2}));ring.position.set(0,1.3,-.8);victoryMedal.add(ring);
 for(var i=0;i<12;i++){var a=i/12*PI*2;P(victoryMedal,new THREE.OctahedronGeometry(.08),M(0xffdd96,{em:0xffc666,ei:1.5}),Math.sin(a)*1.5,1.3+Math.cos(a)*1.5,-.8)}
 var el=$('victoryCard');el.className='on';el.innerHTML='<small>ALL NIGHTMARES DEFEATED</small><h2>DREAM CHAMPION</h2><p>That’s our Knox.</p><div>WOODS SAVED &nbsp; · &nbsp; KING DEFEATED &nbsp; · &nbsp; OCEAN RESTORED</div>';
};
var baseUpgrade=updateUpgrade;updateUpgrade=function(dt){baseUpgrade(dt);
 if(state==='celebration'){
  victoryT+=dt;victoryFire-=dt;var a=Math.sin(victoryT*.45)*.18;
  camera.position.set(Math.sin(a)*4.6,1.6,Math.cos(a)*4.6);camera.lookAt(0,.98,0);
  knox.rig.rotation.y=Math.sin(victoryT*.8)*.1;knox.tilt.position.y=Math.abs(Math.sin(victoryT*3))*.045;
  if(victoryFire<=0){victoryFire=.42;var x=rnd(-4,4),z=rnd(-3,1);burst(x,rnd(2.3,4.5),z,[0xffd477,0x59ffdb,0xc599ff][Math.floor(rnd(0,3))],44,4,2);tone([523,659,784,1047][Math.floor(victoryT*2)%4],.22,'triangle',.07)}
  if(victoryT>7.5){$('victoryCard').className='';quietEnding();}
 }
};
// Keep persistent progress and the celebration separate from preview tools.
var cozyBlanket=new THREE.Mesh(SPH,M(0x245daa,{r:.95}));cozyBlanket.scale.set(.68,.12,.8);cozyBlanket.position.set(28,1.26,-3.15);cozyBlanket.visible=false;home.add(cozyBlanket);
home.children.forEach(function(n){if(n===cozyBlanket)return;var p=n.position;if(Math.abs(p.x-28)<1.6&&p.z<-1&&p.y<2.5){p.x=28+(p.x-28)*.68;p.z=-3.45+(p.z+3)*.68;n.scale.x*=.68;n.scale.z*=.68}});
var baseEndingPolish=endingPolish;endingPolish=function(t,dt){baseEndingPolish(t,dt);cozyBlanket.visible=t>20;};
var previousHomeLook=homeLook;homeLook=function(){cozyBlanket.visible=false;previousHomeLook();homeLights[0].intensity=1.3;homeLights[1].intensity=.9;homeLights[2].intensity=1.1;nightStars.forEach(function(s){s.material.opacity=0})};

// Optional parent review route; no progress or rewards are awarded by a preview.
if(['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('review')==='1'){
 var review=document.createElement('div');review.id='reviewTools';review.innerHTML='<button>Forest</button><button>Graveyard</button><button>Ocean</button><button>Walk</button><button>Blast</button><button>Stop</button><button>Finale</button><button>Hub</button><button>Boss</button><button>Win boss</button><button>Verify rig</button><button>Invincible</button>';
 document.body.appendChild(review);var actions=[function(){startLevel('forest')},function(){startLevel('grave')},function(){startLevel('sea')},function(){joy.x=.6;joy.y=0},function(){fireHeld=true},function(){resetInput()},startEnding,goHub,function(){internalDebug.boss()},function(){internalDebug.killboss()},verifyRig,function(){knox.inv=9999}];
 review.querySelectorAll('button').forEach(function(b,i){b.onclick=actions[i]});
}

canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();paused=true;resetInput();panel('<h2>The dream needs a quick refresh.</h2><p>Your completed worlds are saved. Reload to keep playing.</p><button class="btn" onclick="location.reload()">Reload game</button>',{dim:true})});
loadKnox(function(){$("load").classList.add("done");title();requestAnimationFrame(frame)});
})();
