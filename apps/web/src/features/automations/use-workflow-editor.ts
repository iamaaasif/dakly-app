import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AutomationDetailResponse } from '@dakly/contracts/automations';
import {
  type AutomationGraph,
  automationGraphSchema,
  type AutomationStep,
} from '@dakly/contracts/automations/graph';

import { usePublishAutomation, useSaveAutomation } from './api/automation-settings';
import type { useAutomation } from './api/automations';
import {
  appendStep,
  insertAfterMerge,
  canAddStep,
  insertStep,
  moveStep,
  type NewStepKind,
  removeStep,
  replaceStep,
} from './workflow-graph-edit';

type Refresh = ReturnType<typeof useAutomation>['refetch'];

function graphEdits(graph: AutomationGraph, change: (next: AutomationGraph) => void) {
  return {
    apply: change,
    insert: (edge: { parent: string; target: string }, kind: NewStepKind) =>
      change(insertStep(graph, edge, kind)),
    append: (kind: NewStepKind) => change(appendStep(graph, kind)),
    insertAfterMerge: (target: string, kind: NewStepKind) =>
      change(insertAfterMerge(graph, target, kind)),
    remove: (key: string) => change(removeStep(graph, key)),
    update: (key: string, step: AutomationStep) => change(replaceStep(graph, key, step)),
    canMove: (key: string, direction: 'up' | 'down') =>
      moveStep(graph, key, direction) !== undefined,
    move: (key: string, direction: 'up' | 'down') =>
      change(moveStep(graph, key, direction) ?? graph),
  };
}

export function useWorkflowEditor(workflow: AutomationDetailResponse, refresh: Refresh) {
  const router = useRouter();
  const save = useSaveAutomation(workflow.id);
  const publish = usePublishAutomation(workflow.id);
  const [graph, setGraph] = useState(workflow.graph);
  const [saved, setSaved] = useState(workflow.graph);
  const [count, setCount] = useState<number>();
  const [problem, setProblem] = useState<string>();

  function change(next: AutomationGraph) {
    setGraph(next);
    setProblem(undefined);
    save.reset();
  }

  function fail(message = 'Check the workflow before saving.') {
    setProblem(message);
    return false;
  }

  async function saveGraph() {
    const parsed = automationGraphSchema.safeParse(graph);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);
    return save.mutateAsync(parsed.data).then(
      () => {
        setSaved(graph);
        return true;
      },
      () => false,
    );
  }

  async function confirm() {
    if (!automationGraphSchema.safeParse(graph).success) return void saveGraph();
    const result = await refresh();
    if (result.isError || !result.data) {
      return void fail('Could not check who is in this workflow. Try again.');
    }
    setCount(result.data.activeRuns);
  }

  async function start() {
    if (graph !== saved && !(await saveGraph())) return;
    publish.mutate(undefined, { onSuccess: () => router.push('/automations?tab=active') });
  }

  return {
    graph,
    dirty: graph !== saved,
    pending: save.isPending || publish.isPending,
    saving: save.isPending,
    saved: save.isSuccess,
    count,
    error: problem ?? save.error?.message ?? publish.error?.message,
    canAdd: canAddStep(graph),
    ...graphEdits(graph, change),
    save: saveGraph,
    confirm,
    start,
    close: () => {
      save.reset();
      publish.reset();
      setCount(undefined);
    },
  };
}
