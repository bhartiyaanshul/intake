// Dark ink top bar — app identity + descriptor + validation-rules entry point.

export function TopBar({ onOpenRules }: { onOpenRules?: () => void }) {
  return (
    <header className="flex items-center justify-between bg-ink px-5 py-3 text-paper">
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-semibold tracking-tight">Intake</span>
        <span className="hidden text-sm text-paper/60 sm:inline">
          OCR, extract &amp; verify client tax documents
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 text-[11px] text-paper/50 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-ledger" aria-hidden />
          Browser-side OCR · nothing stored
        </span>
        {onOpenRules && (
          <button
            type="button"
            onClick={onOpenRules}
            className="flex items-center gap-1.5 rounded-md border border-paper/20 px-2.5 py-1 text-xs font-medium text-paper/80 transition-colors hover:border-paper/40 hover:text-paper"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M10.3 3.2a1 1 0 0 1 3.4 0l.2.9a7 7 0 0 1 1.6.9l.9-.3a1 1 0 0 1 1.2.5l1 1.7a1 1 0 0 1-.2 1.3l-.7.6a7 7 0 0 1 0 1.8l.7.6a1 1 0 0 1 .2 1.3l-1 1.7a1 1 0 0 1-1.2.5l-.9-.3a7 7 0 0 1-1.6.9l-.2.9a1 1 0 0 1-3.4 0l-.2-.9a7 7 0 0 1-1.6-.9l-.9.3a1 1 0 0 1-1.2-.5l-1-1.7a1 1 0 0 1 .2-1.3l.7-.6a7 7 0 0 1 0-1.8l-.7-.6a1 1 0 0 1-.2-1.3l1-1.7a1 1 0 0 1 1.2-.5l.9.3a7 7 0 0 1 1.6-.9l.2-.9Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Validation rules
          </button>
        )}
      </div>
    </header>
  );
}
