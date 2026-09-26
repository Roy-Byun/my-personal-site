// Shared currency/number formatting for the finance tracker.

const SYMBOL = { SGD: "S$", USD: "US$", KRW: "₩", JPY: "¥", EUR: "€", GBP: "£" };
// Currencies quoted without minor units.
const ZERO_DECIMAL = new Set(["KRW", "JPY"]);

export function fmtMoney(amount, ccy = "SGD") {
  if (amount == null || Number.isNaN(amount)) return "—";
  const sym = SYMBOL[ccy] ?? `${ccy} `;
  const digits = ZERO_DECIMAL.has(ccy) ? 0 : 2;
  return `${sym}${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  })}`;
}

export function fmtPct(v) {
  return v == null ? "—" : `${Number(v).toFixed(1)}%`;
}
