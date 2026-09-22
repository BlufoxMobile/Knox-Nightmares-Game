// Run controls tests against the same vendored Three.js used by the game.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: new URL('../dream-champion/vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../dream-champion/vendor/three/' + specifier.slice(6), import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
