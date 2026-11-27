import { describe, expect, it } from 'vitest';

import {
  fitCamera,
  keepFlowInView,
  MAX_ZOOM,
  MIN_ZOOM,
  openingCamera,
  zoomAround,
} from './workflow-canvas-camera';

const flow = { width: 800, height: 1200 };
const view = { width: 1440, height: 900 };

describe('canvas camera', () => {
  it('keeps the point under the cursor in place while zooming', () => {
    const camera = { x: 120, y: -40, zoom: 1 };
    const cursor = { x: 600, y: 300 };
    const worldBefore = {
      x: (cursor.x - camera.x) / camera.zoom,
      y: (cursor.y - camera.y) / camera.zoom,
    };
    const next = zoomAround(camera, cursor, 1.6);
    expect(next.zoom).toBe(1.6);
    expect(worldBefore.x * next.zoom + next.x).toBeCloseTo(cursor.x, 5);
    expect(worldBefore.y * next.zoom + next.y).toBeCloseTo(cursor.y, 5);
  });

  it('limits zoom to 25% and 200%', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    expect(zoomAround(camera, { x: 0, y: 0 }, 9).zoom).toBe(MAX_ZOOM);
    expect(zoomAround(camera, { x: 0, y: 0 }, 0.01).zoom).toBe(MIN_ZOOM);
  });

  it('fits the whole flow inside the view and centres it', () => {
    const camera = fitCamera(view, flow);
    expect(flow.height * camera.zoom).toBeLessThanOrEqual(view.height);
    expect(camera.x + (flow.width * camera.zoom) / 2).toBeCloseTo(view.width / 2, 5);
  });

  it('opens a wide flow on a phone at a readable zoom, centred on the trigger', () => {
    const camera = openingCamera({ width: 360, height: 800 }, { width: 800, height: 600 });
    expect(camera.zoom).toBe(0.7);
    expect(camera.x + (800 * 0.7) / 2).toBeCloseTo(180, 5);
    expect(camera.y).toBe(0);
  });

  it('pulls a flow that was dragged off screen back so part of it shows', () => {
    const kept = keepFlowInView({ x: 5000, y: -9000, zoom: 1 }, view, flow);
    expect(kept.x).toBeLessThan(view.width);
    expect(kept.y + flow.height).toBeGreaterThan(0);
    expect(keepFlowInView({ x: 100, y: 50, zoom: 1 }, view, flow)).toEqual({
      x: 100,
      y: 50,
      zoom: 1,
    });
  });
});
