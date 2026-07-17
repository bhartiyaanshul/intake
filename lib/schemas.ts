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
  "1099-G": [
    { key: "payer_name", label: "Payer government agency", type: "text", required: true }, { key: "payer_tin", label: "Payer TIN", type: "ein", required: true }, { key: "recipient_name", label: "Recipient name", type: "text", required: true }, { key: "recipient_tin", label: "Recipient TIN", type: "ssn", required: true },
    { key: "box1_unemployment_comp", label: "Box 1 - Unemployment compensation", type: "money" }, { key: "box2_state_refund", label: "Box 2 - State/local income tax refunds", type: "money" }, { key: "box3_refund_tax_year", label: "Box 3 - Refund tax year", type: "year" }, { key: "box4_fed_withholding", label: "Box 4 - Federal tax withheld", type: "money" }, { key: "box5_rtaa_payments", label: "Box 5 - RTAA payments", type: "money" }, { key: "box6_taxable_grants", label: "Box 6 - Taxable grants", type: "money" }, { key: "box10a_state", label: "Box 10a - State", type: "state" }, { key: "box10b_state_id", label: "Box 10b - State ID", type: "text" }, { key: "box11_state_withholding", label: "Box 11 - State tax withheld", type: "money" }, { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "SSA-1099": [
    { key: "beneficiary_name", label: "Beneficiary name", type: "text", required: true }, { key: "beneficiary_ssn", label: "Beneficiary SSN", type: "ssn", required: true }, { key: "claim_number", label: "Claim number", type: "text" }, { key: "box3_benefits_paid", label: "Box 3 - Benefits paid", type: "money", required: true }, { key: "box4_benefits_repaid", label: "Box 4 - Benefits repaid to SSA", type: "money" }, { key: "box5_net_benefits", label: "Box 5 - Net benefits", type: "money", required: true }, { key: "box6_voluntary_withholding", label: "Box 6 - Voluntary federal tax withheld", type: "money" }, { key: "amount_description_notes", label: "Description of Amount notes", type: "text" }, { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "K-1": [
    { key: "variant", label: "K-1 variant", type: "code", required: true }, { key: "entity_name", label: "Entity name", type: "text", required: true }, { key: "entity_ein", label: "Entity EIN", type: "ein", required: true }, { key: "recipient_name", label: "Partner / shareholder / beneficiary", type: "text", required: true }, { key: "recipient_tin", label: "Recipient TIN", type: "ssn", required: true }, { key: "final_k1", label: "Final K-1", type: "boolean" }, { key: "amended_k1", label: "Amended K-1", type: "boolean" },
    { key: "profit_pct_beginning", label: "1065 profit % - beginning", type: "percent" }, { key: "profit_pct_ending", label: "1065 profit % - ending", type: "percent" }, { key: "loss_pct_beginning", label: "1065 loss % - beginning", type: "percent" }, { key: "loss_pct_ending", label: "1065 loss % - ending", type: "percent" }, { key: "capital_pct_beginning", label: "1065 capital % - beginning", type: "percent" }, { key: "capital_pct_ending", label: "1065 capital % - ending", type: "percent" },
    { key: "beginning_capital", label: "1065 beginning capital", type: "money" }, { key: "capital_contributed", label: "1065 capital contributed", type: "money" }, { key: "current_year_net_income_loss", label: "1065 current-year net income/loss", type: "money" }, { key: "other_increase_decrease", label: "1065 other increase/decrease", type: "money" }, { key: "withdrawals_distributions", label: "1065 withdrawals/distributions", type: "money" }, { key: "ending_capital", label: "1065 ending capital", type: "money" },
    { key: "box1_ordinary_business_income", label: "Box 1 - Ordinary business income", type: "money" }, { key: "box2_net_rental_real_estate", label: "Box 2 - Net rental real estate", type: "money" }, { key: "box3_other_net_rental", label: "Box 3 - Other net rental", type: "money" }, { key: "box4a_guaranteed_services", label: "Box 4a - Guaranteed payments, services", type: "money" }, { key: "box4b_guaranteed_capital", label: "Box 4b - Guaranteed payments, capital", type: "money" }, { key: "box4c_guaranteed_total", label: "Box 4c - Guaranteed payments, total", type: "money" }, { key: "box5_interest", label: "Box 5 - Interest income", type: "money" }, { key: "box6a_ordinary_dividends", label: "Box 6a - Ordinary dividends", type: "money" }, { key: "box6b_qualified_dividends", label: "Box 6b - Qualified dividends", type: "money" }, { key: "box7_royalties", label: "Box 7 - Royalties", type: "money" }, { key: "box8_net_short_term_gain", label: "Box 8 - Net short-term capital gain", type: "money" }, { key: "box9a_net_long_term_gain", label: "Box 9a - Net long-term capital gain", type: "money" }, { key: "box13_deductions", label: "Box 13 - Deductions (code + amount)", type: "text" }, { key: "box14_self_employment", label: "Box 14 - Self-employment earnings", type: "text" }, { key: "box19_distributions", label: "Box 19 - Distributions", type: "text" }, { key: "box20_other_info", label: "Box 20 - Other information", type: "text" },
    { key: "ownership_pct", label: "1120-S ownership %", type: "percent" }, { key: "box12_deductions", label: "1120-S Box 12 - Deductions", type: "text" }, { key: "box16_basis_items", label: "1120-S Box 16 - Items affecting basis", type: "text" }, { key: "box17_other_info", label: "1120-S Box 17 - Other information", type: "text" },
    { key: "box1_interest", label: "1041 Box 1 - Interest", type: "money" }, { key: "box2a_ordinary_dividends", label: "1041 Box 2a - Ordinary dividends", type: "money" }, { key: "box2b_qualified_dividends", label: "1041 Box 2b - Qualified dividends", type: "money" }, { key: "box3_short_term_gain", label: "1041 Box 3 - Net short-term gain", type: "money" }, { key: "box4a_long_term_gain", label: "1041 Box 4a - Net long-term gain", type: "money" }, { key: "box5_other_income", label: "1041 Box 5 - Other portfolio/nonbusiness income", type: "money" }, { key: "box14_other_info", label: "1041 Box 14 - Other information", type: "text" }, { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "1098-E": [
    { key: "lender_name", label: "Lender name", type: "text", required: true }, { key: "lender_tin", label: "Lender TIN", type: "ein", required: true }, { key: "borrower_name", label: "Borrower name", type: "text", required: true }, { key: "borrower_ssn", label: "Borrower SSN", type: "ssn", required: true }, { key: "box1_student_loan_interest", label: "Box 1 - Student loan interest received", type: "money", required: true }, { key: "box2_pre_2004_fees_excluded", label: "Box 2 - Pre-2004 fees excluded", type: "boolean" }, { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "1098-T": [
    { key: "filer_name", label: "Filer institution name", type: "text", required: true }, { key: "filer_ein", label: "Filer EIN", type: "ein", required: true }, { key: "filer_address", label: "Filer address", type: "text" }, { key: "student_name", label: "Student name", type: "text", required: true }, { key: "student_tin", label: "Student TIN", type: "ssn", required: true }, { key: "service_provider_account_number", label: "Service provider/account number", type: "text" }, { key: "box1_qualified_tuition", label: "Box 1 - Qualified tuition payments", type: "money", required: true }, { key: "box4_prior_year_adjustments", label: "Box 4 - Prior-year adjustments", type: "money" }, { key: "box5_scholarships", label: "Box 5 - Scholarships or grants", type: "money" }, { key: "box6_scholarship_adjustments", label: "Box 6 - Scholarship adjustments", type: "money" }, { key: "box7_following_period", label: "Box 7 - Following-period amount included", type: "boolean" }, { key: "box8_half_time", label: "Box 8 - At least half-time", type: "boolean" }, { key: "box9_graduate", label: "Box 9 - Graduate student", type: "boolean" }, { key: "box10_insurance_reimbursements", label: "Box 10 - Insurance reimbursements/refunds", type: "money" }, { key: "tax_year", label: "Tax year", type: "year", required: true },
  ],
  "CHARITABLE_RECEIPT": [
    { key: "organization_name", label: "Organization name", type: "text", required: true }, { key: "organization_ein", label: "Organization EIN", type: "ein" }, { key: "donor_name", label: "Donor name", type: "text", required: true }, { key: "donation_date", label: "Donation date or date range", type: "text", required: true }, { key: "donation_type", label: "Donation type (cash/noncash/mixed)", type: "code", required: true }, { key: "cash_amount", label: "Cash amount", type: "money" }, { key: "noncash_property_description", label: "Non-cash property description", type: "text" }, { key: "noncash_fair_market_value", label: "Non-cash fair market value", type: "money" }, { key: "has_no_goods_or_services_statement", label: "No goods or services statement included", type: "boolean", required: true }, { key: "quid_pro_quo_value", label: "Goods/services received value", type: "money" }, { key: "tax_year", label: "Tax year", type: "year", required: true },
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
  "1099-G",
  "SSA-1099",
  "K-1",
  "1098-E",
  "1098-T",
  "CHARITABLE_RECEIPT",
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
