'use client';
import { Button } from '@dakly/ui/button';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="space-y-4 p-6">
      <p role="alert">Could not load this page. Try again.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
