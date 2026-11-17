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

const FRAG = /* glsl */ `
  varying vec3 vWorld;

  uniform vec3  uMinor;        // мелкая линия
  uniform vec3  uMajor;        // крупная линия
  uniform vec3  uAxisX;        // ось X
  uniform vec3  uAxisZ;        // ось Z
  uniform vec3  uRing;         // круг арены
  uniform vec3  uFill;         // подложка пола (чтобы плоскость читалась)
  uniform float uCell;         // размер мелкой клетки, ед.
  uniform float uMajorEvery;   // крупная линия каждые N клеток
  uniform float uRingRadius;   // радиус круга, ед.
  uniform float uRingWidth;    // толщина линии круга, ед.
  uniform float uFadeStart;    // откуда начинает гаснуть
  uniform float uFadeEnd;      // где гаснет совсем
  uniform float uOpacity;
  uniform float uGroundY;

  // Антиалиасинг линий: делим расстояние до ближайшей линии на размер пикселя
  // в этих координатах. Так линия всегда шириной ~1 пиксель, без муара.
  float lineMask(vec2 p) {
    vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  float axisMask(float v) {
    return 1.0 - min(abs(v) / fwidth(v), 1.0);
  }

  void main() {
    vec2 w = vWorld.xz;

    // 1) гаснет по расстоянию от точки обзора-центра: горизонт растворяется
    float dist = length(w);
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
    // у самой кромки плоскость прозрачна полностью
    if (fade <= 0.002) discard;

    // 2) две частоты линий
    float fine = lineMask(w / uCell) * 0.8;
    float coarse = lineMask(w / (uCell * uMajorEvery));

    vec3 color = mix(uMinor, uMajor, coarse);
    float alpha = max(fine, coarse);

    // 2a) сама плоскость: очень слабая подложка, гаснущая к горизонту. Без неё
    // пол — это только линии в пустоте; с ней читается поверхность.
    // Подложка нужна, чтобы линии не висели в пустоте, но она не должна
    // перекрывать пол под ними: 0.25 вместо 0.65 — иначе пол становится
    // чёрной плитой, которая обрывается к горизонту.
    float fill = (1.0 - smoothstep(0.0, uFadeStart * 1.4, dist)) * 0.25;
    color = mix(uFill, color, max(alpha, 1e-3));
    alpha = max(alpha, fill);

    // 3) Оси как в Blender: X — приглушённый красный, Z — зелёный.
    float axisX = axisMask(w.x);
    float axisZ = axisMask(w.y);   // w.y — это мировой Z
    color = mix(color, uAxisX, axisX * 0.85);
    color = mix(color, uAxisZ, axisZ * 0.85);
    alpha = max(alpha, max(axisX, axisZ) * 0.75);

    // 4) круг арены: чёткое кольцо + мягкое свечение вокруг него. Кольцо
    // держим шириной около двух пикселей на любом удалении — оно не должно
    // ни исчезать, ни превращаться в жирную полосу вблизи.
    float rr = length(w);
    float d = abs(rr - uRingRadius);
    float px = max(fwidth(rr), 1e-4);
    float ringLine = 1.0 - min(d / max(px * 1.6, uRingWidth * 0.35), 1.0);
    float ringGlow = exp(-pow((rr - uRingRadius) / (uRingWidth * 11.0), 2.0)) * 0.45;
    color = mix(color, uRing, max(ringLine, ringGlow * 0.7));
    alpha = max(alpha, max(ringLine * 0.95, ringGlow));

    gl_FragColor = vec4(color, alpha * fade * uOpacity);
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
      // поэтому тоже в метрах: сетка в 32 клетки на арену радиусом 3.2,
      // крупная линия каждые 5 клеток, кольцо и затухание — по арене.
      uCell: { value: opts.cell ?? 0.2 },
      uMajorEvery: { value: opts.majorEvery ?? 5 },
      uRingRadius: { value: opts.radius ?? 3.2 },
      uRingWidth: { value: opts.ringWidth ?? 0.016 },
      uFadeStart: { value: opts.fadeStart ?? 9 },
      uFadeEnd: { value: opts.fadeEnd ?? 26 },
      uOpacity: { value: 1 },
      uGroundY: { value: 0 },
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
