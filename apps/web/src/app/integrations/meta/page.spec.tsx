// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import MetaLoginReturnPage from './page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('hands the Facebook result to the opener once even when effects run twice', () => {
  const postMessage = vi.fn();
  vi.stubGlobal('opener', { postMessage });
  vi.spyOn(window, 'close').mockImplementation(() => undefined);
  window.history.replaceState(null, '', '/integrations/meta?state=s1&code=c1');

  render(
    <StrictMode>
      <MetaLoginReturnPage />
    </StrictMode>,
  );

  expect(postMessage).toHaveBeenCalledTimes(1);
  expect(postMessage).toHaveBeenCalledWith(
    { type: 'dakly-meta-login', state: 's1', code: 'c1' },
    window.location.origin,
  );
});
