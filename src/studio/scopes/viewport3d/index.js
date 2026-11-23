/** Optional, host-configured 3D scope. No Three.js copy is imported here. */
import { createViewport3D, VIEWPORT3D_ID } from '../../../app/engine/viewport3d/runtime.js';
import { VIEWPORT3D_TEMPLATE, mountViewportChrome } from './ui/ui.js';
import { mountViewportStatus } from './ui/status.js';
import { createViewportOrbit } from './camera/orbit.js';
import { mountViewportGizmo } from './camera/gizmo.js';
import { mountViewportNavigation } from './camera/navigation.js';

export { createViewport3D, VIEWPORT3D_ID } from '../../../app/engine/viewport3d/runtime.js';
export { VIEWPORT3D_VIEW_MODE, VIEWPORT3D_ORBIT_TOOL, createViewportModes, mountViewportModes } from './ui/modes.js';
export { createViewportAmbientOcclusion, setViewportAoCategory } from './graphics/ambient-occlusion.js';
export { ViewportDynamicShadowQuality, SHADOW_SIZES, hardwareCeiling as viewportShadowHardwareCeiling } from './graphics/shadow-quality.js';
export { VIEWPORT3D_GRAPHICS_DEFAULTS, normalizeViewportGraphics, viewportHardwareLimits, viewportRendererInfo, createAdaptiveResolution, createViewportGraphics, setViewportShadowMapEnabled } from './graphics/graphics.js';
export { VIEWPORT3D_HEADER_TEMPLATE, VIEWPORT3D_TOOLS_TEMPLATE, VIEWPORT3D_TEMPLATE, mountViewportGraphics, mountViewportSettings, mountViewportChrome } from './ui/ui.js';
export { mountViewportSection } from './ui/sections.js';
export { VIEWPORT3D_STATUS_DEFAULTS, VIEWPORT3D_STATUS_TEMPLATE, composeViewportStatus, mountViewportStatus } from './ui/status.js';
export { mountViewportClasses } from './ui/classes.js';
export { createViewportDisplay, mountViewportDisplay, contributeStudioGrid } from './ui/display.js';
export { BASE_MAP_ID, BASE_MAP_GRID_PALETTE, isBaseMap, createBaseMapGrid, studioMap, BUILTIN_VIEWPORT_ENVIRONMENTS } from '../../../plugins/worlds/studio.js';
export { createGridFloorClass } from './environment/grid-floor.js';
export { normalizeViewportEnvironment, discoverViewportEnvironments, createViewportEnvironments, mountViewportEnvironment } from './environment/environments.js';
export { createViewportOrbit } from './camera/orbit.js';
export { mountViewportGizmo } from './camera/gizmo.js';
export { mountViewportNavigation, VIEWPORT3D_VIEW_DIRECTIONS } from './camera/navigation.js';

/** The scope remains opt-in, but its navigation and graphics ship by default. */
export const VIEWPORT3D_SCOPE = Object.freeze({
  id: VIEWPORT3D_ID,
  areaId: 'viewport3d',
  label: '3D Просмотр',
  selector: '[data-viewport3d-scope]',
  hideable: true,
  tools: Object.freeze([]),
  template: VIEWPORT3D_TEMPLATE,
});

/** Explicit opt-in; an application can override metadata or extend the shell. */
export function createViewport3DScope({ enabled = false, scope = {} } = {}) {
  if (enabled !== true) return null;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope))
    throw new TypeError('viewport3d scope override must be an object');
  if (scope.id != null && scope.id !== VIEWPORT3D_ID)
    throw new Error('viewport3d scope id cannot be changed');
  return Object.freeze({ ...VIEWPORT3D_SCOPE, activate: activateViewport3DScope, ...scope, id: VIEWPORT3D_ID });
}

/**
 * Built-in scope, including camera navigation and graphics controls. A custom
 * shell can bind its own activate and reuse the same chrome/controllers. With
 * `loop:false`, interactions redraw once rather than starting another loop.
 */
