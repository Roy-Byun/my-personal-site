"""Advisory transaction fingerprint for duplicate detection.

IMPORTANT: this is a FLAG, not an authority. Bank statements tweak raw
descriptions between interim/final versions and embed timestamps in PayNow refs,
so the same transaction can hash two ways; conversely two genuinely different
small purchases (two identical $4.50 coffees, same shop, same day) can collide.
Always surface a match for review rather than silently discarding — and pair
this with `line_index` within a batch so re-importing the same statement dedupes
cleanly. See docs/decisions.md.
"""
import hashlib
from decimal import Decimal


def _normalise_amount(amount) -> str:
    # normalise so -28.66 and -28.660 and "-28.66" all hash identically
    return f"{Decimal(str(amount)):.2f}"


def transaction_fingerprint(
    account_ref: str,
    transaction_date,  # date or ISO string
    description_raw: str,
    amount,
    currency: str,
) -> str:
    parts = [
        (account_ref or "").strip().lower(),
        str(transaction_date),
        (description_raw or "").strip().lower(),
        _normalise_amount(amount),
        (currency or "").strip().upper(),
    ]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
