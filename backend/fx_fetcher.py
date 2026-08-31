"""Foreign-exchange rates for the finance tracker.

Rates are stored in the ``fx_rates`` table as directed pairs ("1 base = rate
quote"). We keep every observation (with a timestamp and a source flag) so a
currency conversion can always be reproduced with the exact rate that was in
effect. Manual overrides are stored as ``source="manual"`` and win over live
rates whenever they are the most recent observation for a pair.

Live rates come from Frankfurter (ECB reference rates, free, no API key). If
that request fails we fall back to open.er-api.com. Failures are logged and
swallowed — the scheduled job must never crash the app, exactly like the news
and GitHub sync jobs.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple

import requests
from sqlalchemy.orm import Session

from models import FxRate

# Keep the fx_rates table small — only the newest rate per pair is ever used.
_RETENTION_DAYS = 90

logger = logging.getLogger(__name__)

# Directed pairs we care about for this profile (SGD base currency, USD holdings,
# KRW goal). Storing all three avoids relying on inverse math where we can get a
# direct quote.
TRACKED_PAIRS: Tuple[Tuple[str, str], ...] = (
    ("USD", "SGD"),
    ("SGD", "KRW"),
    ("USD", "KRW"),
)

FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"
ERAPI_URL = "https://open.er-api.com/v6/latest"
_TIMEOUT = 15


def _record_rate(db: Session, base: str, quote: str, rate: float, as_of: datetime) -> None:
    db.add(FxRate(base=base, quote=quote, rate=float(rate), as_of=as_of, source="live"))


def _fetch_from_frankfurter() -> Optional[dict]:
    """Return {(base, quote): rate} for TRACKED_PAIRS, or None on failure."""
    bases = {base for base, _ in TRACKED_PAIRS}
    out: dict = {}
    for base in bases:
        symbols = ",".join(sorted({q for b, q in TRACKED_PAIRS if b == base}))
        resp = requests.get(
            FRANKFURTER_URL, params={"base": base, "symbols": symbols}, timeout=_TIMEOUT
        )
        resp.raise_for_status()
        data = resp.json()
        rates = data.get("rates") or {}
        for quote, rate in rates.items():
            out[(base, quote)] = float(rate)
    return out or None


def _fetch_from_erapi() -> Optional[dict]:
    out: dict = {}
    bases = {base for base, _ in TRACKED_PAIRS}
    for base in bases:
        resp = requests.get(f"{ERAPI_URL}/{base}", timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if data.get("result") != "success":
            continue
        rates = data.get("rates") or {}
        for b, quote in TRACKED_PAIRS:
            if b == base and quote in rates:
                out[(base, quote)] = float(rates[quote])
    return out or None


def fetch_fx_rates(db: Session) -> int:
    """Fetch and persist live rates for all tracked pairs. Returns count stored."""
    pairs = None
    try:
        pairs = _fetch_from_frankfurter()
    except Exception as exc:  # noqa: BLE001 - log and try fallback
        logger.warning("Frankfurter FX fetch failed: %s", exc)

    if not pairs:
        try:
            pairs = _fetch_from_erapi()
        except Exception as exc:  # noqa: BLE001
            logger.warning("er-api FX fetch failed: %s", exc)

    if not pairs:
        logger.error("FX fetch failed from all sources; no rates stored")
        return 0

    now = datetime.utcnow()
    stored = 0
    for (base, quote), rate in pairs.items():
        _record_rate(db, base, quote, rate, now)
        stored += 1
    db.commit()
    logger.info("Stored %d live FX rates", stored)

    # Housekeeping: drop history older than the retention window (never the
    # newest row for a pair — those are all from `now`).
    try:
        cutoff = now - timedelta(days=_RETENTION_DAYS)
        deleted = db.query(FxRate).filter(FxRate.as_of < cutoff).delete(
            synchronize_session=False
        )
        db.commit()
        if deleted:
            logger.info("Pruned %d FX rows older than %d days", deleted, _RETENTION_DAYS)
    except Exception as exc:  # noqa: BLE001
        logger.warning("FX prune failed: %s", exc)
        db.rollback()

    return stored


def get_rate(db: Session, base: str, quote: str) -> Optional[Tuple[float, datetime, str]]:
    """Return the most recent effective (rate, as_of, source) for base→quote.

    Tries the direct pair first, then the inverse pair (reciprocal). Manual and
    live are both considered; whichever observation is newest wins.
    """
    base, quote = base.upper(), quote.upper()
    if base == quote:
        return (1.0, datetime.utcnow(), "identity")

    direct = (
        db.query(FxRate)
        .filter(FxRate.base == base, FxRate.quote == quote)
        .order_by(FxRate.as_of.desc(), FxRate.id.desc())
        .first()
    )
    if direct and direct.rate:
        return (direct.rate, direct.as_of, direct.source)

    inverse = (
        db.query(FxRate)
        .filter(FxRate.base == quote, FxRate.quote == base)
        .order_by(FxRate.as_of.desc(), FxRate.id.desc())
        .first()
    )
    if inverse and inverse.rate:
        return (1.0 / inverse.rate, inverse.as_of, inverse.source)

    return None


def convert(
    db: Session, amount: float, from_ccy: str, to_ccy: str
) -> Optional[Tuple[float, float, datetime]]:
    """Convert amount from_ccy→to_ccy. Returns (value, rate, as_of) or None.

    Callers should store the returned rate + timestamp alongside any derived
    value so the conversion stays reproducible.
    """
    if amount is None:
        return None
    from_ccy, to_ccy = from_ccy.upper(), to_ccy.upper()
    if from_ccy == to_ccy:
        return (float(amount), 1.0, datetime.utcnow())

    found = get_rate(db, from_ccy, to_ccy)
    if found:
        rate, as_of, _ = found
        return (float(amount) * rate, rate, as_of)

    # Triangulate through USD as a last resort (e.g. SGD→KRW via SGD→USD→KRW).
    via = "USD"
    if from_ccy != via and to_ccy != via:
        leg1 = get_rate(db, from_ccy, via)
        leg2 = get_rate(db, via, to_ccy)
        if leg1 and leg2:
            rate = leg1[0] * leg2[0]
            as_of = min(leg1[1], leg2[1])
            return (float(amount) * rate, rate, as_of)

    return None
