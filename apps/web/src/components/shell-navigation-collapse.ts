'use client';
import { createContext, useContext, useEffect } from 'react';

export const ShellNavigationCollapse = createContext<(collapsed: boolean) => void>(() => {});

// Screens that need the full width, such as the Inbox, show the main navigation as an icon rail.
// The person can still open it; leaving the screen opens it again.
export function useCollapsedShellNavigation() {
  const setCollapsed = useContext(ShellNavigationCollapse);
  useEffect(() => {
    setCollapsed(true);
    return () => setCollapsed(false);
  }, [setCollapsed]);
}
