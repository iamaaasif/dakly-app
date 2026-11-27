import {
  type CameraEngine,
  type Camera,
  clampZoom,
  fitCamera,
  type Point,
  zoomAround,
} from './workflow-canvas-camera';

type Flow = { width: number; height: number };

// A press that moves less than this is a click on the step under it, not a pan.
const DRAG_THRESHOLD = 4;
const KEY_PAN = 50;
const KEY_PAN_FAST = 200;
const ZOOM_STEP = 0.1;
const FOCUS_MARGIN = 24;
const interactiveTarget = 'li, button, a, input, textarea, select';
const editableTarget = 'input, textarea, select, [contenteditable="true"]';

export function stepZoom(zoom: number, direction: 1 | -1) {
  return clampZoom(Math.round((zoom + direction * ZOOM_STEP) * 10) / 10);
}

export function zoomFromCentre(engine: CameraEngine, zoom: number) {
  const view = engine.view();
  const centre = { x: view.width / 2, y: view.height / 2 };
  engine.animateTo(zoomAround(engine.goal(), centre, zoom));
}

function panBy(engine: CameraEngine, dx: number, dy: number) {
  const camera = engine.camera();
  engine.moveTo({ ...camera, x: camera.x + dx, y: camera.y + dy });
}

function localPoint(region: HTMLElement, event: { clientX: number; clientY: number }): Point {
  const box = region.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

function middle(points: Point[]): Point {
  const [first, second] = points;
  if (!first || !second) return first ?? { x: 0, y: 0 };
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function spread(points: Point[]) {
  const [first, second] = points;
  return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
}

// A mouse drag that starts on a step is not a pan; a finger always is, since steps fill a phone.
function startsPan(event: PointerEvent, onNode: boolean) {
  if (event.pointerType !== 'mouse') return true;
  return !onNode && (event.button === 0 || event.button === 1);
}

function isStillAClick(start: Point[], now: Point[]) {
  const [from] = start;
  const [to] = now;
  if (!from || !to) return true;
  return now.length === 1 && Math.hypot(to.x - from.x, to.y - from.y) < DRAG_THRESHOLD;
}

type Baseline = { camera: Camera; points: Point[] };

function movedCamera(baseline: Baseline, points: Point[]): Camera {
  const from = middle(baseline.points);
  const to = middle(points);
  const ratio = baseline.points.length === 2 ? spread(points) / (spread(baseline.points) || 1) : 1;
  const zoomed = zoomAround(baseline.camera, from, baseline.camera.zoom * ratio);
  return { ...zoomed, x: zoomed.x + to.x - from.x, y: zoomed.y + to.y - from.y };
}

// One finger or the mouse pans. Two fingers pan and zoom around the point between them.
function trackPointers(region: HTMLElement, engine: CameraEngine) {
  const pointers = new Map<number, Point>();
  let baseline: Baseline = { camera: engine.camera(), points: [] };
  let moved = false;

  const rebase = () => {
    baseline = { camera: engine.camera(), points: [...pointers.values()] };
  };

  function beginPan() {
    region.dataset.panning = 'true';
    for (const id of pointers.keys()) {
      try {
        region.setPointerCapture(id);
      } catch {
        // The pointer ended before capture, so there is nothing to keep following.
      }
    }
  }

  function onDown(event: PointerEvent) {
    const onNode = (event.target as Element).closest(interactiveTarget) !== null;
    if (pointers.size === 0 && !startsPan(event, onNode)) return;
    if (pointers.size === 0) {
      moved = false;
      if (!onNode) region.focus({ preventScroll: true });
    }
    pointers.set(event.pointerId, localPoint(region, event));
    engine.hold(true);
    rebase();
  }

  function onMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, localPoint(region, event));
    const points = [...pointers.values()];
    if (!moved && isStillAClick(baseline.points, points)) return;
    if (!moved) {
      moved = true;
      beginPan();
    }
    engine.moveTo(movedCamera(baseline, points));
  }

  function onUp(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 0) {
      region.dataset.panning = 'false';
      engine.hold(false);
    } else rebase();
  }

  const handlers = {
    pointerdown: onDown,
    pointermove: onMove,
    pointerup: onUp,
    pointercancel: onUp,
  };
  for (const [name, handler] of Object.entries(handlers))
    region.addEventListener(name, handler as EventListener);
  return () => {
    for (const [name, handler] of Object.entries(handlers))
      region.removeEventListener(name, handler as EventListener);
  };
}

function wheelDistance(event: WheelEvent, region: HTMLElement) {
  const units = [1, 16, region.clientHeight];
  const unit = units[event.deltaMode] ?? 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}

