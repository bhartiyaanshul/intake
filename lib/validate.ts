import { getSchema } from "./schemas";
import {
  einPrefixIssue,
  parseBox12Codes,
  ssnStructuralIssue,
  US_STATE_CODES,
  W2_BOX12_CODES,
} from "./reference";
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

/** Format a number the way these forms print money: 1234.5 -> "1,234.50". */
export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

// External reference checks: the field is well-formed but we test it against
// authoritative reference data (SSA structure, IRS EIN prefixes, W-2 Box 12
// codes, USPS state codes). These are plausibility checks, so they warn rather
// than hard-error — a warn surfaces the field for verification without blocking.
function referenceRules(
  fields: ExtractedField[],
  schema: FieldDef[],
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const byKey = new Map(schema.map((d) => [d.key, d]));
  for (const f of fields) {
    const def = byKey.get(f.key);
    if (!def) continue;
    const v = String(f.value ?? "").trim();
    if (v === "") continue;

    if (def.type === "ssn") {
      const digits = digitsOnly(v);
      const issue = ssnStructuralIssue(digits);
      if (issue) {
        flags.push({
          fieldKey: f.key,
          severity: "warn",
          message: `SSN structure is not one the SSA issues (${issue}) — verify it wasn't misread.`,
        });
      }
    }

    if (def.type === "ein") {
      const digits = digitsOnly(v);
      const badPrefix = einPrefixIssue(digits);
      if (badPrefix) {
        flags.push({
          fieldKey: f.key,
          severity: "warn",
          message: `EIN prefix "${badPrefix}" is not an IRS-assigned prefix — verify it wasn't misread.`,
        });
      }
    }

    if (def.type === "state") {
      if (!US_STATE_CODES.has(v.toUpperCase())) {
        flags.push({
          fieldKey: f.key,
          severity: "warn",
          message: `"${v}" is not a valid US state/territory code.`,
        });
      }
    }
  }

  // W-2 Box 12: every code letter must be in the IRS code set.
  const box12 = fields.find((f) => f.key === "box12");
  if (box12 && String(box12.value ?? "").trim() !== "") {
    const codes = parseBox12Codes(String(box12.value));
    const bad = codes.filter((c) => !W2_BOX12_CODES.has(c));
    if (bad.length > 0) {
      flags.push({
        fieldKey: "box12",
        severity: "warn",
        message: `Box 12 code(s) not recognized: ${bad.join(", ")}. Valid codes are A–HH (no I, O, U, X).`,
      });
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
    // DECISION: an edited field is a preparer-confirmed value — trust it over
    // the model's original confidence. Only flag low confidence on un-edited
    // fields, so correcting a value clears its amber "verify" rail.
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
  const box7 = parseMoney(vals["box7_ss_tips"]);
  const box16 = parseMoney(vals["box16_state_wages"]);
  const box17 = parseMoney(vals["box17_state_tax"]);
  const box18 = parseMoney(vals["box18_local_wages"]);
  const box19 = parseMoney(vals["box19_local_tax"]);
  const year = parsedTaxYear(vals);

  // Box 4 ≈ 6.2% of Box 3 (+ SS tips, which are also SS-taxable).
  if (box3 != null && box4 != null && box3 > 0) {
    const ssBase = box3 + (box7 ?? 0);
    const expected = ssBase * SS_RATE;
    if (!withinTolerance(box4, expected)) {
      flags.push({
        fieldKey: "box4_ss_tax",
        severity: "error",
        message: `Box 4 should be ~6.2% of Box 3${
          box7 ? " + Box 7 tips" : ""
        } (~$${formatMoney(expected)}). Got $${formatMoney(box4)}.`,
        suggestedValue: formatMoney(expected),
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
          message: `Box 6 should be ~1.45% of Box 5 (~$${formatMoney(
            expected,
          )}). Got $${formatMoney(box6)}.`,
          suggestedValue: formatMoney(expected),
        });
      }
    }
  }

  // Box 5 (Medicare wages) should be ≥ Box 3 (SS wages): Medicare has no wage
  // cap, so it equals SS wages below the base and exceeds it above.
  if (box3 != null && box5 != null && box5 + 0.01 < box3) {
    flags.push({
      fieldKey: "box5_medicare_wages",
      severity: "warn",
      message:
        "Box 5 (Medicare wages) is less than Box 3 (SS wages) — Medicare wages are uncapped and normally ≥ SS wages. Verify.",
    });
  }

  // Box 3 + Box 7 (SS wages + SS tips) must not exceed the SS wage base — the
  // two are capped together at the base for the year.
  if (box3 != null) {
    const ssTotal = box3 + (box7 ?? 0);
    const label = box7 ? "Box 3 + Box 7 (SS wages + tips)" : "Box 3";
    if (year != null && SS_WAGE_BASE[year] != null) {
      if (ssTotal > SS_WAGE_BASE[year] + 0.01) {
        flags.push({
          fieldKey: "box3_ss_wages",
          severity: "error",
          message: `${label} exceeds the ${year} Social Security wage base of $${SS_WAGE_BASE[
            year
          ].toLocaleString()}.`,
        });
      }
    } else {
      // Year unknown — warn against the most recent known base.
      const latest = Math.max(...Object.values(SS_WAGE_BASE));
      if (ssTotal > latest) {
        flags.push({
          fieldKey: "box3_ss_wages",
          severity: "warn",
          message: `${label} exceeds the highest known SS wage base ($${latest.toLocaleString()}) — tax year unknown, verify.`,
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

  // State income tax (Box 17) shouldn't meet or exceed state wages (Box 16).
  if (box16 != null && box17 != null && box16 > 0 && box17 >= box16) {
    flags.push({
      fieldKey: "box17_state_tax",
      severity: "warn",
      message: "Box 17 (state tax) is ≥ Box 16 (state wages) — unusual, verify.",
    });
  }

  // Local income tax (Box 19) shouldn't meet or exceed local wages (Box 18).
  if (box18 != null && box19 != null && box18 > 0 && box19 >= box18) {
    flags.push({
      fieldKey: "box19_local_tax",
      severity: "warn",
      message: "Box 19 (local tax) is ≥ Box 18 (local wages) — unusual, verify.",
    });
  }

  return flags;
}

// 1099-DIV: qualified dividends (Box 1b) are a subset of ordinary dividends
// (Box 1a), so 1b can never exceed 1a.
function form1099DivRules(fields: ExtractedField[]): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  const vals = valueMap(fields);
  const box1a = parseMoney(vals["box1a_ordinary_div"]);
  const box1b = parseMoney(vals["box1b_qualified_div"]);
  if (box1a != null && box1b != null && box1b > box1a + 0.01) {
    flags.push({
      fieldKey: "box1b_qualified_div",
      severity: "error",
      message:
        "Box 1b (qualified dividends) cannot exceed Box 1a (total ordinary dividends) — qualified is a subset of ordinary.",
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
    flags.push(...referenceRules(fields, schema));
    flags.push(...requiredRules(fields, schema));
  }
  flags.push(...confidenceRules(fields));

  if (formType === "W-2") flags.push(...w2ArithmeticRules(fields));
  if (formType === "1099-R") flags.push(...form1099RRules(fields));
  if (formType === "1099-DIV") flags.push(...form1099DivRules(fields));
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
