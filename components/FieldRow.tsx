"use client";

import { forwardRef } from "react";
import type { ExtractedField, FieldType, ValidationFlag } from "@/lib/types";

// A single ledger line. The 3px colored left rail is the signature element:
//   green  = clean
//   amber  = low confidence / warn
//   red    = failed validation
// Editing re-validates instantly and the rail color updates in place — that
// red-turns-green moment is the product.

type RailColor = "green" | "amber" | "red";

export function railColor(flags: ValidationFlag[]): RailColor {
  if (flags.some((f) => f.severity === "error")) return "red";
  if (flags.some((f) => f.severity === "warn")) return "amber";
  return "green";
}

const RAIL_CLASS: Record<RailColor, string> = {
  green: "bg-ledger",
  amber: "bg-amber",
  red: "bg-danger",
};

// Numeric-ish fields render in tabular mono; free text in sans.
const MONO_TYPES: FieldType[] = ["money", "ssn", "ein", "code", "year", "state", "percent"];

export const FieldRow = forwardRef<
  HTMLInputElement,
  {
    field: ExtractedField;
    label: string;
    type: FieldType;
    flags: ValidationFlag[];
    required?: boolean;
    onChange: (value: string) => void;
    onEnterAdvance: () => void;
  }
>(function FieldRow(
  { field, label, type, flags, required, onChange, onEnterAdvance },
  ref,
) {
  const rail = railColor(flags);
  const mono = MONO_TYPES.includes(type);
  const confPct = Math.round(field.confidence * 100);
  // First flag that can compute a correct value drives the one-click fix.
  const suggestion = flags.find((f) => f.suggestedValue)?.suggestedValue;

  return (
    <div className="relative flex gap-3 border-b border-hairline bg-white px-3 py-2.5 last:border-b-0">
      {/* flag rail */}
      <span
        className={`absolute left-0 top-0 h-full w-[3px] ${RAIL_CLASS[rail]}`}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor={`f-${field.key}`}
            className="text-[11px] font-medium uppercase tracking-wide text-ink/55"
          >
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </label>
          <div className="flex items-center gap-2">
            {field.edited && (
              <>
                <button
                  type="button"
                  onClick={() => onChange(field.originalValue)}
                  className="text-[10px] font-medium text-ink/40 underline-offset-2 hover:text-ink hover:underline"
                  title={`Revert to extracted value: ${
                    field.originalValue || "(empty)"
                  }`}
                >
                  revert
                </button>
                <span
                  className="rounded bg-[#e2efe7] px-1 py-px text-[10px] font-medium text-ledger"
                  title={`Original extracted: ${field.originalValue || "(empty)"}`}
                >
                  edited
                </span>
              </>
            )}
            {!field.edited && field.value.trim() !== "" && (
              <span
                className={`tnum text-[10px] ${
                  field.confidence < 0.8 ? "text-amber" : "text-ink/35"
                }`}
                title="Model extraction confidence"
              >
                {confPct}%
              </span>
            )}
          </div>
        </div>

        <input
          id={`f-${field.key}`}
          ref={ref}
          value={field.value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnterAdvance();
            }
          }}
          spellCheck={false}
          placeholder="—"
          className={`mt-0.5 w-full rounded border border-transparent bg-transparent px-1 py-1 text-[15px] text-ink outline-none transition focus:border-hairline focus:bg-[#fafbf9] ${
            mono ? "tnum" : "font-sans"
          }`}
        />

        {flags.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {flags.map((f, i) => (
              <li
                key={i}
                className={`flex items-start gap-1 text-[11px] leading-snug ${
                  f.severity === "error" ? "text-danger" : f.severity === "warn" ? "text-amber" : "text-ink/55"
                }`}
              >
                <span aria-hidden className="mt-px">
                  {f.severity === "error" ? "●" : "▲"}
                </span>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}

        {suggestion != null && suggestion !== field.value && (
          <button
            type="button"
            onClick={() => onChange(suggestion)}
            className="mt-1.5 inline-flex items-center gap-1 rounded border border-ledger/40 bg-[#e2efe7] px-2 py-0.5 text-[11px] font-medium text-ledger transition hover:bg-[#d3e7db]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Use computed value <span className="tnum">{suggestion}</span>
          </button>
        )}
      </div>
    </div>
  );
});
