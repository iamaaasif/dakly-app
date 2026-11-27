'use client';
import { createContext, useContext, useLayoutEffect } from 'react';

export const ShellNavigationCollapse = createContext<(collapsed: boolean) => void>(() => {});

// Screens that need the full width, such as the Inbox, show the main navigation as an icon rail.
// The person can still open it; leaving the screen opens it again.
export function useCollapsedShellNavigation() {
  const setCollapsed = useContext(ShellNavigationCollapse);
  // Before paint, so the rail never shows the open width first.
  useLayoutEffect(() => {
    setCollapsed(true);
    return () => setCollapsed(false);
  }, [setCollapsed]);
}
