import { getSchema } from "./schemas";
import { einPrefixIssue, parseBox12Codes, ssnStructuralIssue, US_STATE_CODES, W2_BOX12_CODES } from "./reference";
import { constantsForYear } from "./taxConstants";
import { isFullyMaskedSSN, isMaskedSSN } from "./privacy";
import { isRuleEnabled } from "./rules";
import type { ExtractedField, FieldDef, FormType, IntakeDoc, ValidationFlag } from "./types";

const CONFIDENCE_THRESHOLD = 0.8;
// Each flag is tagged with the id of the rule that produced it (see lib/rules.ts)
// so individual rules can be toggled off by the preparer.
const flag = (ruleId: string, fieldKey: string, severity: ValidationFlag["severity"], message: string, suggestedValue?: string): ValidationFlag => ({ fieldKey, severity, scope: "internal", ruleId, message, suggestedValue });
const external = (ruleId: string, fieldKey: string, severity: ValidationFlag["severity"], message: string, documents: string[]): ValidationFlag => ({ fieldKey, severity, scope: "external", ruleId, message, documents });

export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s()]/g, "");
  if (!cleaned) return null;
  const negative = /[()]/.test(String(raw));
  const value = Number(cleaned);
  return Number.isFinite(value) ? (negative ? -Math.abs(value) : value) : null;
}
export function formatMoney(n: number): string { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const digits = (v: string) => v.replace(/\D/g, "");
export function isValidSSN(v: string): boolean { return isMaskedSSN(v) || /^\d{3}-\d{2}-\d{4}$/.test(v.trim()) || (/^\d{9}$/.test(v.trim())); }
export function isValidEIN(v: string): boolean { return /^\d{2}-\d{7}$/.test(v.trim()) || (/^\d{9}$/.test(v.trim())); }
function parsePercent(v: string | undefined): number | null { if (!v) return null; const n = Number(v.replace(/[%\s,]/g, "")); return Number.isFinite(n) ? n : null; }
function bool(v: string | undefined): boolean { return /^(true|yes|checked|x|1)$/i.test((v ?? "").trim()); }
function vals(fields: ExtractedField[]) { return Object.fromEntries(fields.filter((f) => f.value.trim() !== "").map((f) => [f.key, f.value])); }
function yearOf(v: Record<string, string>): number | null { const n = Number(digits(v.tax_year ?? "").slice(0, 4)); return Number.isFinite(n) && n > 1900 ? n : null; }
function within(actual: number, expected: number) { return Math.abs(actual - expected) <= Math.max(2, Math.abs(expected) * 0.01); }
function normalized(v: string | undefined) { return (v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(); }

function baseRules(fields: ExtractedField[], schema: FieldDef[]): ValidationFlag[] {
  const out: ValidationFlag[] = []; const v = vals(fields); const defs = new Map(schema.map((d) => [d.key, d]));
  for (const def of schema) if (def.required && !v[def.key]) out.push(flag("required_field", def.key, "error", `Required field is missing - ${def.label} must be present.`));
  for (const f of fields) {
    const def = defs.get(f.key); const value = f.value.trim(); if (!def || !value) continue;
    if (def.type === "ssn" && !isValidSSN(value)) out.push(flag("ssn_format", f.key, "error", "Not a valid SSN - expected XXX-XX-XXXX or 9 digits."));
    if (def.type === "ssn" && isFullyMaskedSSN(value)) out.push(flag("ssn_fully_masked", f.key, "warn", "SSN is fully masked on this document - enter the taxpayer's SSN before filing."));
    if (def.type === "ein" && !isValidEIN(value)) out.push(flag("ein_format", f.key, "error", "Not a valid EIN/TIN - expected XX-XXXXXXX or 9 digits."));
    if (def.type === "money" && parseMoney(value) == null) out.push(flag("money_format", f.key, "error", "Amount doesn't parse as a number."));
    if (def.type === "percent" && (parsePercent(value) == null)) out.push(flag("percent_format", f.key, "error", "Percentage doesn't parse as a number."));
    if (def.type === "year" && (!Number.isFinite(Number(digits(value).slice(0, 4))) || Number(digits(value).slice(0, 4)) < 1990 || Number(digits(value).slice(0, 4)) > 2100)) out.push(flag("year_range", f.key, "warn", "Tax year looks off - confirm against the document."));
    if (def.type === "ssn" && !isMaskedSSN(value)) { const issue = ssnStructuralIssue(digits(value)); if (issue) out.push(flag("ssn_structure", f.key, "warn", `SSN structure is not one the SSA issues (${issue}) - verify it wasn't misread.`)); }
    if (def.type === "ein") { const issue = einPrefixIssue(digits(value)); if (issue) out.push(flag("ein_prefix", f.key, "warn", `EIN prefix "${issue}" is not IRS-assigned - verify it wasn't misread.`)); }
    if (def.type === "state" && !US_STATE_CODES.has(value.toUpperCase())) out.push(flag("state_code", f.key, "warn", `"${value}" is not a valid US state/territory code.`));
    if (!f.edited && f.confidence < CONFIDENCE_THRESHOLD) out.push(flag("low_confidence", f.key, "warn", `Low extraction confidence (${Math.round(f.confidence * 100)}%) - verify against document.`));
  }
  const b12 = v.box12; if (b12) { const bad = parseBox12Codes(b12).filter((c) => !W2_BOX12_CODES.has(c)); if (bad.length) out.push(flag("box12_codes", "box12", "warn", `Box 12 code(s) not recognized: ${bad.join(", ")}.`)); }
  return out;
}

function constantsWarning(v: Record<string, string>, out: ValidationFlag[]) { const c = constantsForYear(yearOf(v)); if (c.usedFallback) out.push(flag("constants_fallback", "tax_year", "warn", `Tax year missing or unsupported; using ${c.year} tax constants for validation.`)); return c; }
function w2Rules(fields: ExtractedField[]) {
  const out: ValidationFlag[] = []; const v = vals(fields); const c = constantsWarning(v, out).constants;
  const b1=parseMoney(v.box1_wages), b2=parseMoney(v.box2_fed_withholding), b3=parseMoney(v.box3_ss_wages), b4=parseMoney(v.box4_ss_tax), b5=parseMoney(v.box5_medicare_wages), b6=parseMoney(v.box6_medicare_tax), b7=parseMoney(v.box7_ss_tips) ?? 0, b16=parseMoney(v.box16_state_wages);
  if (b3 != null && b4 != null) { const expected=(b3+b7)*c.ssTaxRate; if (!within(b4,expected)) out.push(flag("w2_box4_ss_tax", "box4_ss_tax","error",`Box 4 should be ~${c.ssTaxRate*100}% of Box 3 (~$${formatMoney(expected)}).`,formatMoney(expected))); }
  if (b5 != null && b6 != null) { const expected=b5*c.medicareRate; if (!within(b6,expected)) out.push(flag("w2_box6_medicare", "box6_medicare_tax", b5 > c.additionalMedicareThreshold && b6 > expected ? "warn":"error", b5 > c.additionalMedicareThreshold && b6 > expected ? "Box 6 may include Additional Medicare Tax; verify." : `Box 6 should be ~${c.medicareRate*100}% of Box 5 (~$${formatMoney(expected)}).`, b5 > c.additionalMedicareThreshold && b6 > expected ? undefined:formatMoney(expected))); }
  if (b3 != null && b5 != null && b5 + .01 < b3) out.push(flag("w2_medicare_ge_ss", "box5_medicare_wages", "warn", "Box 5 (Medicare wages) is less than Box 3 (SS wages); verify."));
  if (b3 != null && b3+b7 > c.ssWageBase+.01) out.push(flag("w2_ss_wage_base", "box3_ss_wages", "error", `Box 3${b7 ? " + Box 7" : ""} exceeds the Social Security wage base of $${c.ssWageBase.toLocaleString()}.`));
  if (b1 != null && b2 != null && b2 >= b1 && b1 > 0) out.push(flag("w2_withholding_lt_wages", "box2_fed_withholding","warn","Box 2 (withholding) is >= Box 1 (wages) - unusual, verify."));
  if (b1 != null && b16 != null && b16 > b1 * 1.01 + 2) out.push(flag("w2_box16_vs_box1", "box16_state_wages","warn","Box 16 exceeds Box 1 - can be legitimate for multi-state wages, verify."));
  return out;
}
function simpleRules(type: FormType, fields: ExtractedField[]) {
  const out: ValidationFlag[]=[]; const v=vals(fields); const a=(k:string)=>parseMoney(v[k]); const c=constantsWarning(v,out).constants;
  if (type === "SSA-1099") { const b3=a("box3_benefits_paid"),b4=a("box4_benefits_repaid")??0,b5=a("box5_net_benefits"),b6=a("box6_voluntary_withholding"); if(b3!=null&&b5!=null&&!within(b5,b3-b4)) out.push(flag("ssa_net_benefits", "box5_net_benefits","error",`Box 5 must equal Box 3 minus Box 4 ($${formatMoney(b3-b4)}).`,formatMoney(b3-b4))); if(b5!=null&&b6!=null&&b6>b5+.01) out.push(flag("ssa_withholding", "box6_voluntary_withholding","warn","Box 6 withholding should not exceed Box 5 net benefits.")); }
  if (type === "1099-G") { const b1=a("box1_unemployment_comp")??0,b6=a("box6_taxable_grants")??0,b4=a("box4_fed_withholding"); if(b4!=null&&b4>b1+b6) out.push(flag("1099g_withholding", "box4_fed_withholding","warn","Federal withholding exceeds total taxable amounts; verify.")); if(a("box2_state_refund")!=null&&!v.box3_refund_tax_year) out.push(flag("1099g_refund_year", "box3_refund_tax_year","error","Box 3 refund tax year is required when Box 2 state refund is present.")); }
  if (type === "1099-R") { const b1=a("box1_gross_distribution"),b2=a("box2a_taxable_amount"),code=v.box7_distribution_code?.toUpperCase(); if(b1!=null&&b2!=null&&b2>b1+.01) out.push(flag("1099r_taxable_le_gross", "box2a_taxable_amount","error","Box 2a cannot exceed Box 1.")); if(code && !/^[123456789ABCDEFGHJKLMNPQRSTUWY](?:[123456789ABCDEFGHJKLMNPQRSTUWY])?$/.test(code)) out.push(flag("1099r_code_valid", "box7_distribution_code","error",`"${code}" is not a valid IRS distribution code.`)); if(code?.includes("1")) out.push(flag("1099r_early_dist_info", "box7_distribution_code","info","Early distribution code 1: a 10% additional tax may apply.")); if(bool(v.ira_sep_simple)&&code?.includes("7")) out.push(flag("1099r_ira_code7_info", "box7_distribution_code","info","IRA/SEP/SIMPLE normal distribution code 7 noted.")); }
  if (type === "1099-DIV") { const x=a("box1a_ordinary_div"),y=a("box1b_qualified_div"); if(x!=null&&y!=null&&y>x+.01) out.push(flag("1099div_qualified_le_ordinary", "box1b_qualified_div","error","Qualified dividends cannot exceed ordinary dividends.")); }
  if (type === "1099-SA") { const code=(v.box3_distribution_code ?? "").trim(); if(code && !/^[1-6]$/.test(code)) out.push(flag("1099sa_code_valid", "box3_distribution_code","error",`"${code}" is not a valid 1099-SA distribution code (1–6).`)); const b1=a("box1_gross_distribution"),b2=a("box2_earnings_excess"); if(b1!=null&&b2!=null&&b2>b1+.01) out.push(flag("1099sa_earnings_le_gross", "box2_earnings_excess","warn","Box 2 earnings normally shouldn't exceed Box 1 gross distribution; verify.")); }
  if (["1099-NEC","1099-INT","1099-DIV","1099-MISC"].includes(type)) { const keys:Record<string,string[]>={"1099-NEC":["box1_nonemployee_comp"],"1099-INT":["box1_interest","box3_treasury_interest","box8_tax_exempt"],"1099-DIV":["box1a_ordinary_div","box2a_capital_gain"],"1099-MISC":["box1_rents","box2_royalties","box3_other_income"]}; const withholding=a("box4_fed_withholding"), largest=Math.max(0,...keys[type].map(a).filter((x):x is number=>x!=null)); if(withholding!=null&&largest>0&&withholding>largest*.5) out.push(flag("1099_withholding_ratio", "box4_fed_withholding","warn","Federal withholding is over 50% of the largest income box - unusual, verify.")); }
  if (type === "1098-E" && (a("box1_student_loan_interest") ?? 0)>c.studentLoanInterestCap) out.push(flag("1098e_cap", "box1_student_loan_interest","warn",`Student loan interest deduction is capped at $${c.studentLoanInterestCap.toLocaleString()}; excess is not deductible.`));
  if (type === "1098-T") { const tuition=a("box1_qualified_tuition"),sch=a("box5_scholarships"); if(sch!=null&&tuition!=null&&sch>tuition) out.push(flag("1098t_scholarship_gt_tuition", "box5_scholarships","warn","Scholarships exceed qualified tuition; taxable scholarship income and no education credit likely.")); if(tuition===0&&sch!=null&&sch>0) out.push(flag("1098t_zero_tuition", "box1_qualified_tuition","warn","Box 1 is $0 while Box 5 is populated; verify.")); }
  if (type === "1098") { const interest=a("box1_mortgage_interest"),principal=a("box2_outstanding_principal"); if(interest!=null&&principal!=null&&interest>=principal) out.push(flag("1098_interest_vs_principal", "box1_mortgage_interest","warn","Mortgage interest is not normally greater than outstanding principal; verify.")); }
  if (type === "K-1") { const variant=(v.variant ?? "").toUpperCase(); if(variant==="1065") { const b=a("beginning_capital"),con=a("capital_contributed")??0,inc=a("current_year_net_income_loss")??0,other=a("other_increase_decrease")??0,wd=a("withdrawals_distributions")??0,end=a("ending_capital"); if(b!=null&&end!=null&&!within(end,b+con+inc+other-wd)) out.push(flag("k1_capital_rollforward", "ending_capital","error",`Capital account rollforward should end at $${formatMoney(b+con+inc+other-wd)}.`,formatMoney(b+con+inc+other-wd))); for(const k of ["profit_pct_ending","loss_pct_ending","capital_pct_ending"]){const p=parsePercent(v[k]);if(p!=null&&(p<0||p>100))out.push(flag("k1_ownership_pct", k,"error","Ending ownership percentage must be between 0 and 100."));} if(v.box14_self_employment) out.push(flag("k1_se_info", "box14_self_employment","info","Box 14 self-employment earnings present; SE tax may apply.")); } if(variant==="1120-S") { const p=parsePercent(v.ownership_pct); if(p!=null&&(p<0||p>100)) out.push(flag("k1_ownership_pct", "ownership_pct","error","Ownership percentage must be between 0 and 100.")); /* DECISION: stock-basis/distribution analysis is intentionally omitted because the K-1 alone does not provide basis. */ } }
  if (type === "CHARITABLE_RECEIPT") { const cash=a("cash_amount")??0, fmv=a("noncash_fair_market_value")??0; if(Math.max(cash,fmv)>=c.charitableAcknowledgmentThreshold&&!bool(v.has_no_goods_or_services_statement)) out.push(flag("charitable_acknowledgment", "has_no_goods_or_services_statement","error","Contributions of $250+ require a contemporaneous written acknowledgment stating whether goods or services were provided - this receipt is missing that statement and may not substantiate the deduction.")); if(fmv>c.form8283SectionBThreshold) out.push(flag("charitable_8283", "noncash_fair_market_value","warn","Non-cash donations over $5,000 generally require a qualified appraisal and Form 8283 Section B.")); else if(fmv>c.form8283SectionAThreshold) out.push(flag("charitable_8283", "noncash_fair_market_value","warn","Non-cash donations over $500 generally require Form 8283 Section A.")); }
  return out;
}

export function validateDocument(formType: FormType, fields: ExtractedField[]): ValidationFlag[] { const out=formType === "UNKNOWN" ? fields.filter(f=>!f.edited&&f.value.trim()&&f.confidence<CONFIDENCE_THRESHOLD).map(f=>flag("low_confidence", f.key,"warn",`Low extraction confidence (${Math.round(f.confidence*100)}%) - verify against document.`)) : [...baseRules(fields,getSchema(formType)), ...(formType==="W-2"?w2Rules(fields):simpleRules(formType,fields))]; return out.filter(f=>isRuleEnabled(f.ruleId)).filter((f,i,a)=>a.findIndex(x=>`${x.fieldKey}|${x.severity}|${x.message}`===`${f.fieldKey}|${f.severity}|${f.message}`)===i); }

function docValue(d: IntakeDoc, key: string) { return d.fields.find(f=>f.key===key)?.value; }
function docTin(d: IntakeDoc) {
  const raw = docValue(d,"employee_ssn") ?? docValue(d,"beneficiary_ssn") ?? docValue(d,"borrower_ssn") ?? docValue(d,"student_tin") ?? docValue(d,"recipient_tin");
  // DECISION: last-four-only SSNs are intentionally not batch identity keys.
  // Matching on them could join unrelated taxpayers who share a suffix.
  return raw && isMaskedSSN(raw) ? "" : normalized(raw);
}
function docName(d: IntakeDoc) { return docValue(d,"employee_name") ?? docValue(d,"beneficiary_name") ?? docValue(d,"borrower_name") ?? docValue(d,"student_name") ?? docValue(d,"recipient_name") ?? docValue(d,"donor_name"); }
function docPayer(d: IntakeDoc) { return normalized(docValue(d,"employer_ein") ?? docValue(d,"payer_tin") ?? docValue(d,"lender_tin") ?? docValue(d,"entity_ein") ?? docValue(d,"filer_ein")); }
function primaryAmount(d: IntakeDoc) { const k:Record<string,string>={"W-2":"box1_wages","1099-NEC":"box1_nonemployee_comp","1099-INT":"box1_interest","1099-DIV":"box1a_ordinary_div","1099-R":"box1_gross_distribution","1099-MISC":"box1_rents","1099-SA":"box1_gross_distribution","1099-G":"box1_unemployment_comp","SSA-1099":"box5_net_benefits","1098-E":"box1_student_loan_interest","1098-T":"box1_qualified_tuition","1098":"box1_mortgage_interest","CHARITABLE_RECEIPT":"cash_amount"}; return parseMoney(docValue(d,k[d.formType] ?? "")); }
function fedWithholding(d: IntakeDoc) { return parseMoney(docValue(d,"box2_fed_withholding") ?? docValue(d,"box4_fed_withholding") ?? docValue(d,"box6_voluntary_withholding")); }

export function validateBatch(docs: IntakeDoc[]): ValidationFlag[] {
  const active=docs.filter(d=>d.formType!=="UNKNOWN"&&d.status!=="extract_failed"); const out:ValidationFlag[]=[]; const groups=new Map<string,IntakeDoc[]>(); for(const d of active){const tin=docTin(d);if(tin)groups.set(tin,[...(groups.get(tin)??[]),d]);}
  for(const [tin,ds] of groups){ const w2=ds.filter(d=>d.formType==="W-2"); if(w2.length>=2){const total=w2.reduce((s,d)=>s+(parseMoney(docValue(d,"box4_ss_tax"))??0),0); const y=yearOf(Object.fromEntries(w2[0].fields.map(f=>[f.key,f.value]))); const c=constantsForYear(y).constants; if(total>c.maxSsTaxWithheldPerEmployer)out.push(external("batch_excess_ss", "excess_ss_withholding","warn","Excess Social Security tax withheld across multiple employers - the taxpayer can claim the excess as a credit (Schedule 3). Do not correct on the W-2.",w2.map(d=>d.id))); }
    const income=ds.reduce((s,d)=>s+(primaryAmount(d)??0),0), withholding=ds.reduce((s,d)=>s+(fedWithholding(d)??0),0); if(income>0&&withholding>income*.4)out.push(external("batch_aggregate_withholding", "aggregate_withholding","warn","Aggregate federal withholding exceeds 40% of aggregate income; review for a transcription error.",ds.map(d=>d.id)));
    const names=new Set(ds.map(d=>normalized(docName(d))).filter(Boolean)); if(names.size>1)out.push(external("batch_identity_mismatch", "identity_mismatch","warn",`Name mismatch for SSN ending ${tin.slice(-4)} - verify these documents belong to the same taxpayer.`,ds.map(d=>d.id)));
    const states=[...new Set(ds.flatMap(d=>d.fields.filter(f=>f.key.endsWith("_state")&&/^[A-Za-z]{2}$/.test(f.value.trim())).map(f=>f.value.toUpperCase())))]; if(states.length>=3)out.push(external("batch_state_consistency", "state_consistency","info",`Multi-state return likely - ${states.join(", ")}.`,ds.map(d=>d.id)));
  }
  const byName=new Map<string,IntakeDoc[]>();for(const d of active){const n=normalized(docName(d));if(n)byName.set(n,[...(byName.get(n)??[]),d]);}for(const ds of byName.values()){if(new Set(ds.map(docTin).filter(Boolean)).size>1)out.push(external("batch_shared_name", "shared_name","info","Same recipient name appears with different SSNs; this could be spouses filing jointly.",ds.map(d=>d.id)));}
  const dup=new Map<string,IntakeDoc[]>();for(const d of active){const p=docPayer(d),t=docTin(d),a=primaryAmount(d);if(p&&t&&a!=null){const k=`${d.formType}|${p}|${t}|${a}`;dup.set(k,[...(dup.get(k)??[]),d]);}}for(const ds of dup.values())if(ds.length>1)out.push(external("batch_duplicate", "duplicate_document","warn",`Possible duplicate - two matching ${ds[0].formType} documents detected; confirm this isn't the same document uploaded twice.`,ds.map(d=>d.id)));
  const years=[...new Set(active.map(d=>yearOf(Object.fromEntries(d.fields.map(f=>[f.key,f.value])))).filter((y):y is number=>y!=null))];if(years.length>=2)out.push(external("batch_mixed_years", "mixed_years","warn",`Documents from multiple tax years (${years.sort().join(", ")}) - confirm you're not mixing prior-year documents into this return.`,active.map(d=>d.id)));
  return out.filter(f=>isRuleEnabled(f.ruleId));
}

export function statusFromFlags(flags: ValidationFlag[]): "needs_review" | "verify_flagged" | "clean" { if(flags.some(f=>f.severity==="error"))return "needs_review"; if(flags.some(f=>f.severity==="warn"))return "verify_flagged"; return "clean"; }
