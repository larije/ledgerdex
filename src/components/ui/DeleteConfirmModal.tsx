"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, AlertTriangle, X, CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  items: string[];
  onConfirm: () => Promise<void>;
}

const CONFIRM_WORD = "DELETE";

export function DeleteConfirmModal({ open, onClose, items, onConfirm }: Props) {
  const [text, setText]       = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake]     = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const modalRef  = useRef<HTMLDivElement>(null);

  const confirmed = text === CONFIRM_WORD;

  useEffect(() => {
    if (open) {
      setText("");
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const handleDelete = useCallback(async () => {
    if (!confirmed || loading) return;
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setLoading(false);
    }
  }, [confirmed, loading, onConfirm, onClose]);

  const handleTryDelete = () => {
    if (loading) return;
    if (!confirmed) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    handleDelete();
  };

  // Keyboard: Escape closes, Enter submits
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
      if (e.key === "Enter") handleDelete();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, loading, onClose, handleDelete]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const el = modalRef.current;
      if (!el) return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => window.removeEventListener("keydown", trap);
  }, [open]);

  const inputCls =
    text === ""
      ? "border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
      : confirmed
      ? "border-green-400 bg-green-50/40 focus:ring-green-400/25"
      : "border-red-300 focus:ring-red-300/25";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          style={{
            background: "rgba(15,23,42,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={() => !loading && onClose()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dcm-title"
        >
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.94, y: -14 }}
            animate={{ opacity: 1, scale: 1,    y: 0   }}
            exit={{    opacity: 0, scale: 0.96,  y: 8   }}
            transition={{ type: "spring", stiffness: 440, damping: 36, mass: 0.75 }}
            className="w-full max-w-[520px] bg-white rounded-[22px] overflow-hidden"
            style={{
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="px-7 pt-7 pb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <motion.div
                  className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 flex items-center justify-center shrink-0"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                >
                  <Trash2 size={20} className="text-red-500" />
                </motion.div>
                <div>
                  <h2 id="dcm-title" className="text-xl font-bold text-gray-900 leading-tight">
                    Delete System Data
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    This action is permanent and cannot be undone.
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.12, backgroundColor: "#F3F4F6" }}
                whileTap={{ scale: 0.9 }}
                onClick={() => !loading && onClose()}
                disabled={loading}
                aria-label="Close dialog"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors shrink-0 mt-0.5"
              >
                <X size={15} />
              </motion.button>
            </div>

            <div className="h-px bg-gray-100 dark:bg-slate-700 mx-7" />

            {/* ── Danger alert ── */}
            <div className="px-7 py-5">
              <div
                className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-4"
                style={{
                  borderLeft: "3px solid #EF4444",
                  boxShadow: "inset 0 1px 4px rgba(239,68,68,0.07)",
                }}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    The following data will be permanently deleted
                  </p>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {items.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-red-600 dark:text-red-400">
                      <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── Confirmation input ── */}
            <div className="px-7 pb-6">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Confirmation Required</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    To prevent accidental deletion, type{" "}
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white border border-gray-200 font-mono text-xs font-bold text-gray-700 shadow-sm">
                      DELETE
                    </span>{" "}
                    below.
                  </p>
                </div>

                <div className="relative">
                  <motion.input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type DELETE..."
                    aria-label="Type DELETE to confirm"
                    animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
                    transition={{ duration: 0.42 }}
                    className={`w-full h-12 rounded-xl border-2 px-4 pr-11 text-sm font-medium outline-none focus:ring-2 transition-all duration-200 bg-white ${inputCls}`}
                  />
                  <AnimatePresence>
                    {confirmed && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.4 }}
                        transition={{ type: "spring", stiffness: 500, damping: 28 }}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2"
                      >
                        <CheckCircle2 size={17} className="text-green-500" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {confirmed && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="text-xs font-semibold text-green-600 flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={12} /> Confirmation verified
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-7 py-5 border-t border-gray-100 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-800/50 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400 leading-relaxed max-w-[190px]">
                All selected data will be permanently removed from the system.
              </p>
              <div className="flex items-center gap-2.5 shrink-0">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => !loading && onClose()}
                  disabled={loading}
                  className="px-4 h-9 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </motion.button>

                <motion.button
                  whileHover={confirmed && !loading ? { scale: 1.03, y: -1 } : {}}
                  whileTap={confirmed && !loading ? { scale: 0.97 } : {}}
                  onClick={handleTryDelete}
                  disabled={loading}
                  aria-label="Confirm deletion"
                  className="relative px-5 h-9 rounded-xl text-sm font-semibold text-white flex items-center gap-2 overflow-hidden transition-all duration-200 disabled:cursor-not-allowed"
                  style={{
                    background: confirmed
                      ? "linear-gradient(135deg,#EF4444 0%,#DC2626 100%)"
                      : "#FCA5A5",
                    boxShadow:
                      confirmed && !loading
                        ? "0 4px 16px rgba(239,68,68,0.35), 0 1px 4px rgba(239,68,68,0.15)"
                        : "none",
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Deleting data…
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      Delete Forever
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
