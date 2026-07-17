"use client";

import { useMemo, useRef, useState } from "react";
import { getSchema, labelForKey } from "@/lib/schemas";
import type {
  ExtractedField,
  FieldDef,
  IntakeDoc,
  ValidationFlag,
} from "@/lib/types";
import { FieldRow } from "./FieldRow";

// Right-hand review panel. Flagged fields sort to the top under "Needs your
// review" with a count; clean fields collapse below under "Extracted clean".
// Keyboard flow: Tab moves between fields (native), Enter advances to the next
// flagged field, and there's a visible Confirm action.

function flagsForKey(flags: ValidationFlag[], key: string): ValidationFlag[] {
  return flags.filter((f) => f.fieldKey === key);
}

interface Row {
  field: ExtractedField;
  def: FieldDef;
  flags: ValidationFlag[];
}

export function FieldPanel({
  doc,
  onEditField,
  onConfirm,
  onUnconfirm,
}: {
  doc: IntakeDoc;
  onEditField: (key: string, value: string) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
}) {
  const [showClean, setShowClean] = useState(false);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const confirmRef = useRef<HTMLButtonElement>(null);

  const { flaggedRows, cleanRows } = useMemo(() => {
    const schema = getSchema(doc.formType);
    const defByKey = new Map(schema.map((d) => [d.key, d]));

    const rows: Row[] = doc.fields.map((field) => {
      const def: FieldDef =
        defByKey.get(field.key) ??
        {
          key: field.key,
          label: labelForKey(doc.formType, field.key),
          type: "text",
        };
      return { field, def, flags: flagsForKey(doc.flags, field.key) };
    });

    // errors first, then warns, then everything else (schema order preserved
    // within each bucket since `rows` is already in schema/field order).
    const rank = (r: Row) =>
      r.flags.some((f) => f.severity === "error")
        ? 0
        : r.flags.some((f) => f.severity === "warn")
          ? 1
          : 2;

    const flagged = rows
      .filter((r) => r.flags.length > 0)
      .sort((a, b) => rank(a) - rank(b));
    const clean = rows.filter((r) => r.flags.length === 0);
    return { flaggedRows: flagged, cleanRows: clean };
  }, [doc.fields, doc.flags, doc.formType]);

  // Enter on a field advances to the next flagged field; from the last one, to
  // the Confirm button.
  const advanceFrom = (key: string) => {
    const order = flaggedRows.map((r) => r.field.key);
    const idx = order.indexOf(key);
    const nextKey = idx >= 0 ? order[idx + 1] : undefined;
    if (nextKey) {
      inputRefs.current.get(nextKey)?.focus();
    } else {
      confirmRef.current?.focus();
    }
  };

  const setRef = (key: string) => (el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(key, el);
    else inputRefs.current.delete(key);
  };

  const errorCount = doc.flags.filter((f) => f.severity === "error").length;
  const warnCount = doc.flags.filter((f) => f.severity === "warn").length;
  const confirmed = doc.status === "confirmed";
  const canConfirm = errorCount === 0 && !confirmed;

  const renderRow = (r: Row) => (
    <FieldRow
      key={r.field.key}
      ref={setRef(r.field.key)}
      field={r.field}
      label={r.def.label}
      type={r.def.type}
      required={r.def.required}
      flags={r.flags}
      onChange={(v) => onEditField(r.field.key, v)}
      onEnterAdvance={() => advanceFrom(r.field.key)}
    />
  );

  return (
    <div className="flex h-full flex-col bg-white">
      {/* header with summary */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-ink">Review fields</span>
          {doc.extractionProvider === "gemini" && (
            <span className="rounded border border-amber/30 bg-[#f6ead6] px-1.5 py-0.5 text-[10px] font-medium text-amber">
              Gemini fallback
            </span>
          )}
          {errorCount > 0 && (
            <span className="tnum text-danger">{errorCount} error{errorCount !== 1 && "s"}</span>
          )}
          {warnCount > 0 && (
            <span className="tnum text-amber">{warnCount} to verify</span>
          )}
          {errorCount === 0 && warnCount === 0 && (
            <span className="text-ledger">All checks passed</span>
          )}
        </div>
        {flaggedRows.length > 0 && (
          <span className="hidden text-[11px] text-ink/40 sm:inline">
            <kbd className="rounded border border-hairline px-1">Enter</kbd> → next flag
          </span>
        )}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        {flaggedRows.length > 0 && (
          <section>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-[#faf6f0] px-4 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber">
                Needs your review
              </span>
              <span className="tnum rounded-full bg-amber/15 px-1.5 text-[11px] text-amber">
                {flaggedRows.length}
              </span>
            </div>
            {flaggedRows.map(renderRow)}
          </section>
        )}

        <section>
          <button
            onClick={() => setShowClean((s) => !s)}
            className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-hairline bg-[#f1f3ef] px-4 py-1.5 text-left"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">
              Extracted clean
            </span>
            <span className="tnum rounded-full bg-ink/10 px-1.5 text-[11px] text-ink/50">
              {cleanRows.length}
            </span>
            <span className="ml-auto text-ink/40" aria-hidden>
              {showClean ? "▾" : "▸"}
            </span>
          </button>
          {showClean && cleanRows.map(renderRow)}
          {flaggedRows.length === 0 && !showClean && (
            <p className="px-4 py-6 text-center text-sm text-ink/45">
              Every field passed validation. Expand to review, then confirm.
            </p>
          )}
        </section>
      </div>

      {/* confirm bar */}
      <div className="border-t border-hairline px-4 py-3">
        {confirmed ? (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium text-ledger">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Confirmed
            </span>
            <button
              onClick={onUnconfirm}
              className="text-xs font-medium text-ink/50 underline-offset-2 hover:text-ink hover:underline"
            >
              Reopen for edits
            </button>
          </div>
        ) : (
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={!canConfirm}
            className="w-full rounded-md bg-ledger px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#195c3d] disabled:cursor-not-allowed disabled:bg-ink/20"
            title={
              canConfirm
                ? "Confirm this document"
                : "Resolve all red errors before confirming"
            }
          >
            {errorCount > 0
              ? `Resolve ${errorCount} error${errorCount !== 1 ? "s" : ""} to confirm`
              : warnCount > 0
                ? "Confirm document (flags reviewed)"
                : "Confirm document"}
          </button>
        )}
      </div>
    </div>
  );
}

// Failed / in-progress placeholders shown in place of the panel.
export function ExtractFailed({
  error,
  onRetry,
}: {
  error?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-8 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#f7e4e2] text-danger">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 8v5m0 3h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink">Extraction failed</p>
      <p className="mt-1 max-w-sm text-sm text-ink/60">
        {error ?? "Something went wrong reaching the extraction service."} The
        OCR text is still here — retry without re-scanning.
      </p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-md border border-ledger/40 bg-white px-4 py-2 text-sm font-medium text-ledger hover:bg-[#e2efe7]"
      >
        Retry extraction
      </button>
    </div>
  );
}

export function ExtractingSkeleton() {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-hairline px-4 py-3">
        <div className="skeleton h-4 w-32 rounded" />
      </div>
      <div className="flex-1 space-y-3 p-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="skeleton h-2.5 w-24 rounded" />
            <div className="skeleton h-6 w-full rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
