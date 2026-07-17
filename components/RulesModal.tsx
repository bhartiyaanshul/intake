"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  disabledCount,
  getDisabledRuleIds,
  resetRules,
  RULE_GROUPS,
  RULES,
  setGroupEnabled,
  setRuleEnabled,
  subscribeRules,
  type RuleGroup,
} from "@/lib/rules";
import type { Severity } from "@/lib/types";

// Validation rules panel. Lists every rule grouped by form/scope with a toggle.
// Disabling a rule suppresses its flags across every document (and re-derives
// status live). Preferences persist to localStorage — see lib/rules.ts.

const DOT: Record<Severity, string> = {
  error: "bg-danger",
  warn: "bg-amber",
  info: "bg-ink/40",
};
const SEV_LABEL: Record<Severity, string> = {
  error: "Error — blocks confirmation",
  warn: "Warning — verify",
  info: "Info",
};

function useRulesConfig() {
  // Re-render whenever the disabled-set changes.
  return useSyncExternalStore(
    subscribeRules,
    getDisabledRuleIds,
    getDisabledRuleIds,
  );
}

export function RulesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const disabled = useRulesConfig();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const disabledN = disabledCount();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-hairline bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-hairline px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ledger">
              Validation rules
            </p>
            <h1 id="rules-title" className="mt-1 text-xl font-semibold text-ink">
              Tune what gets flagged
            </h1>
            <p className="mt-1 text-xs text-ink/60">
              {RULES.length} rules ·{" "}
              {disabledN === 0 ? (
                "all active"
              ) : (
                <span className="text-amber">{disabledN} turned off</span>
              )}{" "}
              · saved to this browser
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink/45 hover:bg-[#f1f3ef] hover:text-ink"
            aria-label="Close rules panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto">
          {RULE_GROUPS.map((group) => {
            const rules = RULES.filter((r) => r.group === group.id);
            if (rules.length === 0) return null;
            const activeInGroup = rules.filter((r) => !disabled.has(r.id)).length;
            const allOn = activeInGroup === rules.length;
            return (
              <section key={group.id} className="border-b border-hairline last:border-b-0">
                <div className="flex items-center justify-between gap-2 bg-[#f1f3ef] px-5 py-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink/60">
                    {group.label}
                    <span className="ml-1.5 tnum text-ink/40">
                      {activeInGroup}/{rules.length}
                    </span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setGroupEnabled(group.id as RuleGroup, !allOn)}
                    className="text-[11px] font-medium text-ledger hover:underline"
                  >
                    {allOn ? "Turn all off" : "Turn all on"}
                  </button>
                </div>
                <ul>
                  {rules.map((rule) => {
                    const enabled = !disabled.has(rule.id);
                    return (
                      <li
                        key={rule.id}
                        className="flex items-start gap-3 border-b border-hairline px-5 py-2.5 last:border-b-0"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[rule.severity]}`}
                          title={SEV_LABEL[rule.severity]}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{rule.label}</p>
                          <p className="mt-0.5 text-xs leading-snug text-ink/60">
                            {rule.description}
                          </p>
                        </div>
                        <Toggle
                          checked={enabled}
                          onChange={(v) => setRuleEnabled(rule.id, v)}
                          label={`${enabled ? "Disable" : "Enable"} rule: ${rule.label}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-hairline bg-[#f1f3ef] px-5 py-3">
          <button
            type="button"
            onClick={resetRules}
            disabled={disabledN === 0}
            className="text-sm font-medium text-ink/60 hover:text-ink disabled:opacity-40"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-ledger px-4 py-2 text-sm font-medium text-white hover:bg-[#195c3d]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-ledger" : "bg-ink/20"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
