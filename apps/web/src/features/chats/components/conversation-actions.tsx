'use client';
import { Bell, Check, RotateCcw } from 'lucide-react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useUpdateConversation } from '../api/conversation-actions';
import { useConversationAssignees } from '../api/conversations';
import { useSessionContext } from '@/lib/session-context';

const nobody = 'nobody';

export function ConversationActions({ conversation }: { conversation: ConversationResponse }) {
  const update = useUpdateConversation(conversation.id);
  const { status } = conversation;
  const done = status === 'done';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AssigneePicker conversation={conversation} />
      {status === 'later' || done ? (
        <Button
          variant="secondary"
          loading={update.isPending}
          onClick={() => update.mutate({ status: 'open' })}
        >
          <RotateCcw aria-hidden="true" size={16} strokeWidth={1.75} />
          Reopen
        </Button>
      ) : (
        <Button
          variant="secondary"
          loading={update.isPending}
          onClick={() => update.mutate({ status: 'later' })}
        >
          <Bell aria-hidden="true" size={16} strokeWidth={1.75} />
          Remind me
        </Button>
      )}
      {done ? null : (
        <Button
          variant="secondary"
          loading={update.isPending}
          onClick={() => update.mutate({ status: 'done' })}
        >
          <Check aria-hidden="true" size={16} strokeWidth={1.75} />
          Done
        </Button>
      )}
      {update.error ? (
        <p role="alert" className="basis-full text-danger">
          {update.error.message}
        </p>
      ) : null}
    </div>
  );
}

function AssigneePicker({ conversation }: { conversation: ConversationResponse }) {
  const update = useUpdateConversation(conversation.id);
  const assignees = useConversationAssignees();
  const { data: session } = useSessionContext();
  const me = session?.user.id;
  return (
    <Select
      value={conversation.assigneeUserId ?? nobody}
      onValueChange={(value) => update.mutate({ assigneeUserId: value === nobody ? null : value })}
    >
      <SelectTrigger aria-label="Assigned to" className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={nobody}>Nobody</SelectItem>
        {assignees.data?.map((assignee) => (
          <SelectItem key={assignee.userId} value={assignee.userId}>
            {assignee.userId === me ? 'You' : assignee.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
