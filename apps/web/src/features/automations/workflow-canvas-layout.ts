import {
  type AutomationGraph,
  type AutomationStep,
  nextStepKeys,
} from '@dakly/contracts/automations/graph';

import { conditionLabel } from './workflow-canvas-labels';

const TRIGGER_WIDTH = 400;
const STEP_WIDTH = 280;
const COLUMN_GAP = 48;
const ROW_GAP = 56;
const PADDING = 32;
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

function edgePath(from: CanvasNode, to: CanvasNode) {
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height;
  const endX = to.x + to.width / 2;
  if (startX === endX) return `M${startX} ${startY}V${to.y}`;
  const bendY = startY + ROW_GAP / 2;
  return `M${startX} ${startY}V${bendY}H${endX}V${to.y}`;
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

export function layoutWorkflow(graph: AutomationGraph): CanvasLayout {
  const order = readingOrder(graph);
  const numbered = order.filter((key) => graph.steps[key]!.kind !== 'exit');
  const stepNumber = (key: string) => numbered.indexOf(key) + 1;
  const rows = rowOfEachStep(order, graph.steps);
  const lanes: string[][] = [[TRIGGER_KEY]];
  for (const key of order) (lanes[rows.get(key)!] ??= []).push(key);

  const widthOf = (key: string) => (key === TRIGGER_KEY ? TRIGGER_WIDTH : STEP_WIDTH);
  const laneWidth = (lane: string[]) =>
    lane.reduce((sum, key) => sum + widthOf(key), 0) + (lane.length - 1) * COLUMN_GAP;
  const contentWidth = Math.max(...lanes.map(laneWidth));
  const nodes = new Map<string, CanvasNode>();
  let y = PADDING;
  for (const lane of lanes) {
    let x = PADDING + (contentWidth - laneWidth(lane)) / 2;
    for (const key of lane) {
      const step = key === TRIGGER_KEY ? null : graph.steps[key]!;
      const number = step && step.kind !== 'exit' ? stepNumber(key) : null;
      const branches = step ? describeBranches(step, graph.steps, stepNumber) : [];
      const size = { width: widthOf(key), height: nodeHeight(step) };
      nodes.set(key, { key, step, number, branches, x, y, ...size });
      x += widthOf(key) + COLUMN_GAP;
    }
    y += Math.max(...lane.map((key) => nodes.get(key)!.height)) + ROW_GAP;
  }

  const links: { from: string; to: string; label?: string }[] = [
    { from: TRIGGER_KEY, to: graph.firstStepKey },
  ];
  for (const key of order) {
    const step = graph.steps[key]!;
    const labels = branchLabels(step, stepNumber);
    nextStepKeys(step).forEach((to, index) => links.push({ from: key, to, label: labels[index] }));
  }
  const edges = links.map(({ from, to, label }, index) => {
    const target = nodes.get(to)!;
    return {
      id: `${index}:${from}:${to}`,
      path: edgePath(nodes.get(from)!, target),
      label,
      labelX: target.x + target.width / 2,
      labelY: target.y - ROW_GAP / 4,
    };
  });
  return {
    stepNumber,
    width: contentWidth + PADDING * 2,
    height: y - ROW_GAP + PADDING,
    nodes: [...nodes.values()],
    edges,
  };
}
