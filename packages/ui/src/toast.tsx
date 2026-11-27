'use client';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export type ToastAction = { label: string; onClick: () => void };
type ShownToast = { id: number; message: string; action?: ToastAction };

const ToastContext = createContext<((message: string, action?: ToastAction) => void) | null>(
  null,
);

export type ToastProviderProps = { children: ReactNode };

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ShownToast[]>([]);
  const lastId = useRef(0);
  const showToast = useCallback((message: string, action?: ToastAction) => {
    lastId.current += 1;
    const id = lastId.current;
    setToasts((current) => [...current, { id, message, action }]);
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
            className="motion-toast flex items-center justify-between gap-3 rounded-lg bg-inverse py-2 pr-2 pl-4 text-base text-on-primary shadow-overlay"
          >
            <ToastPrimitive.Title>{toast.message}</ToastPrimitive.Title>
            {toast.action ? (
              <ToastPrimitive.Action
                altText={toast.action.label}
                onClick={toast.action.onClick}
                className="ml-auto min-h-10 rounded-md px-3 text-base font-semibold text-on-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-primary"
              >
                {toast.action.label}
              </ToastPrimitive.Action>
            ) : null}
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
