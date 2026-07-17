// Registry of every validation rule + a client-side store for which rules the
// preparer has turned off. The validation engine tags each flag with a stable
// `ruleId` (below), and `validateDocument`/`validateBatch` drop flags whose rule
// is disabled. The "Validation rules" panel reads this registry to list every
// rule with a toggle.
//
// DECISION: rule preferences persist to localStorage (not a server). They're
// preparer *settings*, not client tax data, so keeping them local is consistent
// with Intake's "nothing sensitive leaves the browser / no DB" posture and means
// a preparer's tuning survives a reload.

import type { Severity } from "./types";

export type RuleGroup =
  | "format"
  | "reference"
  | "w2"
  | "1099"
  | "1098"
  | "ssa"
  | "k1"
  | "charitable"
  | "batch";

export interface RuleMeta {
  id: string;
  label: string;
  description: string;
  group: RuleGroup;
  severity: Severity;
}

export const RULE_GROUPS: { id: RuleGroup; label: string }[] = [
  { id: "format", label: "Format & presence (all forms)" },
  { id: "reference", label: "External reference checks (all forms)" },
  { id: "w2", label: "W-2 arithmetic" },
  { id: "1099", label: "1099 series" },
  { id: "1098", label: "1098 series (mortgage, student loan, tuition)" },
  { id: "ssa", label: "SSA-1099" },
  { id: "k1", label: "Schedule K-1" },
  { id: "charitable", label: "Charitable donation receipt" },
  { id: "batch", label: "Cross-document (whole batch)" },
];

