"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";

const DURATION_MS = 3000;

type ToastItem = { id: number; message: string };

const ToastContext = createContext<(message: string) => void>(() => {});

/** Floating confirmations ("Guardado ✓") that hide on their own. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  const show = useCallback((message: string) => {
    const id = nextId.current++;
    setItems((list) => [...list, { id, message }]);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setItems((list) => list.filter((t) => t.id !== id));
      }, DURATION_MS),
    );
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-24 z-40 flex flex-col items-center gap-2 md:bottom-6"
      >
        {items.map((t) => (
          <p key={t.id} className="toast">
            <Icon name="check" className="size-5 shrink-0" />
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns a function that shows a toast; a no-op outside a ToastProvider. */
export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}
