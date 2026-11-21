/**
 * Гизмо ориентации в 3D-просмотре.
 *
 * Как в Rephlexia (`b-nav-gizmo`): маленькая роза осей в углу сцены, где X, Y и
 * Z — кнопки быстрых ракурсов, а центр возвращает перспективу. Отличие одно:
 * роза **поворачивается вместе с камерой**, поэтому по ней видно, откуда сейчас
 * смотришь, а не только куда можно прыгнуть.
 *
 * Клик по оси ставит вид с этой стороны (X → справа, Y → сверху, Z → спереди),
 * клик по центру — перспективу. Клавиши Numpad работают как раньше: гизмо их не
 * перехватывает.
 */


/**
 * Оси: подпись, вектор, ракурс, цвет и глиф.
 *
 * Глифы — svg-контуры в сетке 12×12, а не текст: на 17 px буква «плывёт» от
 * шрифта к шрифту и от системного сглаживания, а контур всегда одинаков.
 */
const axisDefinitions = THREE => Object.freeze([
  {
    label: "X",
    axis: new THREE.Vector3(1, 0, 0),
    view: "right",
    color: "#e0616d",
    path: "M3.1 3.1 9 9 M9 3.1 3.1 9",
  },
  {
    label: "Y",
    axis: new THREE.Vector3(0, 1, 0),
    view: "top",
    color: "#8fc45c",
    path: "M3.1 3.1 6 6.6 8.9 3.1 M6 6.6v3",
  },
  {
    label: "Z",
    axis: new THREE.Vector3(0, 0, 1),
    view: "front",
    color: "#4f8ed6",
    path: "M3.2 3.3h5.6L3.2 8.7h5.6",
  },
]);

/** Радиус розы в пикселях и размер самого гизмо. */
const RADIUS = 23;
const SIZE = 68;
/** Куда «отъезжает» ось, смотрящая в камеру: влево-вниз, как Z в Rephlexia. */
const PARKED = Object.freeze({ x: -0.71, y: 0.71, radius: 0.72 });

/** Плавная ступенька 0…1: без неё на границе порога появляется ступенька-скачок. */
function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}



/**
 * @param {object} context — контекст области окна (как у `initDisplay`).
 * @param {object} context.host — DOM-узел с кнопкой [data-gizmo-center].
 * @param {object} context.THREE — Three.js экземпляр приложения.
 * @param {object} context.camera — камера приложения.
 * @param {(place: Function) => Function} [context.subscribe] — подписка на обновления камеры.
 * @param {(view: string) => void} [context.setView] — ракурс из области просмотра.
 * @param {() => boolean} [context.isEnabled] — включена ли область.
 */
export function mountViewportGizmo({ host, THREE, camera, setView, isEnabled = () => true, subscribe = () => () => {} } = {}) {
  if (!host || !THREE?.Vector3 || !THREE?.Quaternion || !camera) throw new TypeError("gizmo requires host, THREE and camera");
  const document = host.ownerDocument;

  const center = host.querySelector("[data-gizmo-center]");
  const buttons = [];
  const cameraQuaternion = new THREE.Quaternion();
  const axisInCamera = new THREE.Vector3();

  for (const definition of axisDefinitions(THREE)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `b-gizmo-axis b-gizmo-axis-${definition.label.toLowerCase()}`;
    button.dataset.gizmoView = definition.view;
    button.title = `Смотреть на ${definition.label}`;
    button.setAttribute("aria-label", button.title);
    button.style.setProperty("--gizmo-axis-color", definition.color);
    button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 12 12"><path d="${definition.path}"/></svg>`;
    host.append(button);
    buttons.push({ button, axis: definition.axis });
  }

  /**
   * Разложить оси по кругу так, как их видит камера.
   *
   * Оси проецируются на экран; вырожденная проекция плавно уходит в
   * устойчивую позицию, чтобы избежать дрожания возле направления камеры.
   */
  function place() {
    cameraQuaternion.copy(camera.quaternion).invert();
    const half = SIZE / 2;
    for (const item of buttons) {
      axisInCamera.copy(item.axis).applyQuaternion(cameraQuaternion);
      // Позиция — проекция оси, но у самой камеры проекция вырождается в точку
      // и её направление становится шумом. Поэтому такая ось плавно «отъезжает»
      // в устойчивое место (влево-вниз): вес перехода — smoothstep, так что ни
      // скачков на границе, ни дребезга от шума нет.
      const spread = Math.hypot(axisInCamera.x, axisInCamera.y);
      const parked = 1 - smoothstep(0, PARKED.radius * 0.9, spread);
      const x = half + (axisInCamera.x * RADIUS) * (1 - parked) + PARKED.x * PARKED.radius * RADIUS * parked;
      const y = half + (-axisInCamera.y * RADIUS) * (1 - parked) + PARKED.y * PARKED.radius * RADIUS * parked;
      const depth = axisInCamera.z;
      // Стиль пишем, только если он изменился: лишняя запись — лишняя
      // перерисовка, от неё кнопки начинают «мерцать» на дробных пикселях.
      const transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      if (item.transform !== transform) {
        item.button.style.transform = transform;
        item.transform = transform;
      }
      const layer = String(10 + Math.round(((depth + 1) / 2) * 20));
      if (item.layer !== layer) {
        item.button.style.zIndex = layer;
        item.layer = layer;
      }
      // Ось отвёрнута от камеры — точка бледнее. Границы разные (гистерезис),
      // иначе на самой границе точка мигала бы от малейшего движения камеры.
      const behind = item.button.classList.contains("is-behind");
      if (behind ? depth > -0.12 : depth < -0.28) item.button.classList.toggle("is-behind", !behind);
    }
  }

  function onClick(event) {
    const button = event.target.closest?.("[data-gizmo-view]");
    if (!button || !isEnabled()) return;
    event.preventDefault();
    event.stopPropagation();
    setView?.(button.dataset.gizmoView);
    // Ракурс ставит камера; розу перерисовываем сразу, не ожидая кадра.
    place();
  }

  function onCenter(event) {
    if (!isEnabled()) return;
    event.preventDefault();
    setView?.("persp");
    place();
  }

  // Раскладка пересчитывается каждый кадр: это три кнопки и две записи стиля,
  // зато роза идёт за камерой вплотную. Прореживание (20 Гц) на быстрой орбите
  // читалось как дрожание — точки «перескакивали» вслед за движением.
  const stopTick = subscribe(place) ?? (() => {});

  center?.addEventListener("click", onCenter);
  host.addEventListener("click", onClick);
  place();

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      stopTick();
      center?.removeEventListener("click", onCenter);
      host.removeEventListener("click", onClick);
      for (const item of buttons) item.button.remove();
    },
  };
}

export default mountViewportGizmo;
