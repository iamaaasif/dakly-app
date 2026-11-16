import { useState } from 'react';

export function OrderNote({ editable }: { editable: boolean }) {
  if (!editable) return null;
  const [note] = useState('');
  return <p>{note}</p>;
}
