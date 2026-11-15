import { SetMetadata } from '@nestjs/common';

export const SKIP_SESSION_CONTEXT_CHECK = Symbol('SKIP_SESSION_CONTEXT_CHECK');

// Signing out must work even when the shop or access changed since the page loaded.
export const SkipSessionContextCheck = () => SetMetadata(SKIP_SESSION_CONTEXT_CHECK, true);
