"use client";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (type: ToastType, title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const DURATION = 4500;

const CONFIGS: Record<
  ToastType,
  {
    icon: React.ElementType;
    borderColor: string;
    iconBg: string;
    iconColor: string;
    barColor: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    borderColor: "#10B981",
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-500",
    barColor: "bg-emerald-500",
  },
  error: {
    icon: XCircle,
    borderColor: "#EF4444",
    iconBg: "bg-red-50 dark:bg-red-900/30",
    iconColor: "text-red-500",
    barColor: "bg-red-500",
  },
  warning: {
    icon: AlertTriangle,
    borderColor: "#F59E0B",
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-500",
    barColor: "bg-amber-500",
  },
  info: {
    icon: Info,
    borderColor: "#3B82F6",
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconColor: "text-blue-500",
    barColor: "bg-blue-500",
  },
};

function ToastCard({
  item,
  onRemove,
}: {
  item: ToastItem;
  onRemove: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingRef = useRef<number>(DURATION);
  const barRef = useRef<HTMLDivElement>(null);

  const config = CONFIGS[item.type];
  const Icon = config.icon;

  const dismiss = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    setTimeout(() => onRemove(item.id), 340);
  }, [exiting, item.id, onRemove]);

  const startTimer = useCallback(
    (remaining: number) => {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(dismiss, remaining);
    },
    [dismiss]
  );

  useEffect(() => {
    startTimer(DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startTimer]);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    remainingRef.current -= Date.now() - startTimeRef.current;
    if (barRef.current) barRef.current.style.animationPlayState = "paused";
  };

  const handleMouseLeave = () => {
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, remainingRef.current);
    if (barRef.current) barRef.current.style.animationPlayState = "running";
  };

  return (
    <div
      className="w-[360px] bg-white rounded-2xl overflow-hidden border border-gray-100/80 shadow-[0_8px_32px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.06)]"
      style={{
        borderLeft: `4px solid ${config.borderColor}`,
        animation: exiting
          ? "toast-exit 340ms ease-in forwards"
          : "toast-enter 400ms cubic-bezier(0.34,1.56,0.64,1) forwards",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg}`}
        >
          <Icon size={15} className={config.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-gray-900 leading-snug"
            style={{ fontSize: "13.5px" }}
          >
            {item.title}
          </p>
          {item.description && (
            <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
          )}
        </div>
        <button
          onClick={dismiss}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
        >
          <X size={12} />
        </button>
      </div>
      <div className="h-[3px] bg-gray-100 dark:bg-slate-700">
        <div
          ref={barRef}
          className={`h-full origin-left ${config.barColor}`}
          style={{
            animation: `progress-drain ${DURATION}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (type: ToastType, title: string, description?: string) => {
      const id = Math.random().toString(36).slice(2, 9);
      setToasts((prev) => [...prev, { id, type, title, description }]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastCard item={t} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
