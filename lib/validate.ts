import { getSchema } from "./schemas";
import type {
  ExtractedField,
  FieldDef,
  FormType,
  ValidationFlag,
} from "./types";

// ---------------------------------------------------------------------------
// Pure, deterministic validation engine. Re-run live on every client-side edit.
// Every rule returns a ValidationFlag { fieldKey, severity, message }.
// No I/O, no dates, no randomness — fully unit-testable.
// ---------------------------------------------------------------------------

// Social Security wage base by tax year. Box 3 (SS wages) cannot exceed this.
const SS_WAGE_BASE: Record<number, number> = {
  2023: 160200,
  2024: 168600,
  2025: 176100,
};
const SS_RATE = 0.062; // 6.2%
const MEDICARE_RATE = 0.0145; // 1.45%
const ADDL_MEDICARE_THRESHOLD = 200000; // 0.9% Additional Medicare over this
const CONFIDENCE_THRESHOLD = 0.8;

// ---- value parsing helpers -------------------------------------------------

/** Strip $, commas, spaces and parse to a number. Returns null if unparseable. */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s]/g, "").replace(/[()]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Normalize digits only. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

const SSN_RE = /^\d{3}-\d{2}-\d{4}$/;
const EIN_RE = /^\d{2}-\d{7}$/;

export function isValidSSN(raw: string): boolean {
  const t = raw.trim();
  if (SSN_RE.test(t)) return true;
  return digitsOnly(t).length === 9 && !t.includes("-"); // 9 bare digits
}

export function isValidEIN(raw: string): boolean {
  const t = raw.trim();
  if (EIN_RE.test(t)) return true;
  return digitsOnly(t).length === 9 && !t.includes("-"); // 9 bare digits
}

// Valid IRS 1099-R Box 7 distribution codes (single chars + valid two-char combos).
const VALID_1099R_SINGLE = new Set([
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "A", "B", "D", "E", "F", "G", "H", "J", "K", "L",
  "M", "N", "P", "Q", "R", "S", "T", "U", "W",
]);

function isValidDistributionCode(raw: string): boolean {
  const code = raw.trim().toUpperCase();
  if (code === "") return false;
  // Accept comma/space separated combos, or two-char combos like "7D", "1B".
  const parts = code.split(/[\s,]+/).filter(Boolean);
  for (const part of parts) {
    if (part.length === 1) {
      if (!VALID_1099R_SINGLE.has(part)) return false;
    } else if (part.length === 2) {
      if (!VALID_1099R_SINGLE.has(part[0]) || !VALID_1099R_SINGLE.has(part[1]))
        return false;
    } else {
      return false;
    }
  }
  return true;
}

/** Tolerance for arithmetic checks: greater of ±$2 or ±1% of the expected value. */
function withinTolerance(actual: number, expected: number): boolean {
  const tol = Math.max(2, Math.abs(expected) * 0.01);
  return Math.abs(actual - expected) <= tol;
}

// Build a quick key -> value map for present, non-empty fields.
function valueMap(fields: ExtractedField[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of fields) {
    if (f.value != null && String(f.value).trim() !== "") m[f.key] = f.value;
  }
  return m;
}

function parsedTaxYear(vals: Record<string, string>): number | null {
  const raw = vals["tax_year"];
  if (!raw) return null;
  const n = parseInt(digitsOnly(raw).slice(0, 4), 10);
  return Number.isFinite(n) ? n : null;
}

// ---- rule groups -----------------------------------------------------------

function formatRules(
  fields: ExtractedField[],
  schema: FieldDef[],
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const byKey = new Map(schema.map((d) => [d.key, d]));
  for (const f of fields) {
    const def = byKey.get(f.key);
    if (!def) continue;
    const v = String(f.value ?? "").trim();
    if (v === "") continue; // emptiness handled by required-field rule
    switch (def.type) {
      case "ssn":
        if (!isValidSSN(v))
          flags.push({
            fieldKey: f.key,
            severity: "error",
            message: "Not a valid SSN — expected XXX-XX-XXXX or 9 digits.",
          });
        break;
      case "ein":
        if (!isValidEIN(v))
          flags.push({
            fieldKey: f.key,
            severity: "error",
            message: "Not a valid EIN/TIN — expected XX-XXXXXXX or 9 digits.",
          });
        break;
      case "money":
        if (parseMoney(v) === null)
          flags.push({
            fieldKey: f.key,
            severity: "error",
            message: "Amount doesn't parse as a number.",
          });
        break;
      case "year": {
        const y = parseInt(digitsOnly(v).slice(0, 4), 10);
        if (!Number.isFinite(y) || y < 1990 || y > 2100)
          flags.push({
            fieldKey: f.key,
            severity: "warn",
            message: "Tax year looks off — confirm against the document.",
          });
        break;
      }
    }
  }
  return flags;
}

function requiredRules(
  fields: ExtractedField[],
  schema: FieldDef[],
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const vals = valueMap(fields);
  for (const def of schema) {
    if (def.required && !vals[def.key]) {
      flags.push({
        fieldKey: def.key,
        severity: "error",
        message: `Required field is missing — ${def.label} must be present.`,
      });
    }
  }
  return flags;
}

function confidenceRules(fields: ExtractedField[]): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  for (const f of fields) {
    // An edited field is a preparer-confirmed value — trust it over the model's
    // original confidence. Only flag low confidence on un-edited fields.
    if (f.edited) continue;
    const v = String(f.value ?? "").trim();
    if (v === "") continue;
    if (f.confidence < CONFIDENCE_THRESHOLD) {
      flags.push({
        fieldKey: f.key,
        severity: "warn",
        message: `Low extraction confidence (${Math.round(
          f.confidence * 100,
        )}%) — verify against document.`,
      });
    }
  }
  return flags;
}

