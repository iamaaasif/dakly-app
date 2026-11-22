'use client';
import { Check } from 'lucide-react';

import { Button } from '@dakly/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useBulkUpdateConversations, type BulkChange } from '../api/bulk-conversations';
import { useConversationAssignees, useConversationLabels } from '../api/conversations';

const nobody = 'nobody';

type ChatBulkBarProps = { selected: string[]; onDone: () => void };

export function ChatBulkBar({ selected, onDone }: ChatBulkBarProps) {
  const update = useBulkUpdateConversations();
  const none = selected.length === 0;
  const apply = (action: BulkChange) =>
    update.mutate({ ids: selected, ...action }, { onSuccess: ({ failed }) => !failed && onDone() });
  return (
    <div className="shrink-0 space-y-2 border-b border-border bg-surface-muted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{selected.length} selected</p>
        <Button
          variant="secondary"
          disabled={none}
          loading={update.isPending}
          onClick={() => apply({ change: { status: 'done' } })}
        >
          <Check aria-hidden="true" size={16} strokeWidth={1.75} />
          Mark done
        </Button>
        <AssignSelect
          disabled={none || update.isPending}
          onAssign={(assigneeUserId) => apply({ change: { assigneeUserId } })}
        />
        <LabelSelect disabled={none || update.isPending} onLabel={(label) => apply({ label })} />
        <Button variant="link" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {update.data?.failed ? (
        <p role="alert" className="text-danger">
          {update.data.failed} of {selected.length} chats could not be changed. They stay selected.
        </p>
      ) : null}
      {update.error ? (
        <p role="alert" className="text-danger">
          {update.error.message}
        </p>
      ) : null}
    </div>
  );
}

function AssignSelect({
  disabled,
  onAssign,
}: {
  disabled: boolean;
  onAssign: (assigneeUserId: string | null) => void;
}) {
  const assignees = useConversationAssignees();
  return (
    <Select
      value=""
      disabled={disabled}
      onValueChange={(value) => onAssign(value === nobody ? null : value)}
    >
      <SelectTrigger aria-label="Assign selected chats" className="w-32">
        <SelectValue placeholder="Assign" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={nobody}>Nobody</SelectItem>
        {assignees.data?.map((assignee) => (
          <SelectItem key={assignee.userId} value={assignee.userId}>
            {assignee.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LabelSelect({
  disabled,
  onLabel,
}: {
  disabled: boolean;
  onLabel: (label: string) => void;
}) {
  const labels = useConversationLabels();
  return (
    <Select value="" disabled={disabled || !labels.data?.length} onValueChange={onLabel}>
      <SelectTrigger aria-label="Label selected chats" className="w-32">
        <SelectValue placeholder="Label" />
      </SelectTrigger>
      <SelectContent>
        {labels.data?.map((label) => (
          <SelectItem key={label} value={label}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
