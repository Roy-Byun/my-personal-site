"""Singapore personal income tax estimate (resident rates from YA2024).

Pure functions, no DB. Income earned in calendar year Y is assessed in
YA Y+1. Figures are an estimate for employment income only — not advice.
"""

from typing import List, Optional

# (upper bound of band, rate). Resident rates, YA2024 onwards.
RESIDENT_BANDS = (
    (20_000, 0.0),
    (30_000, 0.02),
    (40_000, 0.035),
    (80_000, 0.07),
    (120_000, 0.115),
    (160_000, 0.15),
    (200_000, 0.18),
    (240_000, 0.19),
    (280_000, 0.195),
    (320_000, 0.20),
    (500_000, 0.22),
    (1_000_000, 0.23),
    (float("inf"), 0.24),
)
NON_RESIDENT_EMPLOYMENT_RATE = 0.15
PERSONAL_RELIEF_CAP = 80_000
# Earned Income Relief by age band.
EARNED_INCOME_RELIEF = {"under_55": 1_000, "55_59": 6_000, "60_plus": 8_000}
# Announced one-off rebates by YA: (share of tax, cap).
KNOWN_REBATES = {2024: (0.50, 200), 2025: (0.60, 200)}


def resident_tax(chargeable: float) -> dict:
    """Progressive resident tax on chargeable income, with a per-band breakdown."""
    chargeable = max(0.0, chargeable)
    bands: List[dict] = []
    lower, total = 0.0, 0.0
    for upper, rate in RESIDENT_BANDS:
        if chargeable <= lower:
            break
        amount = min(chargeable, upper) - lower
        tax = amount * rate
        total += tax
        bands.append({"from": lower, "to": None if upper == float("inf") else upper,
                      "amount": round(amount, 2), "rate": rate, "tax": round(tax, 2)})
        lower = upper
    return {"tax": round(total, 2), "bands": bands}


def estimate(
    *,
    annual_employment_income: float,
    resident: bool = True,
    age_band: str = "under_55",
    cpf_relief: float = 0.0,
    other_reliefs: float = 0.0,
    donations: float = 0.0,
    rebate_pct: Optional[float] = None,
    rebate_cap: Optional[float] = None,
    year_of_assessment: Optional[int] = None,
) -> dict:
    """Estimate tax on a year's employment income.

    Residents: income − approved donations (2.5×) − personal reliefs (capped
    at 80,000) = chargeable income, taxed at resident rates, less any rebate.
    Non-residents: no reliefs; employment income taxed at the higher of 15%
    flat or the resident rates."""
    gross = max(0.0, float(annual_employment_income or 0))
    notes: List[str] = []
    if rebate_pct is None and year_of_assessment in KNOWN_REBATES:
        rebate_pct, rebate_cap = KNOWN_REBATES[year_of_assessment]
    rebate_pct = max(0.0, float(rebate_pct or 0))
    rebate_cap = float(rebate_cap) if rebate_cap is not None else None

    if resident:
        eir = EARNED_INCOME_RELIEF.get(age_band, EARNED_INCOME_RELIEF["under_55"])
        eir = min(eir, gross)
        reliefs_raw = eir + max(0.0, cpf_relief) + max(0.0, other_reliefs)
        reliefs = min(reliefs_raw, PERSONAL_RELIEF_CAP)
        if reliefs < reliefs_raw:
            notes.append(f"Personal reliefs capped at {PERSONAL_RELIEF_CAP:,}.")
        donation_deduction = max(0.0, donations) * 2.5
        assessable = max(0.0, gross - donation_deduction)
        chargeable = max(0.0, assessable - reliefs)
        res = resident_tax(chargeable)
        tax_before_rebate = res["tax"]
        bands = res["bands"]
        method = "resident"
    else:
        eir = reliefs = donation_deduction = 0.0
        chargeable = gross
        res = resident_tax(gross)
        flat = round(gross * NON_RESIDENT_EMPLOYMENT_RATE, 2)
        if flat >= res["tax"]:
            tax_before_rebate, method = flat, "non_resident_flat"
            bands = [{"from": 0.0, "to": None, "amount": round(gross, 2),
                      "rate": NON_RESIDENT_EMPLOYMENT_RATE, "tax": flat}]
        else:
            tax_before_rebate, method, bands = res["tax"], "non_resident_progressive", res["bands"]
        notes.append("Non-resident: no personal reliefs; employment income taxed at the higher "
                     "of 15% or resident rates.")

    rebate = tax_before_rebate * rebate_pct
    if rebate_cap is not None:
        rebate = min(rebate, rebate_cap)
    rebate = round(rebate, 2)
    tax = round(max(0.0, tax_before_rebate - rebate), 2)
    return {
        "method": method,
        "gross_income": round(gross, 2),
        "earned_income_relief": round(eir, 2),
        "total_reliefs": round(reliefs, 2),
        "donation_deduction": round(donation_deduction, 2),
        "chargeable_income": round(chargeable, 2),
        "bands": bands,
        "tax_before_rebate": round(tax_before_rebate, 2),
        "rebate": rebate,
        "tax": tax,
        "effective_rate": round(tax / gross, 4) if gross else 0.0,
        "notes": notes,
    }
