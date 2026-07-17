// Lightweight test harness — no framework, runnable via `npx tsx lib/validate.test.ts`
// (or `npm test`). Covers the W-2 arithmetic rules, TIN format checks, the
// 1099-R rules, and confidence flagging.

import {
  isValidEIN,
  isValidSSN,
  parseMoney,
  statusFromFlags,
  validateBatch,
  validateDocument,
} from "./validate";
import type { ExtractedField, FormType, IntakeDoc } from "./types";
import { maskSSN, redactSSNsInOcrText } from "./privacy";

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

// Build a field list quickly. Confidence defaults high so it doesn't add noise.
function fld(
  key: string,
  value: string,
  confidence = 0.99,
  edited = false,
): ExtractedField {
  return { key, value, originalValue: value, confidence, edited };
}

function hasFlag(
  formType: FormType,
  fields: ExtractedField[],
  fieldKey: string,
  severity: "error" | "warn",
): boolean {
  return validateDocument(formType, fields).some(
    (f) => f.fieldKey === fieldKey && f.severity === severity,
  );
}

// --- parseMoney -------------------------------------------------------------
console.log("parseMoney");
assert(parseMoney("$1,234.56") === 1234.56, "strips $ and commas");
assert(parseMoney("0") === 0, "zero parses");
assert(parseMoney("") === null, "empty is null");
assert(parseMoney("abc") === null, "garbage is null");
assert(parseMoney(null) === null, "null is null");

// --- TIN formats ------------------------------------------------------------
console.log("TIN formats");
assert(isValidSSN("000-12-3456"), "dashed SSN valid");
assert(isValidSSN("000123456"), "9-digit SSN valid");
assert(!isValidSSN("12-3456"), "short SSN invalid");
assert(!isValidSSN("000-1-3456"), "malformed SSN invalid");
assert(isValidSSN("***-**-5597"), "masked SSN valid for privacy-preserving review");
assert(maskSSN("123-45-6789") === "***-**-6789", "full SSN is normalized to masked form");
assert(!redactSSNsInOcrText("Employee SSN 123-45-6789").includes("123-45-6789"), "OCR prompt redacts formatted SSNs");
assert(isValidEIN("12-3456789"), "dashed EIN valid");
assert(isValidEIN("123456789"), "9-digit EIN valid");
assert(!isValidEIN("1-3456789"), "malformed EIN invalid");

// --- W-2 arithmetic ---------------------------------------------------------
console.log("W-2 arithmetic");

// Clean W-2: Box 4 = 6.2% of Box 3, Box 6 = 1.45% of Box 5.
const cleanW2 = [
  fld("employee_ssn", "412-11-2222"),
  fld("employer_ein", "12-3456789"),
  fld("employer_name", "Acme Corp"),
  fld("employee_name", "Jane Doe"),
  fld("box1_wages", "50000.00"),
  fld("box2_fed_withholding", "6000.00"),
  fld("box3_ss_wages", "50000.00"),
  fld("box4_ss_tax", "3100.00"), // 6.2% of 50000
  fld("box5_medicare_wages", "50000.00"),
  fld("box6_medicare_tax", "725.00"), // 1.45% of 50000
  fld("tax_year", "2024"),
];
assert(
  validateDocument("W-2", cleanW2).length === 0,
  "clean W-2 produces no flags",
);
assert(
  statusFromFlags(validateDocument("W-2", cleanW2)) === "clean",
  "clean W-2 status is clean",
);

// Box 4 wrong -> error.
const badBox4 = cleanW2.map((f) =>
  f.key === "box4_ss_tax" ? fld("box4_ss_tax", "2000.00") : f,
);
assert(
  hasFlag("W-2", badBox4, "box4_ss_tax", "error"),
  "Box 4 != 6.2% of Box 3 -> error",
);
assert(
  statusFromFlags(validateDocument("W-2", badBox4)) === "needs_review",
  "bad Box 4 -> needs_review",
);

// Box 4 within tolerance -> no flag.
const tolBox4 = cleanW2.map((f) =>
  f.key === "box4_ss_tax" ? fld("box4_ss_tax", "3101.00") : f,
);
assert(
  !hasFlag("W-2", tolBox4, "box4_ss_tax", "error"),
  "Box 4 within $2 tolerance -> no error",
);

