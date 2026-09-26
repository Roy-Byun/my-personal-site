"""Ledger helpers shared by the finance routers, the import pipeline and the
scheduler jobs: FX snapshot, base-currency locking, computed balances, two-leg
transfers and category roll-ups.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import (
    FinanceAccount,
    FinanceCategory,
    FinanceProfile,
    FinanceTransaction,
    FinanceValuation,
    FxRate,
)

from . import constants as C
from .fingerprint import transaction_fingerprint


class FxIndex:
    """In-memory snapshot of the latest FX rate per directed pair, built with a
    single query. Conversions are pure-Python so /summary stays fast even as the
    fx_rates table grows (one sync writes 3 rows every 12h, forever)."""

    def __init__(self, db: Session):
        self._rates: dict = {}
        self._asof: dict = {}
        latest_ids = select(func.max(FxRate.id)).group_by(FxRate.base, FxRate.quote)
        for r in db.query(FxRate).filter(FxRate.id.in_(latest_ids)).all():
            self._rates[(r.base, r.quote)] = r.rate
            self._asof[(r.base, r.quote)] = r.as_of

    def as_of(self, frm: str, to: str):
        return self._asof.get((frm.upper(), to.upper()))

    def rate(self, frm: str, to: str) -> Optional[float]:
        frm, to = frm.upper(), to.upper()
        if frm == to:
            return 1.0
        direct = self._rates.get((frm, to))
        if direct:
            return direct
        inv = self._rates.get((to, frm))
        if inv:
            return 1.0 / inv
        if frm != "USD" and to != "USD":
            leg1, leg2 = self._rates.get((frm, "USD")), self._rates.get(("USD", to))
            if not leg1 and self._rates.get(("USD", frm)):
                leg1 = 1.0 / self._rates[("USD", frm)]
            if not leg2 and self._rates.get((to, "USD")):
                leg2 = 1.0 / self._rates[(to, "USD")]
            if leg1 and leg2:
                return leg1 * leg2
        return None

    def to_base(self, amount: Optional[float], ccy: str, base: str) -> Optional[float]:
        if amount is None:
            return None
        if ccy == base:
            return float(amount)
        r = self.rate(ccy, base)
        return None if r is None else float(amount) * r


def get_profile(db: Session) -> FinanceProfile:
    profile = db.query(FinanceProfile).first()
    if not profile:
        profile = FinanceProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def base_currency(db: Session) -> str:
    return get_profile(db).base_currency or "SGD"


def lock_base_amount(txn: FinanceTransaction, idx: FxIndex, base: str) -> None:
    """Fix the base-currency value at entry time (decision D4). Past months
    never re-value; None means no rate was known and reports fall back to
    current FX."""
    txn.base_currency = base
    if txn.currency == base:
        txn.amount_base = txn.amount
    elif txn.original_currency == base and txn.original_amount is not None:
        # The statement already tells us the base-currency value.
        txn.amount_base = abs(txn.original_amount) * (1 if txn.amount >= 0 else -1)
    else:
        v = idx.to_base(txn.amount, txn.currency, base)
        txn.amount_base = round(v, 2) if v is not None else None


def base_value(txn: FinanceTransaction, idx: FxIndex, base: str) -> float:
    """Locked base value when it was locked in this base currency, else current FX."""
    if txn.amount_base is not None and (txn.base_currency or base) == base:
        return float(txn.amount_base)
    v = idx.to_base(txn.amount, txn.currency, base)
    return v if v is not None else 0.0


def fingerprint_for(txn: FinanceTransaction, account: Optional[FinanceAccount]) -> str:
    ref = (account.external_ref or str(account.id)) if account else ""
    return transaction_fingerprint(
        ref, txn.transaction_date, txn.description_raw, txn.amount, txn.currency
    )


# ── Balances ─────────────────────────────────────────────────────────────────

def account_balances(
    db: Session, accounts: List[FinanceAccount], as_of: Optional[date] = None
) -> Dict[int, Tuple[float, float]]:
    """{account_id: (settled_value, pending_value)} in the account's currency.

    Cash-like accounts: opening_balance + Σ settled signed amounts.
    Investment accounts with a valuation: latest market value + Σ settled
    amounts dated after that valuation (contributions made since).
    Pending = Σ pending signed amounts, shown separately.
    Liabilities carry negative balances (money owed).
    """
    ids = [a.id for a in accounts]
    if not ids:
        return {}
    q = db.query(FinanceTransaction).filter(FinanceTransaction.account_id.in_(ids))
    if as_of is not None:
        q = q.filter(FinanceTransaction.transaction_date <= as_of)
    txns_by_acc: dict = defaultdict(list)
    for t in q.all():
        txns_by_acc[t.account_id].append(t)

    latest_val: dict = {}
    vq = db.query(FinanceValuation).filter(FinanceValuation.account_id.in_(ids))
    if as_of is not None:
        vq = vq.filter(FinanceValuation.as_of <= as_of)
    for v in vq.order_by(FinanceValuation.as_of.desc(), FinanceValuation.id.desc()).all():
        latest_val.setdefault(v.account_id, v)

    out: dict = {}
    for acc in accounts:
        ts = txns_by_acc.get(acc.id, [])
        pending = sum(t.amount for t in ts if t.status == "pending")
        val = latest_val.get(acc.id) if acc.account_type == "investment" else None
        if val is not None:
            settled = val.market_value + sum(
                t.amount for t in ts if t.status == "settled" and t.transaction_date > val.as_of
            )
        else:
            settled = float(acc.opening_balance or 0.0) + sum(
                t.amount for t in ts if t.status == "settled"
            )
        out[acc.id] = (round(settled, 2), round(pending, 2))
    return out


def net_contributions(db: Session, accounts: List[FinanceAccount]) -> Dict[int, float]:
    """Opening balance + settled transfers in/out, per account (decision D7:
    unrealised gain = market value − net contributions; dividends/interest are
    income, never mixed into the gain)."""
    ids = [a.id for a in accounts]
    out = {a.id: float(a.opening_balance or 0.0) for a in accounts}
    if not ids:
        return out
    for t in db.query(FinanceTransaction).filter(
        FinanceTransaction.account_id.in_(ids),
        FinanceTransaction.status == "settled",
        FinanceTransaction.transaction_type.in_(C.TRANSFER_TYPES),
    ).all():
        out[t.account_id] += t.amount
    return out


# ── Transfers ────────────────────────────────────────────────────────────────

def counter_amount(amount: float, frm_ccy: str, to_ccy: str, idx: FxIndex) -> Tuple[float, str]:
    """The opposite leg's amount in the counter-account's currency."""
    if frm_ccy == to_ccy:
        return -amount, frm_ccy
    r = idx.rate(frm_ccy, to_ccy)
    if r is None:
        return -amount, frm_ccy   # no rate: keep source currency; FX converts at report time
    return round(-amount * r, 2), to_ccy


def create_counter_leg(
    db: Session, leg: FinanceTransaction, counter: FinanceAccount,
    idx: FxIndex, base: str, source: str = "auto_leg",
) -> FinanceTransaction:
    """Materialise the other side of `leg` (decision D3) and link both."""
    group = leg.transfer_group_id or str(uuid.uuid4())
    leg.transfer_group_id = group
    leg.transfer_account_id = counter.id
    amt, ccy = counter_amount(leg.amount, leg.currency, counter.currency, idx)
    other = FinanceTransaction(
        account_id=counter.id,
        transaction_date=leg.transaction_date,
        description_raw=leg.description_raw,
        merchant_normalized=leg.merchant_normalized,
        transaction_type=leg.transaction_type,
        amount=amt, currency=ccy,
        category_id=leg.category_id,
        status=leg.status,
        transfer_account_id=leg.account_id,
        transfer_group_id=group,
        source=source,
        import_id=leg.import_id,
        notes=leg.notes,
    )
    lock_base_amount(other, idx, base)
    db.add(other)
    return other


def find_matching_leg(
    db: Session, account_id: int, amount: float, currency: str, on: date,
    counter_account_id: Optional[int] = None, window_days: int = 3,
) -> Optional[FinanceTransaction]:
    """An existing leg in `account_id` for exactly `amount`, within ±window_days,
    so two statements' views of one transfer are linked, not double-counted.

    With counter_account_id: a leg we synthesised (source "auto_leg") from the
    counter-account's statement. Without: an unlinked transfer leg.
    """
    from datetime import timedelta

    q = db.query(FinanceTransaction).filter(
        FinanceTransaction.account_id == account_id,
        FinanceTransaction.currency == currency,
        FinanceTransaction.transaction_date >= on - timedelta(days=window_days),
        FinanceTransaction.transaction_date <= on + timedelta(days=window_days),
        FinanceTransaction.transaction_type.in_(C.TRANSFER_TYPES),
    )
    if counter_account_id is not None:
        q = q.filter(FinanceTransaction.source == "auto_leg",
                     FinanceTransaction.transfer_account_id == counter_account_id)
    else:
        q = q.filter(FinanceTransaction.transfer_group_id.is_(None))
    for t in q.order_by(FinanceTransaction.id.asc()).all():
        if abs(t.amount - amount) < 0.005:
            return t
    return None


def transfer_legs(db: Session, txn: FinanceTransaction) -> List[FinanceTransaction]:
    if not txn.transfer_group_id:
        return [txn]
    return db.query(FinanceTransaction).filter(
        FinanceTransaction.transfer_group_id == txn.transfer_group_id
    ).all()


# ── Categories ───────────────────────────────────────────────────────────────

class CategoryIndex:
    """Resolve categories by id or by (parent slug, child slug)."""

    def __init__(self, cats: Iterable[FinanceCategory]):
        self.by_id = {c.id: c for c in cats}
        self.top_by_slug: Dict[str, FinanceCategory] = {}
        self.child_by_slug: Dict[Tuple[int, str], FinanceCategory] = {}
        self.any_child_by_slug: Dict[str, FinanceCategory] = {}
        for c in self.by_id.values():
            s = C.slugify(c.name)
            if c.parent_id is None:
                self.top_by_slug.setdefault(s, c)
            else:
                self.child_by_slug.setdefault((c.parent_id, s), c)
                self.any_child_by_slug.setdefault(s, c)

    def top(self, cat_id: Optional[int]) -> Optional[FinanceCategory]:
        c = self.by_id.get(cat_id)
        while c is not None and c.parent_id is not None and c.parent_id in self.by_id:
            c = self.by_id[c.parent_id]
        return c

    def kind(self, cat_id: Optional[int]) -> Optional[str]:
        top = self.top(cat_id)
        return top.kind if top else None

    def resolve(self, category: Optional[str], subcategory: Optional[str]):
        """-> (category_id or None, list of problems)."""
        problems: List[str] = []
        if not category or C.slugify(category) == C.UNCATEGORISED:
            return None, ["uncategorised" if category else "missing_category"]
        parent = self.top_by_slug.get(C.slugify(category))
        if parent is None:
            # The AI may have given a subcategory as the category.
            child = self.any_child_by_slug.get(C.slugify(category))
            if child is not None and not subcategory:
                return child.id, []
            return None, [f"unknown_category:{category}"]
        if subcategory:
            child = self.child_by_slug.get((parent.id, C.slugify(subcategory)))
            if child is None:
                problems.append(f"subcategory_not_in_category:{subcategory}")
                return parent.id, problems
            return child.id, []
        return parent.id, []

    def path(self, cat_id: Optional[int]) -> Optional[str]:
        c = self.by_id.get(cat_id)
        if c is None:
            return None
        if c.parent_id and c.parent_id in self.by_id:
            return f"{self.by_id[c.parent_id].name} › {c.name}"
        return c.name


def seed_default_categories(db: Session) -> int:
    """Insert the default taxonomy entries that don't already exist."""
    existing = CategoryIndex(db.query(FinanceCategory).all())
    added = 0
    order = len(existing.by_id)
    for slug, (kind, subs) in C.DEFAULT_CATEGORIES.items():
        parent = existing.top_by_slug.get(slug)
        if parent is None:
            parent = FinanceCategory(name=C.display_name(slug), kind=kind, sort_order=order)
            db.add(parent)
            db.flush()
            order += 1
            added += 1
        for i, sub in enumerate(subs):
            if (parent.id, sub) in existing.child_by_slug:
                continue
            db.add(FinanceCategory(
                name=C.display_name(sub), kind=parent.kind, parent_id=parent.id, sort_order=i,
            ))
            added += 1
    if added:
        db.commit()
    return added
