/** Optional, host-configured 3D scope. No Three.js copy is imported here. */
import { createViewport3D, VIEWPORT3D_ID } from './runtime.js';

export { createViewport3D, VIEWPORT3D_ID } from './runtime.js';

/** The fallback shell is only registered when the host explicitly opts in. */
export const VIEWPORT3D_SCOPE = Object.freeze({
  id: VIEWPORT3D_ID,
  areaId: 'viewport3d',
  label: '3D-просмотр',
  selector: '[data-viewport3d-scope]',
  hideable: true,
  tools: Object.freeze([]),
  template: '<section data-viewport3d-scope><div data-viewport3d-container></div></section>',
});

/**
 * Create an enabled scope, optionally extending its shell with host metadata.
 * With no configuration, no scope is returned and nothing can be mounted.
 * A host-provided scope is still bound through the ordinary scope registry.
 *
 * @param {{enabled?:boolean, scope?:object}} config
 * @returns {object|null}
 */
export function createViewport3DScope({ enabled = false, scope = {} } = {}) {
  if (enabled !== true) return null;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope))
    throw new TypeError('viewport3d scope override must be an object');
  if (scope.id != null && scope.id !== VIEWPORT3D_ID)
    throw new Error('viewport3d scope id cannot be changed');
  return Object.freeze({ ...VIEWPORT3D_SCOPE, activate: activateViewport3DScope, ...scope, id: VIEWPORT3D_ID });
}

/**
 * Default activation for the generic shell. Projects can bind their own scope
 * implementation instead, retaining their markup, controls and plugins.
 * The context carries `viewport3d: {THREE, options?, plugins?, onReady?, loop?}`.
 * The returned cleanup also exposes `.viewport3d` for the host.
 */
export function activateViewport3DScope({ node, viewport3d: config = {} } = {}) {
  if (!node?.querySelector) throw new TypeError('viewport3d scope requires its root node');
  const container = config.options?.container ?? node.querySelector('[data-viewport3d-container]');
  const viewport = createViewport3D({ ...config.options, THREE: config.THREE, container });
  try {
    viewport.onResize(({ width, height }) => {
      if (viewport.camera.isPerspectiveCamera) {
        viewport.camera.aspect = width / height;
        viewport.camera.updateProjectionMatrix();
      }
    });
    viewport.registerPlugins(config.plugins ?? []);
    viewport.observeResize({ window: true });
    config.onReady?.(viewport);
    if (config.loop !== false)
      viewport.start(typeof config.loop === 'function' ? time => config.loop(viewport, time) : () => viewport.render());
  } catch (error) {
    viewport.dispose();
    throw error;
  }
  const dispose = () => viewport.dispose();
  dispose.viewport3d = viewport;
  return dispose;
}