function w2ArithmeticRules(fields: ExtractedField[]): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const vals = valueMap(fields);

  const box1 = parseMoney(vals["box1_wages"]);
  const box2 = parseMoney(vals["box2_fed_withholding"]);
  const box3 = parseMoney(vals["box3_ss_wages"]);
  const box4 = parseMoney(vals["box4_ss_tax"]);
  const box5 = parseMoney(vals["box5_medicare_wages"]);
  const box6 = parseMoney(vals["box6_medicare_tax"]);
  const box16 = parseMoney(vals["box16_state_wages"]);
  const year = parsedTaxYear(vals);

  // Box 4 ≈ 6.2% of Box 3
  if (box3 != null && box4 != null && box3 > 0) {
    const expected = box3 * SS_RATE;
    if (!withinTolerance(box4, expected)) {
      flags.push({
        fieldKey: "box4_ss_tax",
        severity: "error",
        message: `Box 4 should be ~6.2% of Box 3 (~$${expected.toFixed(
          2,
        )}). Got $${box4.toFixed(2)}.`,
      });
    }
  }

  // Box 6 ≈ 1.45% of Box 5 (downgrade to warn above the Additional Medicare threshold)
  if (box5 != null && box6 != null && box5 > 0) {
    const expected = box5 * MEDICARE_RATE;
    if (!withinTolerance(box6, expected)) {
      const overThreshold = box5 > ADDL_MEDICARE_THRESHOLD;
      const excess = box6 > expected;
      if (overThreshold && excess) {
        flags.push({
          fieldKey: "box6_medicare_tax",
          severity: "warn",
          message:
            "Box 6 exceeds 1.45% of Box 5 — may include the 0.9% Additional Medicare Tax on wages over $200k. Verify.",
        });
      } else {
        flags.push({
          fieldKey: "box6_medicare_tax",
          severity: "error",
          message: `Box 6 should be ~1.45% of Box 5 (~$${expected.toFixed(
            2,
          )}). Got $${box6.toFixed(2)}.`,
        });
      }
    }
  }

  // Box 3 must not exceed the Social Security wage base for the year.
  if (box3 != null) {
    if (year != null && SS_WAGE_BASE[year] != null) {
      if (box3 > SS_WAGE_BASE[year]) {
        flags.push({
          fieldKey: "box3_ss_wages",
          severity: "error",
          message: `Box 3 exceeds the ${year} Social Security wage base of $${SS_WAGE_BASE[
            year
          ].toLocaleString()}.`,
        });
      }
    } else {
      // Year unknown — warn against the most recent known base.
      const latest = Math.max(...Object.values(SS_WAGE_BASE));
      if (box3 > latest) {
        flags.push({
          fieldKey: "box3_ss_wages",
          severity: "warn",
          message: `Box 3 exceeds the highest known SS wage base ($${latest.toLocaleString()}) — tax year unknown, verify.`,
        });
      }
    }
  }

  // Box 2 should be less than Box 1.
  if (box1 != null && box2 != null && box2 >= box1 && box1 > 0) {
    flags.push({
      fieldKey: "box2_fed_withholding",
      severity: "warn",
      message: "Box 2 (withholding) is ≥ Box 1 (wages) — unusual, verify.",
    });
  }

  // Box 16 ≤ Box 1 (+ tolerance) — warn only; multi-state W-2s legitimately differ.
  if (box1 != null && box16 != null && box16 > box1 * 1.01 + 2) {
    flags.push({
      fieldKey: "box16_state_wages",
      severity: "warn",
      message:
        "Box 16 (state wages) exceeds Box 1 (federal wages) — can be legitimate on multi-state W-2s, verify.",
    });
  }

  return flags;
}

