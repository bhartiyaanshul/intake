export interface TaxConstants {
  ssWageBase: number;
  ssTaxRate: number;
  medicareRate: number;
  additionalMedicareThreshold: number;
  maxSsTaxWithheldPerEmployer: number;
  studentLoanInterestCap: number;
  charitableAcknowledgmentThreshold: number;
  form8283SectionAThreshold: number;
  form8283SectionBThreshold: number;
}

export const TAX_CONSTANTS: Record<number, TaxConstants> = {
  2023: { ssWageBase: 160200, ssTaxRate: 0.062, medicareRate: 0.0145, additionalMedicareThreshold: 200000, maxSsTaxWithheldPerEmployer: 9932.4, studentLoanInterestCap: 2500, charitableAcknowledgmentThreshold: 250, form8283SectionAThreshold: 500, form8283SectionBThreshold: 5000 },
  2024: { ssWageBase: 168600, ssTaxRate: 0.062, medicareRate: 0.0145, additionalMedicareThreshold: 200000, maxSsTaxWithheldPerEmployer: 10453.2, studentLoanInterestCap: 2500, charitableAcknowledgmentThreshold: 250, form8283SectionAThreshold: 500, form8283SectionBThreshold: 5000 },
  2025: { ssWageBase: 176100, ssTaxRate: 0.062, medicareRate: 0.0145, additionalMedicareThreshold: 200000, maxSsTaxWithheldPerEmployer: 10918.2, studentLoanInterestCap: 2500, charitableAcknowledgmentThreshold: 250, form8283SectionAThreshold: 500, form8283SectionBThreshold: 5000 },
};

export const LATEST_TAX_YEAR = 2025;

// DECISION: unknown years use the latest maintained constants so rules remain advisory instead of silently disappearing; validation emits a warning alongside the fallback.
export function constantsForYear(year: number | null): { year: number; constants: TaxConstants; usedFallback: boolean } {
  if (year != null && TAX_CONSTANTS[year]) return { year, constants: TAX_CONSTANTS[year], usedFallback: false };
  return { year: LATEST_TAX_YEAR, constants: TAX_CONSTANTS[LATEST_TAX_YEAR], usedFallback: true };
}
