import type { FieldDef, FormType } from "./types";

// Field definitions per supported form type. These drive both the extraction
// prompt (we tell the model exactly which keys to fill) and the review UI (the
// order + labels + input formatting of the field panel).
//
// DECISION: keys are stable, machine-friendly identifiers (e.g. `box1_wages`)
// that never change, while `label` is the human-facing text. This keeps the CSV
// export columns stable across form types and makes the validation engine
// reference fields by key, not by display string.

export const SCHEMAS: Record<Exclude<FormType, "UNKNOWN">, FieldDef[]> = {
  "W-2": [
    { key: "employee_ssn", label: "Employee SSN (Box a)", type: "ssn", required: true },
    { key: "employer_ein", label: "Employer EIN (Box b)", type: "ein", required: true },
    { key: "employer_name", label: "Employer name (Box c)", type: "text", required: true },
    { key: "employer_address", label: "Employer address (Box c)", type: "text" },
    { key: "employee_name", label: "Employee name (Box e)", type: "text", required: true },
    { key: "employee_address", label: "Employee address (Box f)", type: "text" },
    { key: "box1_wages", label: "Box 1 — Wages, tips, other comp.", type: "money", required: true },
    { key: "box2_fed_withholding", label: "Box 2 — Federal income tax withheld", type: "money" },
    { key: "box3_ss_wages", label: "Box 3 — Social Security wages", type: "money" },
    { key: "box4_ss_tax", label: "Box 4 — Social Security tax withheld", type: "money" },
    { key: "box5_medicare_wages", label: "Box 5 — Medicare wages and tips", type: "money" },
    { key: "box6_medicare_tax", label: "Box 6 — Medicare tax withheld", type: "money" },
    { key: "box7_ss_tips", label: "Box 7 — Social Security tips", type: "money" },
    { key: "box12", label: "Box 12 — Codes & amounts", type: "text" },
    { key: "box13", label: "Box 13 — Checkboxes", type: "text" },
    { key: "box15_state", label: "Box 15 — State", type: "state" },
    { key: "box15_state_id", label: "Box 15 — Employer state ID no.", type: "text" },
    { key: "box16_state_wages", label: "Box 16 — State wages, tips, etc.", type: "money" },
    { key: "box17_state_tax", label: "Box 17 — State income tax", type: "money" },
    { key: "box18_local_wages", label: "Box 18 — Local wages, tips, etc.", type: "money" },
    { key: "box19_local_tax", label: "Box 19 — Local income tax", type: "money" },
    { key: "box20_locality", label: "Box 20 — Locality name", type: "text" },
    { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "1099-NEC": [
    { key: "payer_name", label: "Payer name", type: "text", required: true },
    { key: "payer_tin", label: "Payer TIN", type: "ein", required: true },
    { key: "recipient_name", label: "Recipient name", type: "text", required: true },
    { key: "recipient_tin", label: "Recipient TIN", type: "ssn", required: true },
    { key: "box1_nonemployee_comp", label: "Box 1 — Nonemployee compensation", type: "money", required: true },
    { key: "box4_fed_withholding", label: "Box 4 — Federal income tax withheld", type: "money" },
    { key: "box5_state_tax", label: "Box 5 — State tax withheld", type: "money" },
    { key: "box6_state_id", label: "Box 6 — State / Payer's state no.", type: "text" },
    { key: "box7_state_income", label: "Box 7 — State income", type: "money" },
    { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "1099-INT": [
    { key: "payer_name", label: "Payer name", type: "text", required: true },
    { key: "payer_tin", label: "Payer TIN", type: "ein", required: true },
    { key: "recipient_name", label: "Recipient name", type: "text", required: true },
    { key: "recipient_tin", label: "Recipient TIN", type: "ssn", required: true },
    { key: "box1_interest", label: "Box 1 — Interest income", type: "money", required: true },
    { key: "box2_early_withdrawal", label: "Box 2 — Early withdrawal penalty", type: "money" },
    { key: "box3_treasury_interest", label: "Box 3 — Interest on US savings bonds / Treasury", type: "money" },
    { key: "box4_fed_withholding", label: "Box 4 — Federal income tax withheld", type: "money" },
    { key: "box8_tax_exempt", label: "Box 8 — Tax-exempt interest", type: "money" },
    { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "1099-DIV": [
    { key: "payer_name", label: "Payer name", type: "text", required: true },
    { key: "payer_tin", label: "Payer TIN", type: "ein", required: true },
    { key: "recipient_name", label: "Recipient name", type: "text", required: true },
    { key: "recipient_tin", label: "Recipient TIN", type: "ssn", required: true },
    { key: "box1a_ordinary_div", label: "Box 1a — Total ordinary dividends", type: "money", required: true },
    { key: "box1b_qualified_div", label: "Box 1b — Qualified dividends", type: "money" },
    { key: "box2a_capital_gain", label: "Box 2a — Total capital gain distr.", type: "money" },
    { key: "box4_fed_withholding", label: "Box 4 — Federal income tax withheld", type: "money" },
    { key: "box7_foreign_tax", label: "Box 7 — Foreign tax paid", type: "money" },
    { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "1099-R": [
    { key: "payer_name", label: "Payer name", type: "text", required: true },
    { key: "payer_tin", label: "Payer TIN", type: "ein", required: true },
    { key: "recipient_name", label: "Recipient name", type: "text", required: true },
    { key: "recipient_tin", label: "Recipient TIN", type: "ssn", required: true },
    { key: "box1_gross_distribution", label: "Box 1 — Gross distribution", type: "money", required: true },
    { key: "box2a_taxable_amount", label: "Box 2a — Taxable amount", type: "money" },
    { key: "box4_fed_withholding", label: "Box 4 — Federal income tax withheld", type: "money" },
    { key: "box7_distribution_code", label: "Box 7 — Distribution code(s)", type: "code" },
    { key: "ira_sep_simple", label: "IRA / SEP / SIMPLE checkbox", type: "text" },
    { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "1099-MISC": [
    { key: "payer_name", label: "Payer name", type: "text", required: true },
    { key: "payer_tin", label: "Payer TIN", type: "ein", required: true },
    { key: "recipient_name", label: "Recipient name", type: "text", required: true },
    { key: "recipient_tin", label: "Recipient TIN", type: "ssn", required: true },
    { key: "box1_rents", label: "Box 1 — Rents", type: "money" },
    { key: "box2_royalties", label: "Box 2 — Royalties", type: "money" },
    { key: "box3_other_income", label: "Box 3 — Other income", type: "money" },
    { key: "box4_fed_withholding", label: "Box 4 — Federal income tax withheld", type: "money" },
    { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "1098": [
    { key: "lender_name", label: "Lender / Recipient name", type: "text", required: true },
    { key: "lender_tin", label: "Lender TIN", type: "ein", required: true },
    { key: "borrower_name", label: "Borrower / Payer name", type: "text", required: true },
    { key: "borrower_tin", label: "Borrower TIN", type: "ssn", required: true },
    { key: "box1_mortgage_interest", label: "Box 1 — Mortgage interest received", type: "money", required: true },
    { key: "box2_outstanding_principal", label: "Box 2 — Outstanding mortgage principal", type: "money" },
    { key: "box5_mortgage_insurance", label: "Box 5 — Mortgage insurance premiums", type: "money" },
    { key: "box6_points", label: "Box 6 — Points paid on purchase", type: "money" },
    { key: "property_address", label: "Property address securing mortgage", type: "text" },
    { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
};

// Deliberate iteration order for the schemas. Note: relying on Object.keys here
// would put "1098" first, because a pure-digit string is treated as an integer
// property key and enumerated ahead of the others. We pin the order explicitly.
export const FORM_ORDER: Exclude<FormType, "UNKNOWN">[] = [
  "W-2",
  "1099-NEC",
  "1099-INT",
  "1099-DIV",
  "1099-R",
  "1099-MISC",
  "1098",
];

// The stable superset of every field key across every schema — used to build a
// consistent CSV column order regardless of which form types are exported.
export const ALL_FIELD_KEYS: string[] = (() => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const formType of FORM_ORDER) {
    for (const def of SCHEMAS[formType]) {
      if (!seen.has(def.key)) {
        seen.add(def.key);
        ordered.push(def.key);
      }
    }
  }
  return ordered;
})();

export function getSchema(formType: FormType): FieldDef[] {
  if (formType === "UNKNOWN") return [];
  return SCHEMAS[formType];
}

export function labelForKey(formType: FormType, key: string): string {
  const def = getSchema(formType).find((f) => f.key === key);
  if (def) return def.label;
  // UNKNOWN docs: humanize the raw key.
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
