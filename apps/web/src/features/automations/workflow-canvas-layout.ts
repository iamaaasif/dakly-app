import {
  type AutomationGraph,
  type AutomationStep,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';

import { conditionLabel } from './workflow-canvas-labels';

const TRIGGER_WIDTH = 328;
const STEP_WIDTH = 260;
const COLUMN_GAP = 40;
const ROW_GAP = 56;
const PADDING = 16;
// Cards show one truncated line per row, so heights are fixed and edges can be computed.
const heights = {
  trigger: 208,
  wait: 44,
  send: 72,
  action: 72,
  condition: 72,
  random_split: 72,
  exit: 24,
};

export type CanvasNode = {
  key: string;
  // Null for the trigger.
  step: AutomationStep | null;
  // Exit markers have no number.
  number: number | null;
  // Where each path of a split goes, for people who cannot see the lines.
  branches: string[];
  x: number;
  y: number;
  width: number;
  height: number;
};

type CanvasEdge = {
  id: string;
  path: string;
  label?: string;
  labelX: number;
  labelY: number;
};

export type CanvasLayout = {
  stepNumber: (key: string) => number;
  width: number;
  height: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export const TRIGGER_KEY = 'trigger';

function nodeHeight(step: AutomationStep | null) {
  return heights[step?.kind ?? 'trigger'];
}

// Numbers follow the order a person reads the flow: first step, then each path in turn.
function readingOrder({ firstStepKey, steps }: Pick<AutomationGraph, 'firstStepKey' | 'steps'>) {
  const order: string[] = [];
  function visit(key: string) {
    if (order.includes(key)) return;
    order.push(key);
    nextStepKeys(steps[key]!).forEach(visit);
  }
  visit(firstStepKey);
  return order;
}

// A step sits one row below its deepest parent, so a merge never points upward.
function rowOfEachStep(order: string[], steps: AutomationGraph['steps']) {
  const parents = new Map(order.map((key) => [key, 0]));
  for (const key of order) {
    for (const next of nextStepKeys(steps[key]!)) parents.set(next, parents.get(next)! + 1);
  }
  const rows = new Map<string, number>();
  const ready = order.filter((key) => parents.get(key) === 0);
  for (const key of ready) rows.set(key, 1);
  while (ready.length) {
    const key = ready.shift()!;
    for (const next of nextStepKeys(steps[key]!)) {
      rows.set(next, Math.max(rows.get(next) ?? 1, rows.get(key)! + 1));
      parents.set(next, parents.get(next)! - 1);
      if (parents.get(next) === 0) ready.push(next);
    }
  }
  return rows;
}

function branchLabels(step: AutomationStep, stepNumber: (key: string) => number) {
  if (step.kind === 'condition') {
    return [...step.paths.map((path) => conditionLabel(path.condition, stepNumber)), 'Else'];
  }
  if (step.kind === 'random_split') return step.paths.map((path) => `${path.percent}%`);
  return [undefined];
}

function describeBranches(
  step: AutomationStep,
  steps: AutomationGraph['steps'],
  stepNumber: (key: string) => number,
) {
  if (step.kind !== 'condition' && step.kind !== 'random_split') return [];
  const labels = branchLabels(step, stepNumber);
  return nextStepKeys(step).map((next, index) => {
    const target = steps[next]!.kind === 'exit' ? 'exit' : `step ${stepNumber(next)}`;
    return `${labels[index]}: ${target}`;
  });
}

type Link = { from: string; to: string; label?: string };
type Spot = { centerX: number; top: number; bottom: number; laneBottom: number };

const isWaypoint = (item: string) => item.startsWith('~');

// A link that skips rows gets a waypoint in each row it passes, so its line runs beside the cards
// in between and never behind them.
function routeOf(link: Link, index: number, rows: Map<string, number>) {
  const route = [link.from];
  for (let row = rows.get(link.from)! + 1; row < rows.get(link.to)!; row += 1) {
    const waypoint = `~${index}:${row}`;
    rows.set(waypoint, row);
    route.push(waypoint);
  }
  return [...route, link.to];
}

// Each row is ordered by where the items above it sit, so lines rarely cross.
function arrangeRows(routes: string[][], rows: Map<string, number>) {
  const above = new Map<string, string[]>();
  for (const route of routes) {
    route.slice(1).forEach((item, index) => {
      above.set(item, [...(above.get(item) ?? []), route[index]!]);
    });
  }
  const rank = new Map([...rows.keys()].map((item, index) => [item, index]));
  const lanes: string[][] = [];
  for (const item of rank.keys()) (lanes[rows.get(item)!] ??= []).push(item);
  for (let row = 1; row < lanes.length; row += 1) {
    const place = new Map(lanes[row - 1]!.map((item, index) => [item, index]));
    const middle = (item: string) => {
      const parents = above.get(item)!;
      return parents.reduce((sum, parent) => sum + place.get(parent)!, 0) / parents.length;
    };
    lanes[row]!.sort((a, b) => middle(a) - middle(b) || rank.get(a)! - rank.get(b)!);
  }
  return lanes;
}

function routePath(route: string[], spots: Map<string, Spot>) {
  const start = spots.get(route[0]!)!;
  let path = `M${start.centerX} ${start.bottom}`;
  let from = start;
  for (const item of route.slice(1)) {
    const spot = spots.get(item)!;
    if (spot.centerX !== from.centerX) {
      path += `V${from.laneBottom + ROW_GAP / 2}H${spot.centerX}`;
    }
    path += `V${spot.top}`;
    if (isWaypoint(item)) path += `V${spot.bottom}`;
    from = spot;
  }
  return path;
}

function placeRows(lanes: string[][], graph: AutomationGraph, stepNumber: (key: string) => number) {
  const widthOf = (item: string) => {
    if (isWaypoint(item)) return 0;
    return item === TRIGGER_KEY ? TRIGGER_WIDTH : STEP_WIDTH;
  };
  const stepOf = (item: string) => (item === TRIGGER_KEY ? null : graph.steps[item]!);
  const laneWidth = (lane: string[]) =>
    lane.reduce((sum, item) => sum + widthOf(item), 0) + (lane.length - 1) * COLUMN_GAP;
  const contentWidth = Math.max(...lanes.map(laneWidth));
  const nodes = new Map<string, CanvasNode>();
  const spots = new Map<string, Spot>();
  let y = PADDING;
  for (const lane of lanes) {
    const real = lane.filter((item) => !isWaypoint(item));
    const laneBottom = y + Math.max(...real.map((item) => nodeHeight(stepOf(item))));
    let x = PADDING + (contentWidth - laneWidth(lane)) / 2;
    for (const item of lane) {
      const width = widthOf(item);
      const centerX = x + width / 2;
      x += width + COLUMN_GAP;
      if (isWaypoint(item)) {
        spots.set(item, { centerX, top: y, bottom: laneBottom, laneBottom });
        continue;
      }
      const step = stepOf(item);
      const height = nodeHeight(step);
      const number = step && step.kind !== 'exit' ? stepNumber(item) : null;
      const branches = step ? describeBranches(step, graph.steps, stepNumber) : [];
      nodes.set(item, {
        key: item,
        step,
        number,
        branches,
        x: centerX - width / 2,
        y,
        width,
        height,
      });
      spots.set(item, { centerX, top: y, bottom: y + height, laneBottom });
    }
    y = laneBottom + ROW_GAP;
  }
  return { nodes, spots, width: contentWidth + PADDING * 2, height: y - ROW_GAP + PADDING };
}

export function layoutWorkflow(graph: AutomationGraph): CanvasLayout {
  const order = readingOrder(graph);
  const numbered = order.filter((key) => graph.steps[key]!.kind !== 'exit');
  const stepNumber = (key: string) => numbered.indexOf(key) + 1;
  const rows = new Map([[TRIGGER_KEY, 0], ...rowOfEachStep(order, graph.steps)]);
  const links: Link[] = [{ from: TRIGGER_KEY, to: graph.firstStepKey }];
  for (const key of order) {
    const step = graph.steps[key]!;
    const labels = branchLabels(step, stepNumber);
    nextStepKeys(step).forEach((to, index) => links.push({ from: key, to, label: labels[index] }));
  }
  const routes = links.map((link, index) => routeOf(link, index, rows));
  const lanes = arrangeRows(routes, rows);

  const { nodes, spots, width, height } = placeRows(lanes, graph, stepNumber);

  const edges = links.map(({ from, to, label }, index) => {
    const target = spots.get(to)!;
    return {
      id: `${index}:${from}:${to}`,
      path: routePath(routes[index]!, spots),
      label,
      labelX: target.centerX,
      labelY: target.top - ROW_GAP / 4,
    };
  });
  return {
    stepNumber,
    width,
    height,
    // The reading order is also the order a screen reader hears.
    nodes: [TRIGGER_KEY, ...order].map((key) => nodes.get(key)!),
    edges,
  };
}