export function activateViewport3DScope({ node, viewport3d: config = {} } = {}) {
  if (!node?.querySelector) throw new TypeError('viewport3d scope requires its root node');
  const container = config.options?.container ?? node.querySelector('[data-viewport3d-container]');
  const viewport = createViewport3D({ ...config.options, THREE: config.THREE, container });
  let chrome=null,orbit=null,navigation=null,gizmo=null,status=null,redrawFrame=null;
  const cancelRedraw=()=>{if(redrawFrame!=null)globalThis.cancelAnimationFrame?.(redrawFrame);redrawFrame=null;};
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
    const statusRoot=node.ownerDocument && node.querySelector('[data-v3d-status]');
    if(statusRoot && config.status !== false) status=mountViewportStatus({root:statusRoot,viewport,...config.status});
    // Old custom minimal shells and non-DOM test hosts remain supported.
    if(node.ownerDocument && node.querySelector('[data-v3d-mode-host]')) {
      const invalidate=()=>{
        config.graphicsOptions?.invalidate?.();config.invalidate?.();
        if(config.loop!==false||viewport.disposed||redrawFrame!=null)return;
        if(typeof globalThis.requestAnimationFrame==='function')redrawFrame=requestAnimationFrame(()=>{redrawFrame=null;if(!viewport.disposed)viewport.render();});
        else viewport.render();
      };
      chrome=mountViewportChrome({root:node,viewport,modeOptions:config.modeOptions,ui:config.ui,
        environmentOptions:config.environmentOptions,settingsOptions:config.settingsOptions,classes:config.classes,
        graphicsOptions:{...config.graphicsOptions,invalidate}});
      // A resized drawing buffer is cleared even when the pixel ratio is
      // unchanged, so a demand-rendered viewport must request a fresh frame.
      viewport.onResize(invalidate);
      const options=config.orbitOptions??{};
      orbit=createViewportOrbit(viewport,{...options,input:config.orbit!==false,
        isEnabled:()=>chrome.modes.value.tool==='orbit'&&(options.isEnabled?.()??true),
        onChange:()=>{options.onChange?.();navigation?.sync();invalidate();}});
      navigation=mountViewportNavigation({root:node,viewport,orbit,invalidate,
        isEnabled:config.navigationOptions?.isEnabled,fitObject:config.navigationOptions?.fitObject});
      const gizmoHost=node.querySelector('[data-v3d-gizmo]');
      if(gizmoHost) gizmo=mountViewportGizmo({host:gizmoHost,THREE:viewport.THREE,camera:viewport.camera,
        setView:navigation.setView,isEnabled:config.navigationOptions?.isEnabled,
        subscribe:fn=>viewport.onRender(fn)});
      viewport.onDispose(()=>{cancelRedraw();gizmo?.dispose();navigation?.dispose();orbit?.dispose();});
    }
    if (config.loop !== false)
      viewport.start(typeof config.loop === 'function' ? time => config.loop(viewport, time) : () => viewport.render());
  } catch (error) {
    cancelRedraw();gizmo?.dispose();navigation?.dispose();orbit?.dispose();chrome?.dispose();status?.dispose();viewport.dispose();
    throw error;
  }
  const dispose = () => {cancelRedraw();gizmo?.dispose();gizmo=null;navigation?.dispose();navigation=null;orbit?.dispose();orbit=null;chrome?.dispose();chrome=null;status?.dispose();status=null;viewport.dispose();};
  dispose.viewport3d = viewport;
  Object.defineProperties(dispose,{status:{get:()=>status},graphics:{get:()=>chrome?.graphics??null},modes:{get:()=>chrome?.modes??null},environment:{get:()=>chrome?.environment??null},display:{get:()=>chrome?.display??null},orbit:{get:()=>config.orbit===false?null:orbit},navigation:{get:()=>navigation}});
  return dispose;
}
