'use client';
import { Check } from 'lucide-react';

import { Button } from '@dakly/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useBulkUpdateConversations } from '../api/bulk-conversations';
import { useConversationAssignees } from '../api/conversations';

const nobody = 'nobody';

type ChatBulkBarProps = { selected: string[]; onDone: () => void };

export function ChatBulkBar({ selected, onDone }: ChatBulkBarProps) {
  const update = useBulkUpdateConversations();
  const assignees = useConversationAssignees();
  const none = selected.length === 0;
  const apply = (change: Parameters<typeof update.mutate>[0]['change']) =>
    update.mutate({ ids: selected, change }, { onSuccess: ({ failed }) => !failed && onDone() });
  return (
    <div className="shrink-0 space-y-2 border-b border-border bg-surface-muted p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{selected.length} selected</p>
        <Button
          variant="secondary"
          disabled={none}
          loading={update.isPending}
          onClick={() => apply({ status: 'done' })}
        >
          <Check aria-hidden="true" size={16} strokeWidth={1.75} />
          Mark done
        </Button>
        <Select
          value=""
          disabled={none || update.isPending}
          onValueChange={(value) => apply({ assigneeUserId: value === nobody ? null : value })}
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
