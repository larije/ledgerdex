"use client";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const sizes = {
  sm:    "max-w-sm",
  md:    "max-w-md",
  lg:    "max-w-lg",
  xl:    "max-w-xl",
  "2xl": "max-w-2xl",
};

const backdropVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.18, delay: 0.04 } },
} as const;

const panelVariants = {
  hidden:  { opacity: 0, scale: 0.93, y: -12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 480, damping: 36, mass: 0.8 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 8,
    transition: { duration: 0.16, ease: "easeIn" as const },
  },
} as const;

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "w-full flex flex-col max-h-[90vh] rounded-2xl overflow-hidden",
              sizes[size]
            )}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-xl)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div
                className="flex items-center justify-between px-6 py-4 shrink-0"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--fg)" }}
                >
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg transition-all duration-150 hover:scale-110 active:scale-95"
                  style={{ color: "var(--fg-muted)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
                    (e.currentTarget as HTMLElement).style.color = "var(--fg)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--fg-muted)";
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto flex-1 p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