// Box 6 excess with high Medicare wages -> warn (Additional Medicare).
const addlMedicare = [
  fld("employee_ssn", "412-11-2222"),
  fld("employer_ein", "12-3456789"),
  fld("employer_name", "Acme Corp"),
  fld("employee_name", "Jane Doe"),
  fld("box1_wages", "300000.00"),
  fld("box3_ss_wages", "168600.00"),
  fld("box4_ss_tax", "10453.20"), // 6.2% of 168600
  fld("box5_medicare_wages", "300000.00"),
  fld("box6_medicare_tax", "5250.00"), // > 1.45% (4350) — includes addl medicare
  fld("tax_year", "2024"),
];
assert(
  hasFlag("W-2", addlMedicare, "box6_medicare_tax", "warn"),
  "Box 6 excess over $200k wages -> warn not error",
);
assert(
  !hasFlag("W-2", addlMedicare, "box6_medicare_tax", "error"),
  "Box 6 excess over $200k wages -> not an error",
);

// Box 3 over SS wage base for the year -> error.
const overBase = cleanW2.map((f) =>
  f.key === "box3_ss_wages"
    ? fld("box3_ss_wages", "200000.00")
    : f.key === "box4_ss_tax"
      ? fld("box4_ss_tax", "12400.00") // keep 6.2% so only the base rule fires
      : f,
);
assert(
  hasFlag("W-2", overBase, "box3_ss_wages", "error"),
  "Box 3 over 2024 wage base -> error",
);

// Missing required field -> error.
const missingSSN = cleanW2.filter((f) => f.key !== "employee_ssn");
assert(
  hasFlag("W-2", missingSSN, "employee_ssn", "error"),
  "missing required SSN -> error",
);

// --- confidence -------------------------------------------------------------
console.log("confidence");
const lowConf = cleanW2.map((f) =>
  f.key === "box1_wages" ? fld("box1_wages", "50000.00", 0.6) : f,
);
assert(
  hasFlag("W-2", lowConf, "box1_wages", "warn"),
  "confidence < 0.8 -> warn",
);
// Editing clears the low-confidence flag.
const editedLowConf = cleanW2.map((f) =>
  f.key === "box1_wages" ? fld("box1_wages", "50000.00", 0.6, true) : f,
);
assert(
  !hasFlag("W-2", editedLowConf, "box1_wages", "warn"),
  "edited field ignores low confidence",
);

// --- 1099-R -----------------------------------------------------------------
console.log("1099-R");
const r1099 = [
  fld("payer_name", "Fidelity"),
  fld("payer_tin", "12-3456789"),
  fld("recipient_name", "John Smith"),
  fld("recipient_tin", "412-22-3333"),
  fld("box1_gross_distribution", "10000.00"),
  fld("box2a_taxable_amount", "10000.00"),
  fld("box7_distribution_code", "7"),
  fld("tax_year", "2024"),
];
assert(validateDocument("1099-R", r1099).length === 0, "clean 1099-R no flags");

const badTaxable = r1099.map((f) =>
  f.key === "box2a_taxable_amount" ? fld("box2a_taxable_amount", "12000.00") : f,
);
assert(
  hasFlag("1099-R", badTaxable, "box2a_taxable_amount", "error"),
  "Box 2a > Box 1 -> error",
);

const badCode = r1099.map((f) =>
  f.key === "box7_distribution_code" ? fld("box7_distribution_code", "Z") : f,
);
assert(
  hasFlag("1099-R", badCode, "box7_distribution_code", "error"),
  "invalid distribution code -> error",
);
const comboCode = r1099.map((f) =>
  f.key === "box7_distribution_code" ? fld("box7_distribution_code", "7D") : f,
);
assert(
  !hasFlag("1099-R", comboCode, "box7_distribution_code", "error"),
  "two-char combo code 7D valid",
);

// --- 1099 withholding -------------------------------------------------------
console.log("1099 withholding");
const highWithholding = [
  fld("payer_name", "Client LLC"),
  fld("payer_tin", "12-3456789"),
  fld("recipient_name", "Contractor"),
  fld("recipient_tin", "412-33-4444"),
  fld("box1_nonemployee_comp", "10000.00"),
  fld("box4_fed_withholding", "6000.00"), // > 50%
  fld("tax_year", "2024"),
];
assert(
  hasFlag("1099-NEC", highWithholding, "box4_fed_withholding", "warn"),
  "withholding > 50% of income -> warn",
);

// --- external reference checks ----------------------------------------------
console.log("external reference checks");

