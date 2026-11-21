const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

/**
 * Dynamic shadow-map quality.
 *
 * The shadow map is the cheapest big win for silhouette quality, but it is also
 * the easiest way to tank a frame rate: a 8192² depth map costs 268 MB on the
 * GPU and is pointless on a software rasteriser or when the character fills a
 * fifth of the screen. This controller keeps the map as large as it is actually
 * useful (screen-space demand) and as small as it has to be (measured frame
 * time), between 1024² and 8192².
 */

export const SHADOW_SIZES = [512, 1024, 2048, 4096, 8192];

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** Largest map worth using on this device. */
export function hardwareCeiling(renderer, maxSize = 8192) {
  const maxTexture = renderer?.capabilities?.maxTextureSize ?? 4096;
  let ceiling = Math.min(maxSize, maxTexture);
  let gpu = "";
  try {
    const gl = renderer.getContext();
    const info = gl?.getExtension?.("WEBGL_debug_renderer_info");
    if (info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "");
  } catch {
    gpu = "";
  }
  if (SOFTWARE_GPU.test(gpu)) ceiling = Math.min(ceiling, 2048);
  const cores = globalThis.navigator?.hardwareConcurrency ?? 8;
  const memory = globalThis.navigator?.deviceMemory ?? 8;
  if (cores <= 4 || memory <= 4) ceiling = Math.min(ceiling, 4096);
  let buffer=Infinity;try{const gl=renderer?.getContext?.();buffer=Number(gl?.getParameter?.(gl.MAX_RENDERBUFFER_SIZE))||Infinity;}catch{}
  ceiling=Math.max(1,Math.min(ceiling,buffer));
  return 2**Math.floor(Math.log2(ceiling));
}

export class ViewportDynamicShadowQuality {
  /**
   * @param {object} options
   * @param {THREE.WebGLRenderer} options.renderer
   * @param {THREE.DirectionalLight} options.light shadow-casting light
   * @param {THREE.PerspectiveCamera} options.camera
   * @param {object} [options.controls] OrbitControls (for the zoom distance)
   * @param {number} [options.maxSize] upper bound, 8192 by default
   * @param {number} [options.minSize] lower bound, 1024 by default
   * @param {number} [options.frameBudget] target frame time in ms
   */
  constructor({
    renderer,
    light,
    camera,
    controls = null,
    maxSize = 8192,
    minSize = 512,
    frameBudget = 16.7,
    autoAdjustBias = false,
  }) {
    this.renderer = renderer;
    this.light = light;
    this.camera = camera;
    this.controls = controls;
    this.cameraPosition = camera?.position?.clone?.()??null;
    this.maxSize = maxSize;
    this.minSize = minSize;
    this.frameBudget = frameBudget;
    this.autoAdjustBias = autoAdjustBias;
    this.ceiling = Math.min(maxSize, hardwareCeiling(renderer, maxSize));
    // An automatic world map is capped separately: a large orthographic box
    // should not force an 8192² allocation merely because the player is close.
    // Explicit quality choices still use the device ceiling.
    this.autoCeiling = this.ceiling;

    this.size = 0;
    this.demand = this.minSize;
    this.frameMs = frameBudget;
    this.manual = null;
    this.onChange = null;

    this.elapsed = 0;
    this.interval = 1; // seconds between evaluations
    this.fastFrames = 0;
    this.slowFrames = 0;

    this.demand = this.demandSize();
    this.setSize(this.demand, { silent: true });
    if(this.autoAdjustBias)this.refreshBias();
  }

  /** Feed the render loop delta; cheap: one EMA and a 1 Hz evaluation. */
  update(dt) {
    if (!(dt > 0) || dt > .25) { this.elapsed=0;this.fastFrames=0;this.slowFrames=0;this.frameMs=this.frameBudget;return; }
    const ms = Math.min(dt * 1000, 250);
    this.frameMs += (ms - this.frameMs) * 0.08;
    this.elapsed += dt;
    if (this.elapsed < this.interval) return;
    this.elapsed = 0;
    this.#evaluate();
  }

  /** Limit automatic allocation without changing the manual quality range. */
  setAutoCeiling(size = null) {
    this.autoCeiling = size == null ? this.ceiling : Math.min(this.ceiling, Math.max(this.minSize, Number(size) || this.minSize));
    this.demand = this.demandSize();
    if (!this.manual && this.size > this.demand) this.setSize(this.demand);
  }

  /** Map size (px). */
  setQuality(size) {
    this.manual = size == null ? null : this.#round(size);
    this.setSize(this.manual ?? this.demandSize());
  }

  /** What the app should tell the user it is doing. */
  snapshot() {
    return {
      size: this.size,
      demand: this.demand,
      ceiling: this.ceiling,
      frameMs: Math.round(this.frameMs * 10) / 10,
      manual: this.manual,
      mode: this.manual ? "manual" : "auto",
    };
  }