// A plain wheel and a two-finger scroll pan. Ctrl or Cmd with the wheel, and a trackpad pinch
// (which the browser reports as Ctrl + wheel), zoom around the pointer.
function trackWheel(region: HTMLElement, engine: CameraEngine) {
  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const distance = wheelDistance(event, region);
    if (event.ctrlKey || event.metaKey) {
      const speed = Math.abs(distance.y) < 50 ? 0.01 : 0.0025;
      const zoom = engine.camera().zoom * Math.exp(-distance.y * speed);
      engine.moveTo(zoomAround(engine.camera(), localPoint(region, event), zoom));
      return;
    }
    const sideways = event.shiftKey && distance.x === 0;
    panBy(engine, sideways ? -distance.y : -distance.x, sideways ? 0 : -distance.y);
  }
  // React attaches wheel listeners as passive, which cannot stop the page from zooming.
  region.addEventListener('wheel', onWheel, { passive: false });
  return () => region.removeEventListener('wheel', onWheel);
}

function runKey(event: KeyboardEvent, engine: CameraEngine, flow: Flow) {
  const pan = event.shiftKey ? KEY_PAN_FAST : KEY_PAN;
  const zoom = engine.goal().zoom;
  const actions: Record<string, () => void> = {
    ArrowLeft: () => panBy(engine, pan, 0),
    ArrowRight: () => panBy(engine, -pan, 0),
    ArrowUp: () => panBy(engine, 0, pan),
    ArrowDown: () => panBy(engine, 0, -pan),
    '+': () => zoomFromCentre(engine, stepZoom(zoom, 1)),
    '=': () => zoomFromCentre(engine, stepZoom(zoom, 1)),
    '-': () => zoomFromCentre(engine, stepZoom(zoom, -1)),
  };
  const fit = () => engine.animateTo(fitCamera(engine.view(), flow));
  // Matched by key code, because Shift changes the character that "0" and "1" produce.
  if (event.code === 'Digit0') (event.shiftKey ? () => zoomFromCentre(engine, 1) : fit)();
  else if (event.code === 'Digit1' && event.shiftKey) fit();
  else if (actions[event.key]) actions[event.key]?.();
  else return false;
  return true;
}

type Span = [number, number];

// How far to move an item so it sits inside the frame; the start edge wins when it is too big.
function shiftIntoView([low, high]: Span, [start, end]: Span) {
  if (low < start + FOCUS_MARGIN) return start + FOCUS_MARGIN - low;
  if (high > end - FOCUS_MARGIN) return end - FOCUS_MARGIN - high;
  return 0;
}

// Tabbing to a step that is off screen brings it into view. A click already shows its target.
function trackFocus(region: HTMLElement, engine: CameraEngine) {
  function onFocus(event: FocusEvent) {
    const target = event.target as HTMLElement;
    if (!target.matches(':focus-visible') || !target.closest('li')) return;
    const box = target.getBoundingClientRect();
    const frame = region.getBoundingClientRect();
    const dx = shiftIntoView([box.left, box.right], [frame.left, frame.right]);
    const dy = shiftIntoView([box.top, box.bottom], [frame.top, frame.bottom]);
    const camera = engine.camera();
    if (dx || dy) engine.animateTo({ ...camera, x: camera.x + dx, y: camera.y + dy });
  }
  region.addEventListener('focusin', onFocus);
  return () => region.removeEventListener('focusin', onFocus);
}

type Gestures = {
  region: HTMLElement;
  engine: CameraEngine;
  getFlow: () => Flow;
  onSpace: (held: boolean) => void;
};

// Shortcuts work while the pointer is over the canvas, or focus is on it or on its zoom bar, so
// they keep working after a click on a zoom button. Space turns the pointer into a hand, like Figma.
function trackKeyboard({ region, engine, getFlow, onSpace }: Gestures) {
  let hovering = false;
  const enter = () => (hovering = true);
  const leave = () => (hovering = false);
  const release = () => onSpace(false);
  const isActive = (target: Element) =>
    (hovering || region.contains(target) || target.closest('[data-canvas-controls]')) &&
    !target.closest(`${editableTarget}, [role="dialog"], [role="menu"]`);
  // Space on a focused step presses it, so it only pans when focus is somewhere else.
  const pressesStep = (target: Element) => region.contains(target) && target.closest('button, a');
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as Element;
    if (!isActive(target)) return;
    if (event.code !== 'Space') {
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (plain && runKey(event, engine, getFlow())) event.preventDefault();
    } else if (!pressesStep(target)) {
      event.preventDefault();
      if (!event.repeat) onSpace(true);
    }
  }
  function onKeyUp(event: KeyboardEvent) {
    if (event.code !== 'Space') return;
    event.preventDefault();
    release();
  }
  region.addEventListener('pointerenter', enter);
  region.addEventListener('pointerleave', leave);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', release);
  return () => {
    region.removeEventListener('pointerenter', enter);
    region.removeEventListener('pointerleave', leave);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', release);
  };
}

export function attachCanvasGestures({ region, engine, getFlow, onSpace }: Gestures) {
  const removers = [
    trackPointers(region, engine),
    trackWheel(region, engine),
    trackFocus(region, engine),
    trackKeyboard({ region, engine, getFlow, onSpace }),
  ];
  return () => removers.forEach((remove) => remove());
}
