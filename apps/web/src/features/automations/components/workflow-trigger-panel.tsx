import { useState } from 'react';

import { automationTriggers, type TriggerKey } from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { commentIntents } from '@dakly/contracts/comments';
import { Button } from '@dakly/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { Sheet } from '@dakly/ui/sheet';

import {
  chatIntentLabels,
  commentIntentLabels,
  messageIntentChoices,
} from '../automation-filter-labels';
import { channelLabels, triggerEntryLabels, triggerTitles } from '../automation-labels';
import { changeTrigger, pickableTriggers, type TriggerChange } from '../workflow-trigger-change';
import { findFilter, setFilter, toggleValue } from '../workflow-trigger-filters';
import { ChoiceChips, KeywordChips } from './workflow-filter-chips';
import { PostPicker, ProductPicker } from './workflow-filter-pickers';
import { OrderTotalFilters } from './workflow-total-filters';
import { SessionDialog } from '@/components/session-dialog';

type Props = {
  graph: AutomationGraph;
  onChange: (graph: AutomationGraph) => void;
  onClose: () => void;
};

// Texting is not a chat, so SMS is not offered.
const chatChannels = ['messenger', 'instagram', 'whatsapp'] as const;

type FormProps = Pick<Props, 'graph' | 'onChange'>;

function Keywords({ graph, onChange }: FormProps) {
  const keywords = findFilter(graph, 'keywords')?.keywords ?? [];
  return (
    <KeywordChips
      keywords={keywords}
      onChange={(next) =>
        onChange(
          setFilter(graph, 'keywords', next.length ? { field: 'keywords', keywords: next } : null),
        )
      }
    />
  );
}

function MessageFilters({ graph, onChange }: FormProps) {
  const channels = findFilter(graph, 'channel')?.channels ?? [];
  const intents = findFilter(graph, 'intent')?.intents ?? [];
  return (
    <>
      <p className="text-sm text-text-muted">
        Starts once for a burst of messages, after the chat reads what the customer is asking. Leave
        a group empty to allow anything.
      </p>
      <ChoiceChips
        label="Channel"
        choices={chatChannels.map((value) => ({ value, label: channelLabels[value] }))}
        selected={channels}
        onToggle={(value) => {
          const next = toggleValue(channels, value);
          onChange(
            setFilter(graph, 'channel', next.length ? { field: 'channel', channels: next } : null),
          );
        }}
      />
      <ChoiceChips
        label="What the customer is asking"
        choices={messageIntentChoices.map((value) => ({ value, label: chatIntentLabels[value] }))}
        selected={intents}
        onToggle={(value) => {
          const next = toggleValue(intents, value);
          onChange(
            setFilter(graph, 'intent', next.length ? { field: 'intent', intents: next } : null),
          );
        }}
      />
      <Keywords graph={graph} onChange={onChange} />
    </>
  );
}

function CommentFilters({ graph, onChange }: FormProps) {
  const postIds = findFilter(graph, 'post')?.externalPostIds ?? [];
  const productIds = findFilter(graph, 'product')?.productIds ?? [];
  const intents = findFilter(graph, 'comment_intent')?.intents ?? [];
  return (
    <>
      <p className="text-sm text-text-muted">
        Starts for a top-level comment, once for each person on each post. Spam and hidden comments
        never start it.
      </p>
      <PostPicker
        selected={postIds}
        onChange={(next) =>
          onChange(
            setFilter(graph, 'post', next.length ? { field: 'post', externalPostIds: next } : null),
          )
        }
      />
      <ProductPicker
        selected={productIds}
        onChange={(next) =>
          onChange(
            setFilter(
              graph,
              'product',
              next.length ? { field: 'product', productIds: next } : null,
            ),
          )
        }
      />
      <ChoiceChips
        label="What the comment says"
        choices={commentIntents.map((value) => ({ value, label: commentIntentLabels[value] }))}
        selected={intents}
        onToggle={(value) => {
          const next = toggleValue(intents, value);
          onChange(
            setFilter(
              graph,
              'comment_intent',
              next.length ? { field: 'comment_intent', intents: next } : null,
            ),
          );
        }}
      />
      <Keywords graph={graph} onChange={onChange} />
    </>
  );
}

function hasOrderTotals(graph: AutomationGraph) {
  return 'customer_spend' in automationTriggers[graph.trigger.key].filters;
}

function hasTriggerForm(graph: AutomationGraph) {
  return (
    graph.trigger.key === 'comment_on_post' ||
    graph.trigger.key === 'message_received' ||
    hasOrderTotals(graph)
  );
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

function ChangeWarning({ change }: { change: TriggerChange }) {
  const order = change.orderDetailSteps.length;
  const replies = change.replySteps.length;
  return (
    <div className="space-y-2">
      {order > 0 && (
        <p>
          {order} {plural(order, 'message uses', 'messages use')} order details, which only an order
          trigger has.
        </p>
      )}
      {replies > 0 && (
        <p>
          {replies} comment {plural(replies, 'reply', 'replies')} only work after a comment on a
          post.
        </p>
      )}
      <p className="text-sm text-text-muted">These steps are removed if you change the trigger.</p>
    </div>
  );
}

function TriggerChoice({ graph, onChange }: FormProps) {
  const [pending, setPending] = useState<{ key: TriggerKey; change: TriggerChange }>();
  const current = graph.trigger.key;
  const keys = pickableTriggers.includes(current)
    ? pickableTriggers
    : [current, ...pickableTriggers];
  function choose(key: TriggerKey) {
    const change = changeTrigger(graph, key);
    if (change.orderDetailSteps.length || change.replySteps.length) setPending({ key, change });
    else onChange(change.graph);
  }
  return (
    <div className="space-y-1.5">
      <Select value={current} onValueChange={(key) => choose(key as TriggerKey)}>
        <SelectTrigger aria-label="Trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {keys.map((key) => (
            <SelectItem key={key} value={key}>
              {triggerTitles[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && (
        <SessionDialog
          open
          title={`Change trigger to ${triggerTitles[pending.key]}?`}
          onClose={() => setPending(undefined)}
        >
          <ChangeWarning change={pending.change} />
          <Button
            className="mt-4"
            onClick={() => {
              onChange(pending.change.graph);
              setPending(undefined);
            }}
          >
            Change trigger
          </Button>
        </SessionDialog>
      )}
    </div>
  );
}

export function WorkflowTriggerPanel({ graph, onChange, onClose }: Props) {
  return (
    <Sheet
      open
      width="wide"
      title="Trigger"
      description={`Customers enter when they ${triggerEntryLabels[graph.trigger.key]}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-5">
        <TriggerChoice graph={graph} onChange={onChange} />
        {graph.trigger.key === 'comment_on_post' && (
          <CommentFilters graph={graph} onChange={onChange} />
        )}
        {graph.trigger.key === 'message_received' && (
          <MessageFilters graph={graph} onChange={onChange} />
        )}
        {hasOrderTotals(graph) && <OrderTotalFilters graph={graph} onChange={onChange} />}
        {!hasTriggerForm(graph) && (
          <p className="text-sm text-text-muted">This trigger has no filters to edit.</p>
        )}
      </div>
    </Sheet>
  );
}
