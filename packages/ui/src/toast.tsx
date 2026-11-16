'use client';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ShownToast = { id: number; message: string };

const ToastContext = createContext<((message: string) => void) | null>(null);

export type ToastProviderProps = { children: ReactNode };

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ShownToast[]>([]);
  const lastId = useRef(0);
  const showToast = useCallback((message: string) => {
    lastId.current += 1;
    const id = lastId.current;
    setToasts((current) => [...current, { id, message }]);
  }, []);
  const removeToast = (id: number) =>
    setToasts((current) => current.filter((toast) => toast.id !== id));
  return (
    <ToastContext value={showToast}>
      <ToastPrimitive.Provider duration={5000}>
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            onOpenChange={(isOpen) => !isOpen && removeToast(toast.id)}
            className="flex items-center justify-between gap-3 rounded-lg bg-inverse py-2 pr-2 pl-4 text-base text-on-primary shadow-overlay"
          >
            <ToastPrimitive.Title>{toast.message}</ToastPrimitive.Title>
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-primary"
            >
              <X aria-hidden="true" size={16} strokeWidth={1.75} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-50 flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext>
  );
}

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error('useToast needs a ToastProvider above it');
  return showToast;
}
