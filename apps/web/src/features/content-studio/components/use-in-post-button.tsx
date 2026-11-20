import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';

import type { CreateContentPieceInput } from '@dakly/contracts/content';
import { Button } from '@dakly/ui/button';

import { useSavePiece } from '../api/save-piece';

// The post editor opens with the saved piece, so its AI provenance carries over.
export function UseInPostButton({ piece }: { piece: CreateContentPieceInput }) {
  const router = useRouter();
  const save = useSavePiece();
  return (
    <>
      <Button
        loading={save.isPending}
        disabled={!piece.body.trim()}
        onClick={() =>
          save.mutate(piece, {
            onSuccess: ({ id }) => router.push(`/social/posts/new?piece=${id}`),
          })
        }
      >
        <Send aria-hidden="true" size={14} strokeWidth={1.75} /> Use in post
      </Button>
      {save.error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {save.error.message}
        </p>
      )}
    </>
  );
}
