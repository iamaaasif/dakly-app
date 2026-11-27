export type Camera = { x: number; y: number; zoom: number };
type Size = { width: number; height: number };
export type Point = { x: number; y: number };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
// Below this the text is too small to read on a phone, so a wide flow opens cropped, not shrunk.
const READABLE_ZOOM = 0.7;
// The part of the flow that must stay on screen once the user lets go.
const KEEP_VISIBLE = 96;
const ANIMATION_MS = 180;
const REST_MS = 200;
const GRID_STEP = 16;

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// Changes the zoom and moves the canvas so the world point under `point` does not move.
export function zoomAround(camera: Camera, point: Point, zoom: number): Camera {
  const next = clampZoom(zoom);
  const ratio = next / camera.zoom;
  return {
    x: point.x - (point.x - camera.x) * ratio,
    y: point.y - (point.y - camera.y) * ratio,
    zoom: next,
  };
}

function keepAxisInView(offset: number, flowLength: number, viewLength: number) {
  const keep = Math.min(KEEP_VISIBLE, flowLength);
  return Math.min(viewLength - keep, Math.max(keep - flowLength, offset));
}

export function keepFlowInView(camera: Camera, view: Size, flow: Size): Camera {
  return {
    zoom: camera.zoom,
    x: keepAxisInView(camera.x, flow.width * camera.zoom, view.width),
    y: keepAxisInView(camera.y, flow.height * camera.zoom, view.height),
  };
}

export function fitCamera(view: Size, flow: Size): Camera {
  const zoom = clampZoom(Math.min(1, view.width / flow.width, view.height / flow.height));
  return {
    zoom,
    x: (view.width - flow.width * zoom) / 2,
    y: Math.max(0, (view.height - flow.height * zoom) / 2),
  };
}

// Opens on the trigger: the flow is centred sideways, and a flow taller than the screen starts at the top.
export function openingCamera(view: Size, flow: Size): Camera {
  const zoom = Math.max(READABLE_ZOOM, Math.min(1, view.width / flow.width));
  return { zoom, x: (view.width - flow.width * zoom) / 2, y: 0 };
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function interpolateCamera(from: Camera, to: Camera, amount: number): Camera {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    zoom: from.zoom + (to.zoom - from.zoom) * amount,
  };
}

function paintCamera(region: HTMLElement, layer: HTMLElement, camera: Camera) {
  layer.style.willChange = 'transform';
  layer.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
  // At low zoom the dots would be too dense, so the grid doubles its step.
  const step = (camera.zoom < 0.5 ? GRID_STEP * 2 : GRID_STEP) * camera.zoom;
  region.style.backgroundSize = `${step}px ${step}px`;
  region.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
}

function runAnimation(
  [from, target]: [Camera, Camera],
  set: (camera: Camera) => void,
  onDone: () => void,
) {
  if (prefersReducedMotion()) {
    set(target);
    onDone();
    return () => undefined;
  }
  let frame = 0;
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / ANIMATION_MS);
    set(interpolateCamera(from, target, 1 - (1 - progress) ** 3));
    if (progress < 1) frame = requestAnimationFrame(step);
    else onDone();
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

type EngineOptions = {
  region: HTMLElement;
  layer: HTMLElement;
  getFlow: () => Size;
  onZoom: (zoom: number) => void;
  onRest: (camera: Camera) => void;
};

// Moves the canvas by writing one CSS transform per frame. It never goes through React state,
// so dragging and wheel zooming stay smooth however many steps the flow has.
export function createCameraEngine({ region, layer, getFlow, onZoom, onRest }: EngineOptions) {
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let stopAnimation = () => undefined as void;
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  let holding = false;
  let touched = false;
  // Where a running animation is heading, so repeated key presses build on it instead of restarting.
  let goal: Camera | undefined;

  const view = (): Size => ({ width: region.clientWidth, height: region.clientHeight });

  function cancel() {
    stopAnimation();
    clearTimeout(restTimer);
    goal = undefined;
  }

  function set(next: Camera) {
    camera = next;
    paintCamera(region, layer, camera);
    onZoom(camera.zoom);
  }

  function rest() {
    layer.style.willChange = '';
    if (holding) return;
    const kept = keepFlowInView(camera, view(), getFlow());
    if (Math.hypot(kept.x - camera.x, kept.y - camera.y) > 1) animateTo(kept);
    else onRest(camera);
  }

  function scheduleRest() {
    clearTimeout(restTimer);
    restTimer = setTimeout(rest, REST_MS);
  }

  function animateTo(target: Camera) {
    cancel();
    touched = true;
    goal = target;
    stopAnimation = runAnimation([camera, target], set, () => {
      goal = undefined;
      scheduleRest();
    });
  }

  // Direct moves follow the input with no easing; the soft limit applies once input stops.
  function moveTo(next: Camera) {
    cancel();
    touched = true;
    set(next);
    scheduleRest();
  }

  return {
    camera: () => camera,
    goal: () => goal ?? camera,
    view,
    isTouched: () => touched,
    set,
    cancel,
    animateTo,
    moveTo,
    hold(next: boolean) {
      holding = next;
      if (next) cancel();
      else scheduleRest();
    },
  };
}

export type CameraEngine = ReturnType<typeof createCameraEngine>;
