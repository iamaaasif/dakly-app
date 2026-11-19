import { Inject, Injectable } from '@nestjs/common';

import type { AutomationExitReason } from '@dakly/contracts/automations';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';

import { ContactsService } from '../contacts/contacts.service';
import { SegmentsService } from '../segments/segments.service';
import { SendPolicyService } from '../sending/send-policy.service';
import { AutomationRunsRepository } from './automation-runs.repository';
import {
  type Condition,
  hasHappened,
  type PathChoice,
  type RunFacts,
} from './automation-step-rules';

// The goal, exit conditions, workflow filters and condition paths, read for one run.
@Injectable()
export class AutomationConditionsService {
  constructor(
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(AutomationRunsRepository) private readonly repository: AutomationRunsRepository,
  ) {}

  // Checked before every step (feature 09): the goal, the exit conditions, then the workflow
  // filters.
  async exitReason(
    graph: AutomationGraph,
    facts: RunFacts,
    at: Date,
  ): Promise<AutomationExitReason | undefined> {
    const { goal, exitConditions, workflowFilters } = graph;
    if (goal && hasHappened(goal, facts)) return 'goal';
    if (exitConditions.some((exit) => hasHappened(exit, facts))) return 'exit_condition';
    for (const filter of workflowFilters)
      if (!(await this.holds(filter, facts, at))) return 'workflow_filter';
    return undefined;
  }

  async refreshExitReason(facts: RunFacts, at: Date) {
    const { storeId, contactId, runId } = facts;
    const tags = await this.contacts.findTags(storeId, contactId);
    const tappedStepKeys = await this.repository.listTappedStepKeys(storeId, runId);
    return this.exitReason(facts.graph, { ...facts, tags, tappedStepKeys }, at);
  }

  async firstHoldingPath(
    paths: { condition: Condition; next: string }[],
    facts: RunFacts,
    at: Date,
  ): Promise<PathChoice | undefined> {
    for (const [index, path] of paths.entries())
      if (await this.holds(path.condition, facts, at))
        return { outcome: `path_${index + 1}`, next: path.next };
    return undefined;
  }

  private async holds(condition: Condition, facts: RunFacts, at: Date): Promise<boolean> {
    const { storeId, contactId } = facts;
    switch (condition.kind) {
      // Publish refuses tap conditions until taps on workflow messages are recorded.
      case 'tapped':
        return facts.tappedStepKeys.includes(condition.stepKey);
      case 'has_tag':
        return facts.tags.includes(condition.tag);
      case 'in_segment':
        return this.segments.hasContact(storeId, condition.segmentId, contactId);
      // Reachable means the contact has an address and an open window on the channel; consent is
      // the send step's own check.
      case 'reachable': {
        const request = {
          contactId,
          channel: condition.channel,
          category: 'transactional',
          at,
        } as const;
        return (await this.sendPolicy.check(storeId, request)).action === 'send';
      }
      // Replies arrive with CHAT-2 (SMS cannot receive them), and orders with ORD-1.
      case 'replied':
      case 'placed_order':
        return false;
    }
  }
}
