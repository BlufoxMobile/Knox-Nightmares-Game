import { clamp } from './math.js';

// Project the same world aim point used by the blaster, with honest edge markers.
export function aimScreen(point, camera, width, height) {
  const local = point.clone().applyMatrix4(camera.matrixWorldInverse);
  const ndc = point.clone().project(camera);
  const front = local.z < -camera.near;
  const visible = front && ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= .94 && Math.abs(ndc.y) <= .86;
  if (visible) return { x:(ndc.x+1)*width/2, y:(1-ndc.y)*height/2, visible:true };
  let x = front ? ndc.x : -ndc.x, y = front ? -ndc.y : ndc.y;
  if (!Number.isFinite(x+y) || Math.hypot(x,y)<.001) { x=0; y=1; }
  const k = Math.max(Math.abs(x)/.9, Math.abs(y)/.8, 1);
  return { x:clamp((x/k+1)*width/2,24,width-24), y:clamp((y/k+1)*height/2,24,height-24), visible:false };
}
