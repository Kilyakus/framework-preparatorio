/**
 * Публичный API каркаса.
 *
 * Состав:
 *   scopes/         реестр областей, связывание с реализацией, доступность элементов
 *   contributions/  реестры пунктов меню
 *   composition/    порядок движков и областей, регистрация паспортов, связывание
 *
 * Корневой вход не имеет внешних зависимостей. Браузерные модули (меню и
 * оболочка) доступны по подпутям `/menu`, `/shell` и `/browser` и требуют
 * `uix-preparatorio`.
 */
export {
  createViewport3D,
  VIEWPORT3D_ID,
  VIEWPORT3D_SCOPE,
  createViewport3DScope,
  activateViewport3DScope,
  VIEWPORT3D_VIEW_MODE,
  VIEWPORT3D_ORBIT_TOOL,
  createViewportModes,
  mountViewportModes,
  VIEWPORT3D_GRAPHICS_DEFAULTS,
  normalizeViewportGraphics,
  viewportHardwareLimits,
  createAdaptiveResolution,
  createViewportGraphics,
  setViewportShadowMapEnabled,
  VIEWPORT3D_HEADER_TEMPLATE,
  VIEWPORT3D_TOOLS_TEMPLATE,
  VIEWPORT3D_TEMPLATE,
  mountViewportGraphics,
  mountViewportChrome,
  createViewportOrbit,
} from "./scopes/viewport3d/index.js";

export {
  createScopeRegistry,
  mountScopeNodes,
  useScopeRegistry,
  getScopeRegistry,
  getScope,
  listScopes,
  mountScopes,
  bindScopes,
  createScopeAvailability,
  bindScopeDependencies,
} from "./scopes/index.js";

export {
  registerViewContribution,
  listViewContributions,
  getViewContribution,
  subscribeViewContributions,
  registerViewportContribution,
  listViewportContributions,
  getViewportContribution,
  subscribeViewportContributions,
  createMenuContributionRegistry,
  createViewContributionRegistry,
  createViewportContributionRegistry,
  normalizeMenuContribution,
  normalizeViewContribution,
} from "./contributions/view-contributions.js";

export {
  createScopeOrder,
  sortEngines,
  availablePluginScopes,
  registerScopeDefinitions,
  registerContributions,
  loadEnginePlugins,
  bindScopeImplementations,
} from "./composition/index.js";
