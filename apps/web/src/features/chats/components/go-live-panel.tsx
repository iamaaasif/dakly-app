import { Check, Circle } from 'lucide-react';

import { MIN_TEST_QUESTIONS } from '@dakly/contracts/ai-practice';
import type { ChannelConnection } from '@dakly/contracts/channels';
import { ApiError } from '@dakly/ui/api-client';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { useToast } from '@dakly/ui/toast';

import { useAgentSettings } from '../api/agent-settings';
import { useChatChannels, useGoLive } from '../api/chat-channels';
import { useTestQuestions } from '../api/test-questions';
import { channelNames, GoLiveChannels } from './go-live-channels';
import { GoLiveStatus } from './go-live-status';
import { TestQuestionsEditor } from './test-questions-editor';

function failedPositions(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== 'GO_LIVE_TESTS_FAILED') return [];
  return (error.fields ?? []).map((field) => Number(field.path.split('.').at(-1)));
}

function ReadinessChecks({ checks }: { checks: [string, boolean][] }) {
  return (
    <ul className="space-y-1">
      {checks.map(([label, done]) => (
        <li key={label} className="flex items-center gap-2 text-base">
          {done ? (
            <Check aria-hidden="true" size={16} className="text-success" />
          ) : (
            <Circle aria-hidden="true" size={16} className="text-text-muted" />
          )}
          {label}
          <span className="sr-only">{done ? ' done' : ' not done yet'}</span>
        </li>
      ))}
    </ul>
  );
}

export function GoLivePanel({ canEdit }: { canEdit: boolean }) {
  const channels = useChatChannels();
  const questions = useTestQuestions();
  const settings = useAgentSettings();
  const goLive = useGoLive();
  const showToast = useToast();
  if (channels.isPending || questions.isPending) return <Skeleton className="mt-8 h-48 w-full" />;
  if (channels.isError || questions.isError)
    return <QueryError message="Could not load Go live." onRetry={() => void channels.refetch()} />;
  const checks: [string, boolean][] = [
    ['Hand-over rules saved', settings.data?.handoverRulesSaved === true],
    [
      `${MIN_TEST_QUESTIONS} test questions saved`,
      questions.data.questions.length >= MIN_TEST_QUESTIONS,
    ],
  ];
  const start = (channel: ChannelConnection) =>
    goLive.mutate(channel.id, {
      onSuccess: () => showToast(`${channelNames[channel.kind]} is live.`),
    });
  return (
    <section aria-labelledby="go-live-title" className="mt-8 space-y-4 border-t border-border pt-6">
      <div>
        <h3 id="go-live-title" className="text-md font-semibold">
          Go live
        </h3>
        <p className="text-sm text-text-muted">
          Until a channel is live, Dakly answers only the Test tab and the testers you pick.
        </p>
      </div>
      <ReadinessChecks checks={checks} />
      <TestQuestionsEditor
        // Keyed by content so a save resets the rows to what was stored.
        key={JSON.stringify(questions.data.questions)}
        saved={questions.data.questions}
        failed={failedPositions(goLive.error)}
        canEdit={canEdit}
      />
      <GoLiveChannels
        channels={channels.data.items.filter((item) => item.status !== 'disconnected')}
        runningId={goLive.isPending ? goLive.variables : undefined}
        canEdit={canEdit}
        onGoLive={start}
      />
      <GoLiveStatus
        pending={goLive.isPending}
        error={goLive.error}
        onCheckAgain={() => void channels.refetch()}
      />
    </section>
  );
}
