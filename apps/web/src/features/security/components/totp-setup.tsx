import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import type { AccountProfile } from '@dakly/contracts/sessions';
import {
  totpSetupSchema,
  type TotpSetupInput,
  type TotpSetupResponse,
} from '@dakly/contracts/totp';
import { Button } from '@dakly/ui/button';

import { useSetupTotp } from '../api/setup-totp';
import { useTotpProof } from '../api/totp-proof';
import { securityFormError } from '../security-form-error';
import { ProofFields } from './proof-fields';
import { TotpConfirm } from './totp-confirm';

export function TotpSetup({
  profile,
  onConfirmed,
}: {
  profile: AccountProfile;
  onConfirmed: (codes: string[]) => void;
}) {
  const [setup, setSetup] = useState<TotpSetupResponse>();
  const [password, setPassword] = useState(profile.hasPassword);
  const form = useForm<TotpSetupInput>({
    resolver: zodResolver(totpSetupSchema),
    shouldUnregister: true,
  });
  const start = useSetupTotp();
  const proof = useTotpProof();
  const proofName = password ? 'currentPassword' : 'proofCode';
  if (setup) return <TotpConfirm setup={setup} onConfirmed={onConfirmed} />;
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          setSetup(await start.mutateAsync(input));
          form.reset();
        } catch (error) {
          securityFormError(error, form.setError, proofName);
        } finally {
          start.reset();
        }
      })}
    >
      <ProofFields
        password={password}
        canUsePassword={profile.hasPassword}
        onMethod={setPassword}
        field={form.register(proofName)}
        error={form.getFieldState(proofName, form.formState).error}
        sending={proof.isPending}
        sent={proof.isSuccess}
        onSend={() =>
          void proof
            .mutateAsync()
            .catch((error) => securityFormError(error, form.setError, proofName))
        }
      />
      {form.formState.errors.root ? <p role="alert">{form.formState.errors.root.message}</p> : null}
      <Button type="submit" loading={start.isPending}>
        Start authenticator setup
      </Button>
    </form>
  );
}