// SSN structural validity (well-formed but impossible numbers).
const badSsnArea = cleanW2.map((f) =>
  f.key === "employee_ssn" ? fld("employee_ssn", "000-11-2222") : f,
);
assert(
  hasFlag("W-2", badSsnArea, "employee_ssn", "warn"),
  "SSN area 000 -> structural warn",
);
const ssn666 = cleanW2.map((f) =>
  f.key === "employee_ssn" ? fld("employee_ssn", "666-11-2222") : f,
);
assert(
  hasFlag("W-2", ssn666, "employee_ssn", "warn"),
  "SSN area 666 -> structural warn",
);
const ssnGroup00 = cleanW2.map((f) =>
  f.key === "employee_ssn" ? fld("employee_ssn", "412-00-2222") : f,
);
assert(
  hasFlag("W-2", ssnGroup00, "employee_ssn", "warn"),
  "SSN group 00 -> structural warn",
);
assert(
  !hasFlag("W-2", cleanW2, "employee_ssn", "warn"),
  "valid SSN structure -> no warn",
);

// EIN prefix validity.
const badEin = cleanW2.map((f) =>
  f.key === "employer_ein" ? fld("employer_ein", "07-1234567") : f,
);
assert(
  hasFlag("W-2", badEin, "employer_ein", "warn"),
  "unassigned EIN prefix 07 -> warn",
);
assert(
  !hasFlag("W-2", cleanW2, "employer_ein", "warn"),
  "valid EIN prefix -> no warn",
);

// State code validity.
const badState = [...cleanW2, fld("box15_state", "ZZ")];
assert(
  hasFlag("W-2", badState, "box15_state", "warn"),
  "invalid state code ZZ -> warn",
);
const goodState = [...cleanW2, fld("box15_state", "OR")];
assert(
  !hasFlag("W-2", goodState, "box15_state", "warn"),
  "valid state code OR -> no warn",
);

// Box 12 code validity.
const badBox12 = [...cleanW2, fld("box12", "D 6,500.00; XZ 100.00")];
assert(
  hasFlag("W-2", badBox12, "box12", "warn"),
  "unrecognized Box 12 code -> warn",
);
const goodBox12 = [...cleanW2, fld("box12", "D 6,500.00; DD 12,340.00")];
assert(
  !hasFlag("W-2", goodBox12, "box12", "warn"),
  "valid Box 12 codes D/DD -> no warn",
);

// --- new internal cross-field rules -----------------------------------------
console.log("internal cross-field rules");

// Box 5 (Medicare) < Box 3 (SS) -> warn.
const medicareLtSs = cleanW2.map((f) =>
  f.key === "box5_medicare_wages" ? fld("box5_medicare_wages", "40000.00") : f,
);
assert(
  hasFlag("W-2", medicareLtSs, "box5_medicare_wages", "warn"),
  "Medicare wages < SS wages -> warn",
);

// Suggested value on the Box 4 error.
const box4flags = validateDocument("W-2", badBox4).filter(
  (f) => f.fieldKey === "box4_ss_tax" && f.severity === "error",
);
assert(
  box4flags[0]?.suggestedValue === "3,100.00",
  "Box 4 error carries suggested value 3,100.00",
);

// 1099-DIV: qualified > ordinary -> error.
const div = [
  fld("payer_name", "Vanguard"),
  fld("payer_tin", "12-3456789"),
  fld("recipient_name", "Investor"),
  fld("recipient_tin", "412-55-6666"),
  fld("box1a_ordinary_div", "1000.00"),
  fld("box1b_qualified_div", "1500.00"), // > 1a
  fld("tax_year", "2024"),
];
assert(
  hasFlag("1099-DIV", div, "box1b_qualified_div", "error"),
  "1099-DIV qualified > ordinary -> error",
);
const divOk = div.map((f) =>
  f.key === "box1b_qualified_div" ? fld("box1b_qualified_div", "800.00") : f,
);
assert(
  !hasFlag("1099-DIV", divOk, "box1b_qualified_div", "error"),
  "1099-DIV qualified <= ordinary -> no error",
);

// SS wages + tips over the wage base -> error.
const tipsOverBase = [
  fld("employee_ssn", "412-11-2222"),
  fld("employer_ein", "12-3456789"),
  fld("employer_name", "Acme"),
  fld("employee_name", "Jane"),
  fld("box1_wages", "170000.00"),
  fld("box3_ss_wages", "168000.00"),
  fld("box7_ss_tips", "2000.00"), // 168000 + 2000 = 170000 > 168600 (2024)
  fld("box4_ss_tax", "10540.00"), // 6.2% of 170000
  fld("box5_medicare_wages", "170000.00"),
  fld("box6_medicare_tax", "2465.00"), // 1.45% of 170000
  fld("tax_year", "2024"),
];
assert(
  hasFlag("W-2", tipsOverBase, "box3_ss_wages", "error"),
  "SS wages + tips over wage base -> error",
);