  setSize(requested, { silent = false } = {}) {
    const size = this.#round(requested);
    const shadow = this.light?.shadow;
    if (!shadow) return;
    if (size === this.size) return;
    const previous = this.size;
    shadow.mapSize.set(size, size);
    // Dropping the render target makes three.js allocate the new resolution on
    // the next frame instead of stretching the old map.
    shadow.map?.dispose?.();
    shadow.map = null;
    shadow.mapPass?.dispose?.();
    shadow.mapPass = null;
    shadow.needsUpdate = true;
    this.size = size;
    if(this.autoAdjustBias)this.refreshBias();
    if (!silent && previous) this.onChange?.(size, this.snapshot(), previous);
  }

  /**
   * Shadow bias and softness for the current resolution.
   *
   * A shadow map with zero bias fights with its own depth buffer ("рубцы" —
   * acne stripes on smooth skin, very visible on FBX heads). `normalBias` is
   * measured in world units, so it has to follow the texel size: two texels
   * push the sampled depth just far enough to stop self-shadowing without
   * visibly detaching the contact shadow. `radius` is in texels, so it is
   * recomputed too, which keeps the penumbra physically similar at 1024² and
   * 8192² instead of getting harder as the map grows.
   */
  refreshBias({ softness = 0.006 } = {}) {
    const shadow = this.light?.shadow;
    const camera = shadow?.camera;
    if (!shadow || !camera) return;
    const span = Math.abs(camera.right - camera.left) || 1;
    const texel = span / Math.max(this.size, 512);
    shadow.bias = -0.00015;
    shadow.normalBias = clamp(texel * 1.8, 0.0005, 0.04);
    shadow.radius = clamp(softness / texel, 1.5, 8);
  }

  /**
   * Shadow resolution the current view actually needs: how many device pixels
   * the shadowed area covers on screen. One shadow texel per screen pixel is
   * already generous, so the result is damped slightly and rounded up.
   */
  demandSize() {
    const shadowCamera = this.light?.shadow?.camera;
    const camera = this.camera;
    if (!shadowCamera || !camera) return this.minSize;
    const spanY = Math.abs(shadowCamera.top - shadowCamera.bottom) || 3;
    const element = this.renderer?.domElement;
    const heightPx = element?.clientHeight || 800;
    const dpr = this.renderer?.getPixelRatio?.() ?? 1;
    const target = this.controls?.target;
    const position=this.cameraPosition&&camera.getWorldPosition?camera.getWorldPosition(this.cameraPosition):camera.position;
    const distance = target && position?.distanceTo
      ? position.distanceTo(target)
      : null;
    const fov = ((camera.fov || 34)*Math.PI/180);
    const visibleMetres = camera.isOrthographicCamera ? Math.abs(camera.top-camera.bottom)/(camera.zoom||1) : distance == null ? null : 2 * Math.tan(fov / 2) * Math.max(distance, 0.1) || 1;
    const coveredPixels = visibleMetres == null ? heightPx * dpr : (spanY / visibleMetres) * heightPx * dpr;
    const need = coveredPixels * 0.9;
    return this.#round(Math.min(need, this.ceiling, this.autoCeiling));
  }

  #evaluate() {
    const demand = this.demandSize();
    this.demand = demand;
    // "Fast" means the app is keeping up with its budget, not that it is far
    // below it: a 60 Hz display sits exactly on the budget and must still be
    // allowed to raise the shadow resolution.
    const slow = this.frameMs > this.frameBudget * 1.25;
    const fast = !slow && this.frameMs <= this.frameBudget * 1.02;
    if (slow) {
      this.slowFrames += 1;
      this.fastFrames = 0;
    } else if (fast) {
      this.fastFrames += 1;
      this.slowFrames = 0;
    } else {
      this.fastFrames = 0;
      this.slowFrames = 0;
    }

    if (this.manual) {
      this.setSize(this.manual);
      return;
    }

    const target = Math.min(demand, this.ceiling);
    // Too large for what the view needs (zoomed out, resized window): shrink at
    // once, there is nothing to lose.
    if (this.size > target) {
      this.setSize(target);
      return;
    }
    // Frame time is the hard limit: two slow seconds in a row step down.
    if (slow && this.slowFrames >= 2 && this.size > this.minSize) {
      this.setSize(Math.max(this.minSize, this.size / 2));
      return;
    }
    // Grow only on comfortably fast frames, one step per second.
    if (this.size < target && this.fastFrames >= 2)
      this.setSize(Math.min(target, this.size * 2));
  }

  #round(value) {
    const ceiling = Math.min(this.ceiling, this.maxSize);
    const min = Math.min(this.minSize, ceiling);
    let size = min;
    for (const candidate of SHADOW_SIZES) {
      if (candidate < min) continue;
      if (candidate >= value) {
        size = Math.min(candidate, ceiling);
        break;
      }
      size = Math.min(candidate, ceiling);
    }
    return clamp(size, min, ceiling);
  }
}
