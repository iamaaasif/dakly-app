import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

import type { CreateContentPieceInput } from '@dakly/contracts/content';
import { Button } from '@dakly/ui/button';

import { useSavePiece } from '../api/save-piece';

// The post editor opens with the saved piece, so its AI provenance carries over.
type UseInPostButtonProps = {
  piece: CreateContentPieceInput;
  savedId: string | null;
  onSaved: (id: string) => void;
};

export function UseInPostButton({ piece, savedId, onSaved }: UseInPostButtonProps) {
  const router = useRouter();
  const save = useSavePiece();
  return (
    <>
      <Button
        className="ml-auto"
        loading={save.isPending}
        disabled={!piece.body.trim()}
        onClick={() => {
          if (savedId) return router.push(`/social/posts/new?piece=${savedId}`);
          save.mutate(piece, {
            onSuccess: ({ id }) => {
              onSaved(id);
              router.push(`/social/posts/new?piece=${id}`);
            },
          });
        }}
      >
        Schedule post <ChevronRight aria-hidden="true" size={14} strokeWidth={1.75} />
      </Button>
      {save.error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {save.error.message}
        </p>
      )}
    </>
  );
}
