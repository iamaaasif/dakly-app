import { Plus, Trash2 } from 'lucide-react';

import {
  privateReplyProblem,
  publicReplyProblem,
} from '@dakly/contracts/automations/comment-reply';
import type { AutomationStep } from '@dakly/contracts/automations/graph';
import { Button } from '@dakly/ui/button';
import { Switch } from '@dakly/ui/switch';
import { Textarea } from '@dakly/ui/textarea';

import { Field } from './workflow-panel-field';

type Action = Extract<AutomationStep, { kind: 'action' }>;
type PublicReply = Extract<Action['action'], { action: 'reply_to_comment' }>;
type PrivateReply = Extract<Action['action'], { action: 'send_private_reply' }>;

const MIN_LINES = 2;
const MAX_LINES = 5;

function lineProblem(line: string, lines: readonly string[]) {
  if (!line.trim()) return 'Write the line or remove it.';
  if (lines.filter((other) => other.trim() === line.trim()).length > 1) return 'This line repeats.';
  return publicReplyProblem(line);
}

function WordingRow({
  number,
  line,
  problem,
  canRemove,
  onChange,
  onRemove,
}: {
  number: number;
  line: string;
  problem: string | undefined;
  canRemove: boolean;
  onChange: (line: string) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-start gap-2">
        <Textarea
          aria-label={`Wording ${number}`}
          value={line}
          maxLength={300}
          rows={2}
          aria-invalid={problem !== undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          variant="secondary"
          aria-label={`Remove wording ${number}`}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : (
        <p className="text-sm text-success">No price, number or link. Safe to post.</p>
      )}
    </li>
  );
}

// Checked as the owner types, with the same rule the server applies before it posts.
export function PublicReplyFields({
  action,
  onChange,
}: {
  action: PublicReply;
  onChange: (action: PublicReply) => void;
}) {
  const { lines } = action;
  const set = (next: string[]) => onChange({ ...action, lines: next });
  return (
    <>
      <p className="text-sm text-text-muted">
        Everyone under the post can read this. Each person gets one of these lines, so Meta does not
        see the same text again and again.
      </p>
      <ul className="space-y-3">
        {lines.map((line, index) => (
          <WordingRow
            key={index}
            number={index + 1}
            line={line}
            problem={lineProblem(line, lines)}
            canRemove={lines.length > MIN_LINES}
            onChange={(next) =>
              set(lines.map((item, position) => (position === index ? next : item)))
            }
            onRemove={() => set(lines.filter((_, position) => position !== index))}
          />
        ))}
      </ul>
      {lines.length < MAX_LINES && (
        <Button variant="secondary" onClick={() => set([...lines, ''])}>
          <Plus size={16} aria-hidden="true" />
          Add a wording
        </Button>
      )}
    </>
  );
}

export function PrivateReplyFields({
  action,
  onChange,
}: {
  action: PrivateReply;
  onChange: (action: PrivateReply) => void;
}) {
  const problem = action.text.trim() ? privateReplyProblem(action.text) : 'Write the message.';
  return (
    <>
      <p className="text-sm text-text-muted">
        Goes to the commenter’s inbox. Meta allows one private reply for each comment, within 7
        days.
      </p>
      <Field label="Message" error={problem}>
        <Textarea
          aria-label="Message"
          value={action.text}
          maxLength={640}
          aria-invalid={problem !== undefined}
          onChange={(event) => onChange({ ...action, text: event.target.value })}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p id="product-card-label" className="font-medium">
            Add the product card
          </p>
          <p id="product-card-hint" className="text-sm text-text-muted">
            Name and price come from your products, only when the post shows one product that is in
            stock.
          </p>
        </div>
        <Switch
          checked={action.includeProduct}
          aria-labelledby="product-card-label"
          aria-describedby="product-card-hint"
          onCheckedChange={(includeProduct) => onChange({ ...action, includeProduct })}
        />
      </div>
      <section aria-label="Preview" className="space-y-2 rounded-lg bg-surface-muted p-3">
        <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Preview</p>
        <p className="max-w-[85%] rounded-lg rounded-tl-none bg-surface p-3 whitespace-pre-line shadow-card">
          {action.text.trim() || '…'}
        </p>
        {action.includeProduct && (
          <div className="max-w-[85%] rounded-lg border border-border bg-surface p-3 shadow-card">
            <p className="font-medium">Product name</p>
            <p className="text-sm text-text-muted">Price from your catalogue</p>
          </div>
        )}
      </section>
    </>
  );
}
