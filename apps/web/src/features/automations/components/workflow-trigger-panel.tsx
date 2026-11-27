import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { commentIntents } from '@dakly/contracts/comments';
import { Button } from '@dakly/ui/button';
import { Sheet } from '@dakly/ui/sheet';

import {
  chatIntentLabels,
  commentIntentLabels,
  messageIntentChoices,
} from '../automation-filter-labels';
import { channelLabels, triggerEntryLabels } from '../automation-labels';
import { findFilter, setFilter, toggleValue } from '../workflow-trigger-filters';
import { ChoiceChips, KeywordChips } from './workflow-filter-chips';
import { PostPicker, ProductPicker } from './workflow-filter-pickers';

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

function hasTriggerForm(graph: AutomationGraph) {
  return graph.trigger.key === 'comment_on_post' || graph.trigger.key === 'message_received';
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
        {graph.trigger.key === 'comment_on_post' && (
          <CommentFilters graph={graph} onChange={onChange} />
        )}
        {graph.trigger.key === 'message_received' && (
          <MessageFilters graph={graph} onChange={onChange} />
        )}
        {!hasTriggerForm(graph) && (
          <p className="text-sm text-text-muted">This trigger has no filters to edit.</p>
        )}
      </div>
    </Sheet>
  );
}
