import {
  type AutomationGraph,
  type AutomationStep,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';

import { conditionLabel } from './workflow-canvas-labels';

const TRIGGER_WIDTH = 440;
const STEP_WIDTH = 284;
const COLUMN_GAP = 40;
const ROW_GAP = 56;
// Rows that start with a labelled line or a merge get room for the bend, the pill and a plus.
const BRANCH_GAP = 104;
const MERGE_GAP = 150;
const MERGE_BEND = 72;
const LABEL_ABOVE = 62;
const PLUS_ABOVE = 26;
const PLUS_BELOW = 26;
const PADDING = 16;
// Cards show one truncated line per row, so heights are fixed and edges can be computed.
// The trigger card lists five rows, plus one when it shows recent entries.
const EXTRA_TRIGGER_ROW = 20;
const heights = {
  trigger: 190,
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
  from: string;
  to: string;
  path: string;
  label?: string;
  labelX: number;
  labelY: number;
  midX: number;
  midY: number;
};

export type CanvasLayout = {
  stepNumber: (key: string) => number;
  width: number;
  height: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  // Where two or more lines join into one step.
  // `pill` is false where a branch label already sits in the same place.
  merges: { id: string; x: number; y: number; plusY: number; pill: boolean }[];
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
  if (step.kind === 'condition' && step.paths.length === 1) return ['Yes', 'No'];
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

function routePath(route: string[], spots: Map<string, Spot>, merging: boolean) {
  const start = spots.get(route[0]!)!;
  let path = `M${start.centerX} ${start.bottom}`;
  let from = start;
  for (const item of route.slice(1)) {
    const spot = spots.get(item)!;
    if (spot.centerX !== from.centerX) {
      const bend = merging && item === route.at(-1) ? MERGE_BEND : ROW_GAP / 2;
      path += `V${from.laneBottom + bend}H${spot.centerX}`;
    }
    path += `V${spot.top}`;
    if (isWaypoint(item)) path += `V${spot.bottom}`;
    from = spot;
  }
  return path;
}

type RowSizes = {
  stepNumber: (key: string) => number;
  gapBefore: Map<string, number>;
  triggerHeight: number;
};

function placeRows(lanes: string[][], graph: AutomationGraph, sizes: RowSizes) {
  const { stepNumber, gapBefore, triggerHeight } = sizes;
  const widthOf = (item: string) => {
    if (isWaypoint(item)) return 0;
    return item === TRIGGER_KEY ? TRIGGER_WIDTH : STEP_WIDTH;
  };
  const stepOf = (item: string) => (item === TRIGGER_KEY ? null : graph.steps[item]!);
  const laneWidth = (lane: string[]) =>
    lane.reduce((sum, item) => sum + widthOf(item), 0) + (lane.length - 1) * COLUMN_GAP;
  const heightOf = (step: AutomationStep | null) => (step ? nodeHeight(step) : triggerHeight);
  const contentWidth = Math.max(...lanes.map(laneWidth));
  const nodes = new Map<string, CanvasNode>();
  const spots = new Map<string, Spot>();
  let y = PADDING;
  for (const [row, lane] of lanes.entries()) {
    if (row > 0) y += Math.max(ROW_GAP, ...lane.map((item) => gapBefore.get(item) ?? 0));
    const real = lane.filter((item) => !isWaypoint(item));
    const laneBottom = y + Math.max(...real.map((item) => heightOf(stepOf(item))));
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
      const height = heightOf(step);
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
    y = laneBottom;
  }
  return { nodes, spots, width: contentWidth + PADDING * 2, height: y + PADDING };
}

// Two paths to the same step share one line and one label.
function mergeParallel(links: Link[]) {
  const merged = new Map<string, Link>();
  for (const link of links) {
    const key = `${link.from}:${link.to}`;
    const first = merged.get(key);
    const label = [first?.label, link.label].filter(Boolean).join(' + ') || undefined;
    merged.set(key, { ...link, label });
  }
  return [...merged.values()];
}

function mergeMarkers(links: Link[], mergeKeys: Set<string>, spots: Map<string, Spot>) {
  return [...spots]
    .filter(([key]) => mergeKeys.has(key))
    .map(([key, spot]) => ({
      id: key,
      x: spot.centerX,
      y: spot.top - LABEL_ABOVE,
      plusY: spot.top - PLUS_ABOVE,
      pill: !links.some((link) => link.to === key && link.label),
    }));
}

export function layoutWorkflow(graph: AutomationGraph, extraTriggerRow = false): CanvasLayout {
  const order = readingOrder(graph);
  const numbered = order.filter((key) => graph.steps[key]!.kind !== 'exit');
  const stepNumber = (key: string) => numbered.indexOf(key) + 1;
  const rows = new Map([[TRIGGER_KEY, 0], ...rowOfEachStep(order, graph.steps)]);
  const paths: Link[] = [{ from: TRIGGER_KEY, to: graph.firstStepKey }];
  for (const key of order) {
    const step = graph.steps[key]!;
    const labels = branchLabels(step, stepNumber);
    nextStepKeys(step).forEach((to, index) => paths.push({ from: key, to, label: labels[index] }));
  }
  const links = mergeParallel(paths);
  const routes = links.map((link, index) => routeOf(link, index, rows));
  const lanes = arrangeRows(routes, rows);

  const mergeKeys = new Set(
    links
      .filter((link) => links.filter((other) => other.to === link.to).length > 1)
      .map((link) => link.to),
  );
  const gapBefore = new Map<string, number>();
  for (const link of links) {
    if (link.label) gapBefore.set(link.to, BRANCH_GAP);
    if (mergeKeys.has(link.to)) gapBefore.set(link.to, MERGE_GAP);
  }
  const triggerHeight = heights.trigger + (extraTriggerRow ? EXTRA_TRIGGER_ROW : 0);
  const { nodes, spots, width, height } = placeRows(lanes, graph, {
    stepNumber,
    gapBefore,
    triggerHeight,
  });

  const edges = links.map(({ from, to, label }, index) => {
    const target = spots.get(to)!;
    const merging = mergeKeys.has(to);
    const source = spots.get(from)!;
    return {
      id: `${index}:${from}:${to}`,
      from,
      to,
      path: routePath(routes[index]!, spots, merging),
      label,
      labelX: target.centerX,
      labelY: target.top - LABEL_ABOVE,
      // Where the add button of this line sits. Under a label it is just above the target; lines
      // that join another path get it under their own card, so each branch has its own.
      midX: merging ? source.centerX : target.centerX,
      midY: merging ? source.bottom + PLUS_BELOW : target.top - (label ? PLUS_ABOVE : ROW_GAP / 2),
    };
  });
  const merges = mergeMarkers(links, mergeKeys, spots);
  return {
    stepNumber,
    merges,
    width,
    height,
    // The reading order is also the order a screen reader hears.
    nodes: [TRIGGER_KEY, ...order].map((key) => nodes.get(key)!),
    edges,
  };
}
