import { Button } from '@dakly/ui/button';

export type LeaveRequest = { discard: () => void; keep: () => void };

type SaveBarProps = {
  canEdit: boolean;
  isDirty: boolean;
  saving: boolean;
  leave: LeaveRequest | null;
  hasConflict: boolean;
  onDiscard: () => void;
  onReload: () => void;
};

export function AgentSettingsSaveBar({
  canEdit,
  isDirty,
  saving,
  leave,
  hasConflict,
  onDiscard,
  onReload,
}: SaveBarProps) {
  return (
    <div
      role="group"
      aria-label="Save bar"
      className="sticky bottom-0 z-10 -mx-6 mt-6 -mb-6 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-6 py-3"
    >
      {!canEdit ? <p className="text-text-muted">You can view these settings.</p> : null}
      {canEdit && leave ? (
        <>
          <p role="alert" className="min-w-40 flex-1 font-medium">
            Discard your unsaved changes?
          </p>
          <Button variant="secondary" onClick={leave.keep}>
            Keep editing
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onDiscard();
              leave.discard();
            }}
          >
            Discard
          </Button>
        </>
      ) : null}
      {canEdit && !leave ? (
        <>
          <SaveStatus isDirty={isDirty} />
          {isDirty ? (
            <Button variant="secondary" disabled={saving} onClick={onDiscard}>
              Discard
            </Button>
          ) : null}
          <Button type="submit" loading={saving} disabled={!isDirty}>
            Save changes
          </Button>
        </>
      ) : null}
      {hasConflict ? (
        <Button variant="secondary" onClick={onReload}>
          Load latest settings
        </Button>
      ) : null}
    </div>
  );
}

function SaveStatus({ isDirty }: { isDirty: boolean }) {
  return (
    <p role="status" className="flex min-w-40 flex-1 items-center gap-2 text-sm">
      {isDirty ? (
        <>
          <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
          <span className="font-medium">Unsaved changes</span>
        </>
      ) : (
        <span className="text-text-muted">All changes saved</span>
      )}
    </p>
  );
}
