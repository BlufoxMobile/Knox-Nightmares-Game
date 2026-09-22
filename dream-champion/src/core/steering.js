import { angDiff } from './math.js';

// A steady stick chooses a travel heading, not a perpetual camera-relative turn.
// Rebase on a deliberate direction change (8 degrees ignores thumb jitter), so
// pushing UP after an about-face means forward in the new view, even without lifting.
export function steerHeading(state, mx, my, cameraYaw, manualYaw = 0) {
  if (Math.hypot(mx, my) <= 0.05) { state.active = false; return null; }
  const angle = Math.atan2(-mx, my);
  if (!state.active || Math.abs(angDiff(state.angle, angle)) > 8 * Math.PI / 180) {
    state.yaw = cameraYaw + angle;
    state.angle = angle;
  } else {
    state.yaw += manualYaw;
  }
  state.active = true;
  return state.yaw;
}