export const RULES: RuleMeta[] = [
  // format & presence
  { id: "required_field", label: "Required field present", description: "A field the form always carries (TINs, primary income box, tax year) must not be empty.", group: "format", severity: "error" },
  { id: "ssn_format", label: "SSN format", description: "SSN fields must read as XXX-XX-XXXX or 9 digits.", group: "format", severity: "error" },
  { id: "ein_format", label: "EIN / TIN format", description: "EIN fields must read as XX-XXXXXXX or 9 digits.", group: "format", severity: "error" },
  { id: "money_format", label: "Money parses", description: "Dollar amounts must parse as a number after stripping $ and commas.", group: "format", severity: "error" },
  { id: "percent_format", label: "Percentage parses", description: "Percentage fields (K-1 ownership) must parse as a number.", group: "format", severity: "error" },
  { id: "year_range", label: "Tax year sane", description: "Tax year should fall between 1990 and 2100.", group: "format", severity: "warn" },
  { id: "low_confidence", label: "Low extraction confidence", description: "Flag any un-edited field the model returned with confidence below 80%.", group: "format", severity: "warn" },
  { id: "constants_fallback", label: "Tax-year constants fallback", description: "Warn when the tax year is missing/unsupported and validation falls back to the latest year's constants.", group: "format", severity: "warn" },
  // external reference
  { id: "ssn_structure", label: "SSN structurally possible", description: "Well-formed SSNs that the SSA never issues (area 000/666/900–999, group 00, serial 0000).", group: "reference", severity: "warn" },
  { id: "ein_prefix", label: "EIN prefix assigned", description: "First two EIN digits must be an IRS-assigned campus prefix.", group: "reference", severity: "warn" },
  { id: "state_code", label: "Valid state code", description: "State fields must be a real USPS state/territory/military code.", group: "reference", severity: "warn" },
  { id: "box12_codes", label: "W-2 Box 12 codes", description: "Box 12 letter codes must be in the IRS set (A–HH; no I, O, U, X).", group: "reference", severity: "warn" },
  // W-2
  { id: "w2_box4_ss_tax", label: "Box 4 = 6.2% of SS wages", description: "Social Security tax withheld should equal 6.2% of Box 3 (+ Box 7 tips).", group: "w2", severity: "error" },
  { id: "w2_box6_medicare", label: "Box 6 = 1.45% of Medicare wages", description: "Medicare tax should equal 1.45% of Box 5; excess over $200k wages is treated as Additional Medicare Tax.", group: "w2", severity: "error" },
  { id: "w2_medicare_ge_ss", label: "Medicare wages ≥ SS wages", description: "Box 5 is normally ≥ Box 3 because Medicare wages are uncapped.", group: "w2", severity: "warn" },
  { id: "w2_ss_wage_base", label: "SS wages within wage base", description: "Box 3 (+ Box 7) cannot exceed the Social Security wage base for the year.", group: "w2", severity: "error" },
  { id: "w2_withholding_lt_wages", label: "Withholding below wages", description: "Box 2 federal withholding at or above Box 1 wages is unusual.", group: "w2", severity: "warn" },
  { id: "w2_box16_vs_box1", label: "State wages vs federal wages", description: "Box 16 well above Box 1 is flagged (can be legitimate on multi-state W-2s).", group: "w2", severity: "warn" },
  // 1099 series
  { id: "1099r_taxable_le_gross", label: "1099-R taxable ≤ gross", description: "Box 2a taxable amount cannot exceed Box 1 gross distribution.", group: "1099", severity: "error" },
  { id: "1099r_code_valid", label: "1099-R distribution code", description: "Box 7 code must be in the valid IRS set (1–9, A–Y as issued).", group: "1099", severity: "error" },
  { id: "1099r_early_dist_info", label: "1099-R early-distribution note", description: "Note that code 1 may carry a 10% additional tax.", group: "1099", severity: "info" },
  { id: "1099r_ira_code7_info", label: "1099-R IRA code 7 note", description: "Note IRA/SEP/SIMPLE normal-distribution code 7.", group: "1099", severity: "info" },
  { id: "1099div_qualified_le_ordinary", label: "Qualified ≤ ordinary dividends", description: "1099-DIV Box 1b qualified dividends can't exceed Box 1a ordinary dividends.", group: "1099", severity: "error" },
  { id: "1099_withholding_ratio", label: "1099 withholding sanity", description: "Federal withholding above 50% of the largest income box is unusual.", group: "1099", severity: "warn" },
  { id: "1099g_refund_year", label: "1099-G refund year present", description: "Box 3 refund tax year is required when a Box 2 state refund is reported.", group: "1099", severity: "error" },
  { id: "1099g_withholding", label: "1099-G withholding sanity", description: "Federal withholding exceeding total taxable amounts is flagged.", group: "1099", severity: "warn" },
  { id: "1099sa_code_valid", label: "1099-SA distribution code", description: "1099-SA Box 3 distribution code must be 1–6.", group: "1099", severity: "error" },
  { id: "1099sa_earnings_le_gross", label: "1099-SA earnings ≤ gross", description: "1099-SA Box 2 earnings on excess contributions normally shouldn't exceed Box 1 gross distribution.", group: "1099", severity: "warn" },
  // 1098 series
  { id: "1098_interest_vs_principal", label: "Mortgage interest vs principal", description: "1098 mortgage interest at or above outstanding principal is unusual.", group: "1098", severity: "warn" },
  { id: "1098e_cap", label: "Student-loan interest cap", description: "1098-E interest above the $2,500 deduction cap; excess isn't deductible.", group: "1098", severity: "warn" },
  { id: "1098t_scholarship_gt_tuition", label: "Scholarships vs tuition", description: "1098-T scholarships exceeding qualified tuition may be taxable / block a credit.", group: "1098", severity: "warn" },
  { id: "1098t_zero_tuition", label: "1098-T zero tuition", description: "Box 1 is $0 while scholarships are populated.", group: "1098", severity: "warn" },
  // SSA-1099
  { id: "ssa_net_benefits", label: "Net benefits = paid − repaid", description: "SSA-1099 Box 5 must equal Box 3 minus Box 4.", group: "ssa", severity: "error" },
  { id: "ssa_withholding", label: "Voluntary withholding sanity", description: "Box 6 voluntary withholding should not exceed Box 5 net benefits.", group: "ssa", severity: "warn" },
  // K-1
  { id: "k1_capital_rollforward", label: "Capital account rolls forward", description: "1065 ending capital must equal beginning + contributions + income + other − withdrawals.", group: "k1", severity: "error" },
  { id: "k1_ownership_pct", label: "Ownership % in range", description: "Ending profit/loss/capital/ownership percentages must be between 0 and 100.", group: "k1", severity: "error" },
  { id: "k1_se_info", label: "K-1 self-employment note", description: "Note when Box 14 self-employment earnings are present (SE tax may apply).", group: "k1", severity: "info" },
  // charitable
  { id: "charitable_acknowledgment", label: "$250+ written acknowledgment", description: "Contributions of $250+ need a contemporaneous acknowledgment stating whether goods/services were provided.", group: "charitable", severity: "error" },
  { id: "charitable_8283", label: "Non-cash appraisal / Form 8283", description: "Non-cash donations over $500 (Form 8283 Sec. A) and over $5,000 (Sec. B + qualified appraisal).", group: "charitable", severity: "warn" },
  // batch / cross-document
  { id: "batch_excess_ss", label: "Excess Social Security withholding", description: "Total SS tax across multiple employers exceeds the annual maximum — claimable as a credit.", group: "batch", severity: "warn" },
  { id: "batch_aggregate_withholding", label: "Aggregate withholding sanity", description: "Total federal withholding above 40% of total income across the batch.", group: "batch", severity: "warn" },
  { id: "batch_identity_mismatch", label: "Identity mismatch", description: "Same SSN appears under different names across documents.", group: "batch", severity: "warn" },
  { id: "batch_duplicate", label: "Duplicate document", description: "Two documents with the same form type, payer, recipient, and amount.", group: "batch", severity: "warn" },
  { id: "batch_mixed_years", label: "Mixed tax years", description: "Documents from more than one tax year in the same batch.", group: "batch", severity: "warn" },
  { id: "batch_state_consistency", label: "Multi-state activity", description: "Three or more states across the batch (likely a multi-state return).", group: "batch", severity: "info" },
  { id: "batch_shared_name", label: "Shared recipient name", description: "Same name under different SSNs (could be spouses filing jointly).", group: "batch", severity: "info" },
];

export const RULE_IDS = new Set(RULES.map((r) => r.id));

// --- config store -----------------------------------------------------------

const STORAGE_KEY = "intake.disabledRules.v1";
let disabled = new Set<string>();
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) disabled = new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore corrupt storage */
  }
}
load();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function isRuleEnabled(id: string): boolean {
  return !disabled.has(id);
}

export function getDisabledRuleIds(): ReadonlySet<string> {
  return disabled;
}

export function disabledCount(): number {
  return disabled.size;
}

export function setRuleEnabled(id: string, enabled: boolean) {
  const next = new Set(disabled);
  if (enabled) next.delete(id);
  else next.add(id);
  disabled = next;
  persist();
  listeners.forEach((l) => l());
}

export function setGroupEnabled(group: RuleGroup, enabled: boolean) {
  const next = new Set(disabled);
  for (const r of RULES) {
    if (r.group !== group) continue;
    if (enabled) next.delete(r.id);
    else next.add(r.id);
  }
  disabled = next;
  persist();
  listeners.forEach((l) => l());
}

export function resetRules() {
  disabled = new Set();
  persist();
  listeners.forEach((l) => l());
}

// Subscribe to config changes (used by React via useSyncExternalStore).
export function subscribeRules(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
