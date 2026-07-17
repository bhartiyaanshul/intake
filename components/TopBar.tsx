// Dark ink top bar — app identity + one-line descriptor.

export function TopBar() {
  return (
    <header className="flex items-center justify-between bg-ink px-5 py-3 text-paper">
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-semibold tracking-tight">Intake</span>
        <span className="hidden text-sm text-paper/60 sm:inline">
          OCR, extract &amp; verify client tax documents
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-paper/50">
        <span
          className="h-1.5 w-1.5 rounded-full bg-ledger"
          aria-hidden
        />
        <span className="hidden md:inline">Browser-side OCR · nothing stored</span>
      </div>
    </header>
  );
}
