// Three is injected by the host: viewport3d never bundles another Three.js.

// Базовая карта движка `viewport3d`.
//
// Сетка — не украшение обзора, а пол базовой карты: по ней определяется низ
// мира (`setGround`), её кольцо — радиус арены. Поэтому она живёт здесь, рядом
// с описанием карты `studio.js`, а не в оболочке студии.

// ---------- бесконечная сетка пола с кругом по центру ----------
//
// Бесконечная Blender-подобная сетка с переключаемой палитрой: базовый набор
// остаётся сине-графитовым для остальных сцен, а Studio задаёт нейтральный
// графит, серые деления и приглушённые красную/зелёную оси.
//
// Как сделано: вместо GridHelper на фиксированную площадь рисуем одну большую
// плоскость с шейдером. Линии считаются по мировым координатам, поэтому сетка
// не кончается и не «плывёт» при движении камеры; ширина линии нормируется на
// производную (`fwidth`), поэтому она остаётся ровно волосяной на любом
// расстоянии и не рябит муаром на горизонте. К краю сетка гаснет в фон — это и
// даёт ощущение бесконечной плоскости, а не обрезанного прямоугольника.
//
// Круг в центре — граница арены: там стоят невидимые стены физики, поэтому
// кольцо одновременно и красивое, и полезное.

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// A clear, bounded one-metre editor grid, plus the original Physio-style
// half-metre grid revealed around the moving subject outside that boundary.
const FRAG = /* glsl */ `
  varying vec3 vWorld;
  uniform vec3 uMinor, uMajor, uAxisX, uAxisZ, uRing, uFill;
  uniform float uCell, uOpacity;
  uniform vec2 uFocus;
  uniform float uGridHalfExtent, uNearStart, uNearEnd;
  float lineMask(vec2 p) {
    vec2 g=abs(fract(p-0.5)-0.5)/max(fwidth(p),vec2(0.0001));
    return 1.0-min(min(g.x,g.y),1.0);
  }
  void main() {
    vec2 w=vWorld.xz;
    float edge=max(abs(w.x),abs(w.y));
    float inside=1.0-smoothstep(uGridHalfExtent-0.015,uGridHalfExtent+0.015,edge);
    float nearFocus=1.0-smoothstep(uNearStart,uNearEnd,distance(w,uFocus));
    float mainLine=lineMask(w/uCell)*inside;
    float outerLine=lineMask(w/(uCell*0.5))*(1.0-inside)*nearFocus;
    float a=max(mainLine*0.55,outerLine*0.55)*uOpacity;
    if(a<0.001)discard;
    vec3 outerColor=mix(uMinor,uMajor,0.20);
    gl_FragColor=vec4(mix(outerColor,uMajor,step(outerLine,mainLine)),a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const classCache = new WeakMap();
export function createGridFloorClass(THREE) {
  if (!THREE?.Mesh || !THREE?.ShaderMaterial || !THREE?.PlaneGeometry || !THREE?.Color)
    throw new TypeError('Studio grid requires the host THREE implementation');
  if (classCache.has(THREE)) return classCache.get(THREE);
  class GridFloor extends THREE.Mesh {
  // Класс — сам меш, а не обёртка над ним: сетку в студии годами держали как
  // GridHelper и читали у неё `visible`, `matrixWorld` и `geometry`
  // (ограничение движения по арене, отображение в меню вида). Наследование
  // сохраняет этот контракт целиком, добавляя шейдер и палитру.
  constructor(opts = {}) {
    // цвета в линейном пространстве — так их видит рендер после sRGB-вывода
    const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    super(new THREE.PlaneGeometry(1, 1), material);
    material.uniforms = this.uniforms = {
      uMinor: { value: lin(opts.minor ?? 0x424b74) },
      uMajor: { value: lin(opts.major ?? 0x8d99cc) },
      uAxisX: { value: lin(opts.axisX ?? opts.axis ?? 0xaeb8e4) },
      uAxisZ: { value: lin(opts.axisZ ?? opts.axis ?? 0xaeb8e4) },
      uRing: { value: lin(opts.ring ?? 0x6f9fe8) },
      uFill: { value: lin(opts.fill ?? 0x1a2030) },
      // Сцена Morphia живёт в метрах (персонаж ~1.8), а не в единицах
      // Rephlexia (214.5 на метр). Всё, что задано в мировых единицах, здесь
      // поэтому тоже в метрах: клетка равна одному метру,
      // крупная линия каждые 5 клеток, кольцо и затухание — по арене.
      uCell: { value: opts.cell ?? 1 },
      uMajorEvery: { value: opts.majorEvery ?? 5 },
      uRingRadius: { value: opts.radius ?? 3.2 },
      uRingWidth: { value: opts.ringWidth ?? 0.016 },
      uFadeStart: { value: opts.fadeStart ?? 9 },
      uFadeEnd: { value: opts.fadeEnd ?? 26 },
      uOpacity: { value: 1 },
      uGroundY: { value: 0 },
      uFocus: { value: new THREE.Vector2(0, 0) },
      uGridHalfExtent: { value: opts.halfExtent ?? 3.25 },
      uNearStart: { value: opts.nearStart ?? 3 },
      uNearEnd: { value: opts.nearEnd ?? 11 },
    };

    // Плоскость заведомо больше дальней плоскости камеры: конец сетки делает
    // не геометрия, а затухание в шейдере.
    this.rotation.x = -Math.PI / 2;
    // Плоскость покрывает дальнюю плоскость камеры (500): конец сетки делает
    // затухание в шейдере, а не кромка геометрии.
    this.scale.setScalar(opts.size ?? 1200);
    this.renderOrder = -2;                   // под персонажем и полом
    this.frustumCulled = false;
    this.mesh = this;                        // совместимость с обёрткой
  }

  addTo(scene) { scene.add(this); return this; }

  setPalette(palette = {}) {
    const colors = {
      uMinor: palette.minor,
      uMajor: palette.major,
      uAxisX: palette.axisX ?? palette.axis,
      uAxisZ: palette.axisZ ?? palette.axis,
      uRing: palette.ring,
      uFill: palette.fill,
    };
    for (const [uniformName, value] of Object.entries(colors)) {
      if (value === undefined || value === null || !this.uniforms[uniformName]) continue;
      const color = new THREE.Color(value).convertSRGBToLinear();
      this.uniforms[uniformName].value.copy(color);
    }
  }

  setFocus(position) {
    if (!position) return;
    const x=Array.isArray(position)?position[0]:position.x;
    const z=Array.isArray(position)?position[2]:position.z;
    if(Number.isFinite(x)&&Number.isFinite(z))this.uniforms.uFocus.value.set(x,z);
  }

  // Уровень земли: сетка всегда лежит на полу, как бы он ни переехал.
  setGround(y) {
    const gy = Number.isFinite(y) ? y : 0;
    this.uniforms.uGroundY.value = gy;
    // Подъём на 0.2 — из Rephlexia, где единица = 1/214.5 м: там это 0.9 мм
    // и не видно. У нас единица — метр, и 0.2 превращались в 20 см: пол
    // сетки висел на уровне колена и перекрывал ноги персонажа.
    //
    // 1.5 см, а не 2 мм: пятно контактной тени лежит на 1 см выше земли, и
    // при зазоре в 2 мм два прозрачных слоя спорили за пиксель — отсюда
    // мерцание полос на сетке. 1.5 см разводят их с запасом и при этом
    // не заметны ни на одной камере обзора.
    this.position.set(0, gy + 0.015, 0);
  }

  // Радиус круга — это радиус арены (там невидимые стены).
  setRadius(r) {
    if (Number.isFinite(r) && r > 0) this.uniforms.uRingRadius.value = r;
  }

  setVisible(v) { this.visible = !!v; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.removeFromParent();
  }
}

  classCache.set(THREE, GridFloor);
  return GridFloor;
}
