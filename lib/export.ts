import { ALL_FIELD_KEYS, labelForKey } from "./schemas";
import { parseMoney } from "./validate";
import { getSchema } from "./schemas";
import type { IntakeDoc } from "./types";

// Export confirmed (or all) documents to CSV or JSON. Money fields are exported
// as plain numbers in CSV; JSON keeps full fidelity including confidences,
// validation flags, and the edit history (original + corrected values).

function isMoneyKey(doc: IntakeDoc, key: string): boolean {
  const def = getSchema(doc.formType).find((f) => f.key === key);
  return def?.type === "money";
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCSV(docs: IntakeDoc[]): string {
  // Union of the stable schema superset plus any extra keys present on the docs
  // (e.g. UNKNOWN documents with derived keys), preserving a deterministic order.
  const extraKeys: string[] = [];
  const seen = new Set(ALL_FIELD_KEYS);
  for (const doc of docs) {
    for (const f of doc.fields) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        extraKeys.push(f.key);
      }
    }
  }
  const fieldKeys = [...ALL_FIELD_KEYS, ...extraKeys];

  const header = ["form_type", "file_name", "tax_year", ...fieldKeys];
  const rows: string[] = [header.map(csvEscape).join(",")];

  for (const doc of docs) {
    const byKey = new Map(doc.fields.map((f) => [f.key, f.value]));
    const taxYear = byKey.get("tax_year") ?? "";
    const cells: string[] = [doc.formType, doc.fileName, String(taxYear)];
    for (const key of fieldKeys) {
      const raw = byKey.get(key);
      if (raw == null || String(raw).trim() === "") {
        cells.push("");
        continue;
      }
      if (isMoneyKey(doc, key)) {
        const n = parseMoney(raw);
        cells.push(n == null ? String(raw) : String(n));
      } else {
        cells.push(String(raw));
      }
    }
    rows.push(cells.map(csvEscape).join(","));
  }
  return rows.join("\n");
}

export function toJSON(docs: IntakeDoc[]): string {
  const out = docs.map((doc) => ({
    fileName: doc.fileName,
    formType: doc.formType,
    status: doc.status,
    confirmedAt: doc.confirmedAt ?? null,
    fields: doc.fields.map((f) => ({
      key: f.key,
      label: labelForKey(doc.formType, f.key),
      value: f.value,
      originalExtractedValue: f.originalValue,
      edited: f.edited,
      confidence: f.confidence,
    })),
    validationFlags: doc.flags,
  }));
  return JSON.stringify({ exportedCount: docs.length, documents: out }, null, 2);
}

export function downloadFile(
  filename: string,
  content: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