function form1099RRules(fields: ExtractedField[]): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const vals = valueMap(fields);
  const box1 = parseMoney(vals["box1_gross_distribution"]);
  const box2a = parseMoney(vals["box2a_taxable_amount"]);
  const code = vals["box7_distribution_code"];

  if (box1 != null && box2a != null && box2a > box1 + 0.01) {
    flags.push({
      fieldKey: "box2a_taxable_amount",
      severity: "error",
      message: "Box 2a (taxable amount) cannot exceed Box 1 (gross distribution).",
    });
  }

  if (code && !isValidDistributionCode(code)) {
    flags.push({
      fieldKey: "box7_distribution_code",
      severity: "error",
      message: `"${code}" is not a valid IRS distribution code.`,
    });
  }

  return flags;
}

// All 1099s: federal withholding should be < 50% of the largest income box (warn).
const INCOME_BOXES_1099: Record<string, string[]> = {
  "1099-NEC": ["box1_nonemployee_comp"],
  "1099-INT": ["box1_interest", "box3_treasury_interest", "box8_tax_exempt"],
  "1099-DIV": ["box1a_ordinary_div", "box2a_capital_gain"],
  "1099-R": ["box1_gross_distribution"],
  "1099-MISC": ["box1_rents", "box2_royalties", "box3_other_income"],
};

function withholdingRule(
  formType: FormType,
  fields: ExtractedField[],
): ValidationFlag[] {
  const incomeKeys = INCOME_BOXES_1099[formType];
  if (!incomeKeys) return [];
  const vals = valueMap(fields);
  const withholding = parseMoney(vals["box4_fed_withholding"]);
  if (withholding == null || withholding <= 0) return [];
  const incomes = incomeKeys
    .map((k) => parseMoney(vals[k]))
    .filter((n): n is number => n != null);
  if (incomes.length === 0) return [];
  const largest = Math.max(...incomes);
  if (largest > 0 && withholding > largest * 0.5) {
    return [
      {
        fieldKey: "box4_fed_withholding",
        severity: "warn",
        message:
          "Federal withholding is over 50% of the largest income box — unusual, verify.",
      },
    ];
  }
  return [];
}

// ---- entry point -----------------------------------------------------------

/**
 * Run every applicable rule for a document and return a de-duplicated flag list.
 * Pure: same inputs always produce the same flags.
 */
export function validateDocument(
  formType: FormType,
  fields: ExtractedField[],
): ValidationFlag[] {
  const schema = getSchema(formType);
  const flags: ValidationFlag[] = [];

  if (formType !== "UNKNOWN") {
    flags.push(...formatRules(fields, schema));
    flags.push(...requiredRules(fields, schema));
  }
  flags.push(...confidenceRules(fields));

  if (formType === "W-2") flags.push(...w2ArithmeticRules(fields));
  if (formType === "1099-R") flags.push(...form1099RRules(fields));
  flags.push(...withholdingRule(formType, fields));

  // De-dupe identical (fieldKey, severity, message) triples.
  const seen = new Set<string>();
  const deduped: ValidationFlag[] = [];
  for (const f of flags) {
    const k = `${f.fieldKey}|${f.severity}|${f.message}`;
    if (!seen.has(k)) {
      seen.add(k);
      deduped.push(f);
    }
  }
  return deduped;
}

/** Derive document status from its flags (does not account for confirmation). */
export function statusFromFlags(
  flags: ValidationFlag[],
): "needs_review" | "verify_flagged" | "clean" {
  if (flags.some((f) => f.severity === "error")) return "needs_review";
  if (flags.some((f) => f.severity === "warn")) return "verify_flagged";
  return "clean";
}
