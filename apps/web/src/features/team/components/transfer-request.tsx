import { useState } from 'react';
import type { MemberResponse } from '@dakly/contracts/team';
import { TransferRecipient } from './transfer-recipient';
import { TransferCodeForm } from './transfer-code-form';
export function TransferRequest({ cursor }: { cursor?: string }) {
  const [recipient, setRecipient] = useState<MemberResponse>();
  return recipient ? (
    <TransferCodeForm member={recipient} onBack={() => setRecipient(undefined)} />
  ) : (
    <TransferRecipient key={cursor ?? 'first'} cursor={cursor} onSent={setRecipient} />
  );
}
