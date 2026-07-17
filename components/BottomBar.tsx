"use client";

import { useState } from "react";
import type { IntakeDoc } from "@/lib/types";
import { downloadFile, toCSV, toJSON } from "@/lib/export";

// Sticky bottom bar: confirmation counts + CSV/JSON export. Export targets
// confirmed docs; if unconfirmed docs exist, "export all" requires confirmation.

export function BottomBar({ docs }: { docs: IntakeDoc[] }) {
  const [confirmOpen, setConfirmOpen] = useState<null | "csv" | "json">(null);

  const confirmed = docs.filter((d) => d.status === "confirmed");
  const total = docs.length;

  const doExport = (format: "csv" | "json", which: IntakeDoc[]) => {
    if (which.length === 0) return;
    if (format === "csv") {
      downloadFile("intake-export.csv", toCSV(which), "text/csv");
    } else {
      downloadFile(
        "intake-export.json",
        toJSON(which),
        "application/json",
      );
    }
  };

  const handleExport = (format: "csv" | "json") => {
    const unconfirmed = total - confirmed.length;
    if (confirmed.length === 0 && unconfirmed > 0) {
      // Nothing confirmed yet — go straight to the "export all?" confirmation.
      setConfirmOpen(format);
      return;
    }
    if (unconfirmed > 0) {
      setConfirmOpen(format);
      return;
    }
    doExport(format, confirmed);
  };

  return (
    <div className="relative flex items-center justify-between border-t border-hairline bg-white px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="tnum font-semibold text-ink">
          {confirmed.length}
        </span>
        <span className="text-ink/55">of</span>
        <span className="tnum text-ink/70">{total}</span>
        <span className="text-ink/55">confirmed</span>
      </div>

      <div className="flex items-center gap-2">
        <ExportButton label="Export CSV" onClick={() => handleExport("csv")} />
        <ExportButton
          label="Export JSON"
          onClick={() => handleExport("json")}
          primary
        />
      </div>

      {confirmOpen && (
        <ExportAllPopover
          format={confirmOpen}
          confirmedCount={confirmed.length}
          totalCount={total}
          onExportConfirmed={() => {
            doExport(confirmOpen, confirmed);
            setConfirmOpen(null);
          }}
          onExportAll={() => {
            doExport(confirmOpen, docs);
            setConfirmOpen(null);
          }}
          onCancel={() => setConfirmOpen(null)}
        />
      )}
    </div>
  );
}

function ExportButton({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        primary
          ? "bg-ledger text-white hover:bg-[#195c3d]"
          : "border border-hairline bg-white text-ink/80 hover:border-ledger/50 hover:text-ledger"
      }`}
    >
      {label}
    </button>
  );
}

function ExportAllPopover({
  format,
  confirmedCount,
  totalCount,
  onExportConfirmed,
  onExportAll,
  onCancel,
}: {
  format: "csv" | "json";
  confirmedCount: number;
  totalCount: number;
  onExportConfirmed: () => void;
  onExportAll: () => void;
  onCancel: () => void;
}) {
  const unconfirmed = totalCount - confirmedCount;
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onCancel} aria-hidden />
      <div className="absolute bottom-full right-4 z-30 mb-2 w-80 rounded-lg border border-hairline bg-white p-4 shadow-lg">
        <p className="text-sm font-semibold text-ink">
          Export {format.toUpperCase()}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink/60">
          {confirmedCount > 0
            ? `${confirmedCount} confirmed document${
                confirmedCount !== 1 ? "s" : ""
              } ready. ${unconfirmed} document${
                unconfirmed !== 1 ? "s are" : " is"
              } still unconfirmed.`
            : `No documents are confirmed yet. ${unconfirmed} document${
                unconfirmed !== 1 ? "s" : ""
              } would export unverified.`}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {confirmedCount > 0 && (
            <button
              onClick={onExportConfirmed}
              className="rounded-md bg-ledger px-3 py-1.5 text-sm font-medium text-white hover:bg-[#195c3d]"
            >
              Export {confirmedCount} confirmed
            </button>
          )}
          <button
            onClick={onExportAll}
            className="rounded-md border border-amber/40 bg-[#f6ead6] px-3 py-1.5 text-sm font-medium text-amber hover:bg-[#f0dfc2]"
          >
            Export all {totalCount} (incl. unconfirmed)
          </button>
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-ink/55 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
