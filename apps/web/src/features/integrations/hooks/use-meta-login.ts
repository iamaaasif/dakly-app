import { useEffect, useRef, useState } from 'react';

import type { MetaAuthorizationAccounts } from '@dakly/contracts/channels';

import { useListMetaAccounts, useStartMetaLogin } from '../api/meta-login';
import { readMetaLoginMessage } from '../meta-login-message';

export type MetaLoginStep = 'intro' | 'waiting' | 'choose';

// Runs the sign-in in a separate window and returns the accounts Facebook lets the shop connect.
export function useMetaLogin() {
  const [step, setStep] = useState<MetaLoginStep>('intro');
  const [accounts, setAccounts] = useState<MetaAuthorizationAccounts | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const facebook = useRef<Window | null>(null);
  const start = useStartMetaLogin();
  const list = useListMetaAccounts();
  const { mutate: listAccounts } = list;

  // Leaving the dialog, by any route, closes the window Facebook is still showing.
  useEffect(() => () => facebook.current?.close(), []);

  useEffect(() => {
    if (step !== 'waiting') return;
    const back = (message: string) => {
      setProblem(message);
      setStep('intro');
    };
    const receive = (event: MessageEvent) => {
      const message = readMetaLoginMessage(event.data);
      if (event.origin !== window.location.origin || event.source !== facebook.current || !message)
        return;
      if ('error' in message) return back('Facebook did not finish the sign-in. Try again.');
      listAccounts(
        { state: message.state, code: message.code },
        {
          onSuccess: (result) => {
            setAccounts(result);
            setStep('choose');
          },
          onError: (error) => back(error.message),
        },
      );
    };
    // Closing the Facebook window ends the wait; nothing else tells this tab.
    const watch = window.setInterval(() => {
      if (facebook.current?.closed) back('The Facebook window was closed before you finished.');
    }, 500);
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      window.clearInterval(watch);
    };
  }, [step, listAccounts]);

  function continueWithFacebook() {
    setProblem(null);
    // The window opens inside the click so the browser does not block it; the address follows.
    const popup = window.open('about:blank', 'dakly-meta-login', 'width=600,height=700');
    if (!popup)
      return setProblem('Your browser blocked the Facebook window. Allow pop-ups and try again.');
    facebook.current = popup;
    start.mutate(undefined, {
      onSuccess: ({ authorizationUrl }) => {
        popup.location.href = authorizationUrl;
        setStep('waiting');
      },
      onError: (error) => {
        popup.close();
        setProblem(error.message);
      },
    });
  }

  return { step, accounts, problem, starting: start.isPending, continueWithFacebook };
}
