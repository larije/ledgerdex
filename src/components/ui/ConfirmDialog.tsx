"use client";
import { AlertTriangle, Trash2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

interface ConfirmOptions {
  title: string;
  message: string;
  details?: string;
  variant?: "danger" | "warning";
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: async () => false,
});

export function useConfirm() {
  return useContext(ConfirmContext);
}

function ConfirmPanel({
  state,
  onClose,
}: {
  state: DialogState;
  onClose: (result: boolean) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(
    (result: boolean) => {
      if (exiting) return;
      setExiting(true);
      setTimeout(() => onClose(result), 260);
    },
    [exiting, onClose]
  );

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dismiss]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    panel.addEventListener("keydown", handler);
    return () => panel.removeEventListener("keydown", handler);
  }, []);

  const isDanger = state.variant === "danger";
  const isWarning = state.variant === "warning";
  const IconComp = isDanger ? Trash2 : AlertTriangle;
  const iconBg = isDanger ? "bg-red-50 dark:bg-red-900/30" : "bg-amber-50 dark:bg-amber-900/30";
  const iconColor = isDanger ? "text-red-500" : "text-amber-500";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        animation: exiting
          ? "modal-overlay-enter 260ms ease reverse forwards"
          : "modal-overlay-enter 200ms ease forwards",
      }}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => dismiss(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="relative bg-white rounded-2xl w-full max-w-[440px]"
        style={{
          boxShadow:
            "0 24px 56px -12px rgba(0,0,0,0.22), 0 8px 20px -6px rgba(0,0,0,0.10)",
          animation: exiting
            ? "modal-exit 260ms cubic-bezier(0.4,0,1,1) forwards"
            : "modal-enter 320ms cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}
      >
        <div className="px-7 pt-8 pb-7">
          <button
            onClick={() => dismiss(false)}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={14} />
          </button>

          {(isDanger || isWarning) && (
            <div
              className={`w-[60px] h-[60px] rounded-2xl ${iconBg} flex items-center justify-center mx-auto mb-5`}
            >
              <IconComp size={28} className={iconColor} />
            </div>
          )}

          <div className="text-center">
            <h2
              className="font-semibold text-gray-900 mb-2"
              style={{ fontSize: "17px" }}
            >
              {state.title}
            </h2>
            <p className="text-sm text-gray-600 mb-1">{state.message}</p>
            {state.details && (
              <p className="text-xs text-gray-400">{state.details}</p>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              ref={cancelRef}
              variant="secondary"
              className="flex-1"
              onClick={() => dismiss(false)}
            >
              {state.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={isDanger ? "danger" : "primary"}
              className="flex-1"
              onClick={() => dismiss(true)}
            >
              {state.confirmLabel ?? (isDanger ? "Delete" : "Confirm")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({ ...options, resolve });
    });
  }, []);

  const handleClose = useCallback(
    (result: boolean) => {
      if (dialogState) {
        dialogState.resolve(result);
        setDialogState(null);
      }
    },
    [dialogState]
  );

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {mounted &&
        dialogState &&
        createPortal(
          <ConfirmPanel state={dialogState} onClose={handleClose} />,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}