// --- new form rules ---------------------------------------------------------
console.log("new form rules");
const ssa = [fld("beneficiary_name", "Jane Doe"), fld("beneficiary_ssn", "412-11-2222"), fld("box3_benefits_paid", "12000"), fld("box4_benefits_repaid", "500"), fld("box5_net_benefits", "11000"), fld("tax_year", "2024")];
assert(hasFlag("SSA-1099", ssa, "box5_net_benefits", "error"), "SSA-1099 Box 5 identity mismatch -> error");
const loan = [fld("lender_name", "Lender"), fld("lender_tin", "12-3456789"), fld("borrower_name", "Jane"), fld("borrower_ssn", "412-11-2222"), fld("box1_student_loan_interest", "3000"), fld("tax_year", "2024")];
assert(hasFlag("1098-E", loan, "box1_student_loan_interest", "warn"), "1098-E deduction cap -> warn");
const k1 = [fld("variant", "1065"), fld("entity_name", "Partnership"), fld("entity_ein", "12-3456789"), fld("recipient_name", "Jane"), fld("recipient_tin", "412-11-2222"), fld("beginning_capital", "100"), fld("capital_contributed", "50"), fld("current_year_net_income_loss", "20"), fld("other_increase_decrease", "0"), fld("withdrawals_distributions", "10"), fld("ending_capital", "999"), fld("tax_year", "2024")];
assert(hasFlag("K-1", k1, "ending_capital", "error"), "K-1 1065 capital rollforward mismatch -> error");
const charity = [fld("organization_name", "Good Works"), fld("donor_name", "Jane"), fld("donation_date", "2024-12-01"), fld("donation_type", "cash"), fld("cash_amount", "250"), fld("has_no_goods_or_services_statement", "false"), fld("tax_year", "2024")];
assert(hasFlag("CHARITABLE_RECEIPT", charity, "has_no_goods_or_services_statement", "error"), "$250 charitable receipt missing acknowledgment -> error");

const sa = [fld("payer_name", "Optum Bank"), fld("payer_tin", "12-3456789"), fld("recipient_name", "Jonathan Block"), fld("recipient_tin", "412-11-2222"), fld("box1_gross_distribution", "1500"), fld("box3_distribution_code", "1"), fld("account_type", "HSA"), fld("tax_year", "2025")];
assert(!hasFlag("1099-SA", sa, "box3_distribution_code", "error"), "1099-SA valid distribution code 1 -> no error");
const saBadCode = sa.map((f) => f.key === "box3_distribution_code" ? fld("box3_distribution_code", "9") : f);
assert(hasFlag("1099-SA", saBadCode, "box3_distribution_code", "error"), "1099-SA distribution code 9 -> error");
const saEarnings = [...sa, fld("box2_earnings_excess", "2000")];
assert(hasFlag("1099-SA", saEarnings, "box2_earnings_excess", "warn"), "1099-SA Box 2 earnings > Box 1 gross -> warn");
const saMissing = [fld("payer_name", "Optum Bank"), fld("box1_gross_distribution", "1500"), fld("tax_year", "2025")];
assert(hasFlag("1099-SA", saMissing, "box3_distribution_code", "error"), "1099-SA missing required distribution code -> error");

function doc(id: string, fields: ExtractedField[]): IntakeDoc { return { id, fileName: `${id}.png`, fileSize: 1, status: "clean", ocrProgress: 100, ocrText: "", pages: [], formType: "W-2", fields, flags: [] }; }
const employer2 = cleanW2.map((f) => f.key === "employer_ein" ? fld("employer_ein", "13-4567890") : f.key === "box4_ss_tax" ? fld("box4_ss_tax", "6000") : f);
const employer1 = cleanW2.map((f) => f.key === "box4_ss_tax" ? fld("box4_ss_tax", "6000") : f);
assert(validateBatch([doc("w2-a", employer1), doc("w2-b", employer2)]).some((f) => f.fieldKey === "excess_ss_withholding" && f.severity === "warn"), "two W-2s over SS cap -> external warning");


