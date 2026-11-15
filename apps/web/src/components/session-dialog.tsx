'use client';
import { useContext } from 'react';
import { Dialog, type DialogProps } from '@dakly/ui/dialog';
import { SessionInteraction } from './session-interaction';
export function SessionDialog(props: Omit<DialogProps, 'suspended'>) {
  const blocked = useContext(SessionInteraction);
  return <Dialog {...props} suspended={blocked} />;
}
