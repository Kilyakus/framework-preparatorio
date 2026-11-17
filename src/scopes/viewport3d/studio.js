import {createGridFloorClass} from './grid-floor.js';

/** The one reserved environment shipped with viewport3d itself. */
export const BASE_MAP_ID = 'studio';
export const BASE_MAP_GRID_PALETTE = Object.freeze({
  minor:0x444444, major:0x686868, axisX:0xa64e4e, axisZ:0x52865c,
  ring:0x727272, fill:0x292929,
});
export const isBaseMap = id => String(id ?? '') === BASE_MAP_ID;

/** The host's THREE is used for the real, shader-based infinite grid. */
export function createBaseMapGrid(THREE, scene, options = {}) {
  if (!scene?.add) throw new TypeError('Studio grid requires a scene');
  const GridFloor = createGridFloorClass(THREE);
  const grid = new GridFloor({...BASE_MAP_GRID_PALETTE, ...options});
  grid.name = 'BaseMapGrid';
  grid.userData.baseMap = BASE_MAP_ID;
  grid.addTo(scene);
  return grid;
}

/** The same studio look can be applied by a generic or host-specific adapter. */
export const studioMap = Object.freeze({
  id:'studio', label:'Студия',
  description:'Встроенная тёмная рабочая сцена с бесконечной сеткой',
  shortcut:'Shift 1',
  spawnPoints:Object.freeze([{id:'center', label:'Центр студии', x:0, z:0, yaw:0}]),
  gridPalette:BASE_MAP_GRID_PALETTE,
  mount(ctx) {
    ctx.look({
      clearColor:0x303030, background:null, fog:null, environment:null,
      panorama:false, cyclorama:false,
      grid:{visible:true,palette:{...BASE_MAP_GRID_PALETTE}},
      floor:{visible:false},
      lights:{
        ambient:{color:0xffffff,intensity:0.40},
        hemi:{sky:0xd3d5f1,ground:0x555064,intensity:0.94},
        dir:{color:0xfff1e1,intensity:1.72},
        fill:{color:0xc8c4f3,intensity:0.48},
        rim:{color:0xbda6ff,intensity:0.32},
      },
    });
  },
  update() {},
  dispose() {},
});
export const BUILTIN_VIEWPORT_ENVIRONMENTS = Object.freeze([
  Object.freeze({id:studioMap.id,label:studioMap.label,description:studioMap.description,
    shortcut:studioMap.shortcut,order:1,builtIn:true,module:studioMap}),
]);
