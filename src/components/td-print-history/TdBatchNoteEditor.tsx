"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { MAX_BATCH_NOTE_LENGTH } from "@/lib/td-print-history";

export function TdBatchNoteEditor({ batchId, note, onSave, onCancel }: {
  batchId: string;
  note: string | null;
  onSave: (note: string | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const inputId = `batch-note-${batchId}`;

  async function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/td-print-batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the note. Try again.");
      onSave(data.batch.note);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the note. Your text is still here.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={saveNote} aria-label="Edit batch note" aria-busy={saving}
      className="mx-5 mt-3"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !savingRef.current) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <label htmlFor={inputId} className="sr-only">Batch note</label>
      <Textarea
        id={inputId} autoFocus rows={3} maxLength={MAX_BATCH_NOTE_LENGTH}
        placeholder="Write a note about this batch…" value={draft} disabled={saving}
        onChange={(event) => { setDraft(event.target.value); setError(""); }}
        aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
        aria-invalid={!!error} className="rounded-lg px-3 py-2.5 leading-relaxed"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={`${inputId}-hint`} className="text-xs text-[var(--fg-muted)]">
          {note ? "Clear the text and save to remove." : "Optional · just for this batch"}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs hover:scale-100 active:scale-100"
          >Cancel</Button>
          <Button
            type="submit" variant="secondary" size="sm" loading={saving}
            disabled={draft.trim() === (note ?? "")}
            className="rounded-lg px-3 py-1.5 text-xs shadow-none hover:scale-100 active:scale-100"
          >{saving ? "Saving…" : "Save note"}</Button>
        </div>
      </div>
      {error && <p id={`${inputId}-error`} role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