// --- 1099-R distribution codes (verified vs IRS instructions) ---------------
console.log("1099-R distribution codes");
function rWithCode(code: string): ExtractedField[] {
  return [
    fld("payer_name", "Fidelity"), fld("payer_tin", "12-3456789"),
    fld("recipient_name", "John"), fld("recipient_tin", "412-22-3333"),
    fld("box1_gross_distribution", "10000"), fld("box2a_taxable_amount", "10000"),
    fld("box7_distribution_code", code), fld("tax_year", "2024"),
  ];
}
for (const c of ["C", "M", "Y", "7", "7D"]) {
  assert(!hasFlag("1099-R", rWithCode(c), "box7_distribution_code", "error"), `distribution code ${c} is valid`);
}
for (const c of ["V", "Z", "I", "O"]) {
  assert(hasFlag("1099-R", rWithCode(c), "box7_distribution_code", "error"), `distribution code ${c} is invalid -> error`);
}

// --- 1099-G, 1098-T, 1098, K-1 percent --------------------------------------
console.log("more new-form rules");
const g = [fld("payer_name", "State"), fld("payer_tin", "12-3456789"), fld("recipient_name", "Jane"), fld("recipient_tin", "412-11-2222"), fld("box2_state_refund", "800"), fld("tax_year", "2024")];
assert(hasFlag("1099-G", g, "box3_refund_tax_year", "error"), "1099-G Box 2 refund without Box 3 year -> error");

const t = [fld("filer_name", "State U"), fld("filer_ein", "12-3456789"), fld("student_name", "Sam"), fld("student_tin", "412-11-2222"), fld("box1_qualified_tuition", "4000"), fld("box5_scholarships", "6000"), fld("tax_year", "2024")];
assert(hasFlag("1098-T", t, "box5_scholarships", "warn"), "1098-T scholarships > tuition -> warn");

const mortgage = [fld("lender_name", "Bank"), fld("lender_tin", "12-3456789"), fld("borrower_name", "Jo"), fld("borrower_tin", "412-11-2222"), fld("box1_mortgage_interest", "9000"), fld("box2_outstanding_principal", "5000"), fld("tax_year", "2024")];
assert(hasFlag("1098", mortgage, "box1_mortgage_interest", "warn"), "1098 interest >= principal -> warn");

const k1pct = [...k1.filter((f) => f.key !== "ending_capital"), fld("ending_capital", "160"), fld("capital_pct_ending", "140")];
assert(hasFlag("K-1", k1pct, "capital_pct_ending", "error"), "K-1 ending % over 100 -> error");

// --- more batch checks ------------------------------------------------------
console.log("batch checks");
function mkDoc(id: string, formType: FormType, fields: ExtractedField[]): IntakeDoc {
  return { id, fileName: `${id}.png`, fileSize: 1, status: "clean", ocrProgress: 100, ocrText: "", pages: [], formType, fields, flags: [] };
}
const nec1 = [fld("payer_name", "Acme"), fld("payer_tin", "81-4455221"), fld("recipient_name", "Dev"), fld("recipient_tin", "412-73-4192"), fld("box1_nonemployee_comp", "48500"), fld("tax_year", "2024")];
const nec2 = nec1.map((f) => ({ ...f })); // identical -> duplicate
assert(validateBatch([mkDoc("a", "1099-NEC", nec1), mkDoc("b", "1099-NEC", nec2)]).some((f) => f.fieldKey === "duplicate_document"), "identical 1099-NECs -> duplicate warning");

const necY1 = [...nec1.filter((f) => f.key !== "tax_year"), fld("tax_year", "2023")];
const necY2 = [...nec1.filter((f) => f.key !== "tax_year"), fld("tax_year", "2024")];
assert(validateBatch([mkDoc("a", "1099-NEC", necY1), mkDoc("b", "1099-NEC", necY2)]).some((f) => f.fieldKey === "mixed_years"), "mixed tax years -> warning");

const idA = [fld("payer_name", "P"), fld("payer_tin", "81-4455221"), fld("recipient_name", "Jane Doe"), fld("recipient_tin", "412-11-2222"), fld("box1_interest", "100"), fld("tax_year", "2024")];
const idB = [fld("payer_name", "Q"), fld("payer_tin", "94-2551803"), fld("recipient_name", "John Smith"), fld("recipient_tin", "412-11-2222"), fld("box1_interest", "200"), fld("tax_year", "2024")];
assert(validateBatch([mkDoc("a", "1099-INT", idA), mkDoc("b", "1099-INT", idB)]).some((f) => f.fieldKey === "identity_mismatch"), "same SSN different names -> identity mismatch");

// --- summary ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
