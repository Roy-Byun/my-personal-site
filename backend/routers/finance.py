"""Finance tracker API (admin-only).

Every route requires an admin user. Resources mirror the personal-finance
baseline document: a singleton profile (budget assumptions), savings goals,
accounts, a full transaction ledger, market valuations, asset allocations, and
FX rates. The /summary endpoint is the reporting brain that applies the
document's calculation rules; /baseline seeds the August-2026 starting state.
"""

from collections import defaultdict
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

import fx_fetcher
from auth_utils import require_admin
from database import get_db
from models import (
    FinanceAccount,
    FinanceAllocation,
    FinanceGoal,
    FinanceProfile,
    FinanceTransaction,
    FinanceValuation,
    FxRate,
    User,
)

router = APIRouter(prefix="/finance", tags=["finance"])

ACCOUNT_TYPES = ("cash", "investment")
RISK_ROLES = ("liquid", "low_risk", "market")
TRANSACTION_TYPES = (
    "deposit", "invest", "withdraw", "payout", "income", "spend", "tax", "transfer",
)
TRANSACTION_STATUSES = ("pending", "settled")
ASSET_CLASSES = ("equity", "fixed_income", "cash")

# Contributions grow savings; withdrawals/spend/tax reduce it. Used by the
# monthly savings-rate calculation.
SAVINGS_IN_TYPES = ("deposit", "invest")


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class ProfileOut(BaseModel):
    id: int
    base_currency: str
    goal_currency: str
    tax_resident: Optional[str]
    monthly_income: Optional[float]
    income_currency: Optional[str]
    tax_reserve: Optional[float]
    personal_allowance_min: Optional[float]
    personal_allowance_max: Optional[float]
    updated_at: datetime
    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    base_currency: Optional[str] = None
    goal_currency: Optional[str] = None
    tax_resident: Optional[str] = None
    monthly_income: Optional[float] = None
    income_currency: Optional[str] = None
    tax_reserve: Optional[float] = None
    personal_allowance_min: Optional[float] = None
    personal_allowance_max: Optional[float] = None


class GoalOut(BaseModel):
    id: int
    label: str
    target_amount: float
    target_currency: str
    target_date: Optional[date]
    note: Optional[str]
    is_primary: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class GoalCreate(BaseModel):
    label: str
    target_amount: float
    target_currency: str = "KRW"
    target_date: Optional[date] = None
    note: Optional[str] = None
    is_primary: bool = False


class GoalUpdate(BaseModel):
    label: Optional[str] = None
    target_amount: Optional[float] = None
    target_currency: Optional[str] = None
    target_date: Optional[date] = None
    note: Optional[str] = None
    is_primary: Optional[bool] = None


class AccountOut(BaseModel):
    id: int
    name: str
    institution: Optional[str]
    account_type: str
    currency: str
    risk_role: Optional[str]
    liquidity_role: Optional[str]
    planned_monthly_contribution: Optional[float]
    contribution_currency: Optional[str]
    is_active: bool
    sort_order: int
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    name: str
    institution: Optional[str] = None
    account_type: str = "cash"
    currency: str = "SGD"
    risk_role: Optional[str] = None
    liquidity_role: Optional[str] = None
    planned_monthly_contribution: Optional[float] = None
    contribution_currency: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0
    notes: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    institution: Optional[str] = None
    account_type: Optional[str] = None
    currency: Optional[str] = None
    risk_role: Optional[str] = None
    liquidity_role: Optional[str] = None
    planned_monthly_contribution: Optional[float] = None
    contribution_currency: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    notes: Optional[str] = None


class TransactionOut(BaseModel):
    id: int
    account_id: Optional[int]
    date: date
    type: str
    amount: float
    currency: str
    status: str
    category: Optional[str]
    note: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class TransactionCreate(BaseModel):
    account_id: Optional[int] = None
    date: date
    type: str
    amount: float
    currency: str = "SGD"
    status: str = "settled"
    category: Optional[str] = None
    note: Optional[str] = None


class TransactionUpdate(BaseModel):
    account_id: Optional[int] = None
    date: Optional[date] = None
    type: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None


class ValuationOut(BaseModel):
    id: int
    account_id: int
    as_of: date
    market_value: float
    currency: str
    total_return: Optional[float]
    return_percent: Optional[float]
    note: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class ValuationCreate(BaseModel):
    account_id: int
    as_of: date
    market_value: float
    currency: str = "SGD"
    total_return: Optional[float] = None
    return_percent: Optional[float] = None
    note: Optional[str] = None


class ValuationUpdate(BaseModel):
    as_of: Optional[date] = None
    market_value: Optional[float] = None
    currency: Optional[str] = None
    total_return: Optional[float] = None
    return_percent: Optional[float] = None
    note: Optional[str] = None


class AllocationOut(BaseModel):
    id: int
    account_id: int
    as_of: date
    asset_class: str
    percentage: float
    created_at: datetime
    model_config = {"from_attributes": True}


class AllocationCreate(BaseModel):
    account_id: int
    as_of: date
    asset_class: str
    percentage: float


class AllocationUpdate(BaseModel):
    as_of: Optional[date] = None
    asset_class: Optional[str] = None
    percentage: Optional[float] = None


class FxRateOut(BaseModel):
    id: int
    base: str
    quote: str
    rate: float
    as_of: datetime
    source: str
    model_config = {"from_attributes": True}


class FxManualIn(BaseModel):
    base: str
    quote: str
    rate: float


# ── Profile ──────────────────────────────────────────────────────────────────

def _get_or_create_profile(db: Session) -> FinanceProfile:
    profile = db.query(FinanceProfile).first()
    if not profile:
        profile = FinanceProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("/profile", response_model=ProfileOut)
def get_profile(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _get_or_create_profile(db)


@router.put("/profile", response_model=ProfileOut)
def update_profile(
    body: ProfileUpdate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    profile = _get_or_create_profile(db)
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, val)
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile


# ── Goals ────────────────────────────────────────────────────────────────────

def _clear_other_primary_goals(db: Session, keep_id: Optional[int]) -> None:
    q = db.query(FinanceGoal).filter(FinanceGoal.is_primary == True)  # noqa: E712
    if keep_id is not None:
        q = q.filter(FinanceGoal.id != keep_id)
    for g in q.all():
        g.is_primary = False


@router.get("/goals", response_model=List[GoalOut])
def list_goals(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return (
        db.query(FinanceGoal)
        .order_by(FinanceGoal.is_primary.desc(), FinanceGoal.target_date.asc())
        .all()
    )


@router.post("/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    body: GoalCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    goal = FinanceGoal(**body.model_dump())
    db.add(goal)
    db.flush()
    if goal.is_primary:
        _clear_other_primary_goals(db, keep_id=goal.id)
    db.commit()
    db.refresh(goal)
    return goal


@router.put("/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: int, body: GoalUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    goal = db.query(FinanceGoal).filter(FinanceGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(goal, field, val)
    if goal.is_primary:
        _clear_other_primary_goals(db, keep_id=goal.id)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    goal = db.query(FinanceGoal).filter(FinanceGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(404, "Goal not found")
    db.delete(goal)
    db.commit()


# ── Accounts ─────────────────────────────────────────────────────────────────

@router.get("/accounts", response_model=List[AccountOut])
def list_accounts(
    include_inactive: bool = Query(default=True),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(FinanceAccount)
    if not include_inactive:
        q = q.filter(FinanceAccount.is_active == True)  # noqa: E712
    return q.order_by(FinanceAccount.sort_order.asc(), FinanceAccount.id.asc()).all()


@router.post("/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    body: AccountCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    if body.account_type not in ACCOUNT_TYPES:
        raise HTTPException(400, f"account_type must be one of {ACCOUNT_TYPES}")
    account = FinanceAccount(**body.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.put("/accounts/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int, body: AccountUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    account = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    data = body.model_dump(exclude_unset=True)
    if "account_type" in data and data["account_type"] not in ACCOUNT_TYPES:
        raise HTTPException(400, f"account_type must be one of {ACCOUNT_TYPES}")
    for field, val in data.items():
        setattr(account, field, val)
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    account = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    db.query(FinanceValuation).filter(FinanceValuation.account_id == account_id).delete()
    db.query(FinanceAllocation).filter(FinanceAllocation.account_id == account_id).delete()
    # Detach transactions rather than delete them: keep the cash-flow history.
    for txn in db.query(FinanceTransaction).filter(
        FinanceTransaction.account_id == account_id
    ).all():
        txn.account_id = None
    db.delete(account)
    db.commit()


# ── Transactions ─────────────────────────────────────────────────────────────

@router.get("/transactions", response_model=List[TransactionOut])
def list_transactions(
    account_id: Optional[int] = None,
    month: Optional[str] = Query(default=None, description="YYYY-MM"),
    type: Optional[str] = None,
    status: Optional[str] = Query(default=None),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(FinanceTransaction)
    if account_id is not None:
        q = q.filter(FinanceTransaction.account_id == account_id)
    if type:
        q = q.filter(FinanceTransaction.type == type)
    if status:
        q = q.filter(FinanceTransaction.status == status)
    if month:
        try:
            year, mon = (int(x) for x in month.split("-"))
            start = date(year, mon, 1)
            end = date(year + (mon == 12), (mon % 12) + 1, 1)
        except (ValueError, TypeError):
            raise HTTPException(400, "month must be formatted YYYY-MM")
        q = q.filter(FinanceTransaction.date >= start, FinanceTransaction.date < end)
    return q.order_by(FinanceTransaction.date.desc(), FinanceTransaction.id.desc()).all()


@router.post("/transactions", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    body: TransactionCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    if body.type not in TRANSACTION_TYPES:
        raise HTTPException(400, f"type must be one of {TRANSACTION_TYPES}")
    if body.status not in TRANSACTION_STATUSES:
        raise HTTPException(400, f"status must be one of {TRANSACTION_STATUSES}")
    if body.account_id is not None and not db.query(FinanceAccount).filter(
        FinanceAccount.id == body.account_id
    ).first():
        raise HTTPException(400, "account_id does not exist")
    txn = FinanceTransaction(**body.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.put("/transactions/{txn_id}", response_model=TransactionOut)
def update_transaction(
    txn_id: int, body: TransactionUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    txn = db.query(FinanceTransaction).filter(FinanceTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    data = body.model_dump(exclude_unset=True)
    if "type" in data and data["type"] not in TRANSACTION_TYPES:
        raise HTTPException(400, f"type must be one of {TRANSACTION_TYPES}")
    if "status" in data and data["status"] not in TRANSACTION_STATUSES:
        raise HTTPException(400, f"status must be one of {TRANSACTION_STATUSES}")
    for field, val in data.items():
        setattr(txn, field, val)
    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/transactions/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    txn_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    txn = db.query(FinanceTransaction).filter(FinanceTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    db.delete(txn)
    db.commit()


# ── Valuations ───────────────────────────────────────────────────────────────

@router.get("/valuations", response_model=List[ValuationOut])
def list_valuations(
    account_id: Optional[int] = None,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(FinanceValuation)
    if account_id is not None:
        q = q.filter(FinanceValuation.account_id == account_id)
    return q.order_by(FinanceValuation.as_of.desc(), FinanceValuation.id.desc()).all()


@router.post("/valuations", response_model=ValuationOut, status_code=status.HTTP_201_CREATED)
def create_valuation(
    body: ValuationCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    if not db.query(FinanceAccount).filter(FinanceAccount.id == body.account_id).first():
        raise HTTPException(400, "account_id does not exist")
    val = FinanceValuation(**body.model_dump())
    db.add(val)
    db.commit()
    db.refresh(val)
    return val


@router.put("/valuations/{val_id}", response_model=ValuationOut)
def update_valuation(
    val_id: int, body: ValuationUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    val = db.query(FinanceValuation).filter(FinanceValuation.id == val_id).first()
    if not val:
        raise HTTPException(404, "Valuation not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(val, field, value)
    db.commit()
    db.refresh(val)
    return val


@router.delete("/valuations/{val_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_valuation(
    val_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    val = db.query(FinanceValuation).filter(FinanceValuation.id == val_id).first()
    if not val:
        raise HTTPException(404, "Valuation not found")
    db.delete(val)
    db.commit()


# ── Allocations ──────────────────────────────────────────────────────────────

@router.get("/allocations", response_model=List[AllocationOut])
def list_allocations(
    account_id: Optional[int] = None,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(FinanceAllocation)
    if account_id is not None:
        q = q.filter(FinanceAllocation.account_id == account_id)
    return q.order_by(FinanceAllocation.as_of.desc(), FinanceAllocation.id.desc()).all()


@router.post("/allocations", response_model=AllocationOut, status_code=status.HTTP_201_CREATED)
def create_allocation(
    body: AllocationCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    if body.asset_class not in ASSET_CLASSES:
        raise HTTPException(400, f"asset_class must be one of {ASSET_CLASSES}")
    if not db.query(FinanceAccount).filter(FinanceAccount.id == body.account_id).first():
        raise HTTPException(400, "account_id does not exist")
    alloc = FinanceAllocation(**body.model_dump())
    db.add(alloc)
    db.commit()
    db.refresh(alloc)
    return alloc


@router.put("/allocations/{alloc_id}", response_model=AllocationOut)
def update_allocation(
    alloc_id: int, body: AllocationUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    alloc = db.query(FinanceAllocation).filter(FinanceAllocation.id == alloc_id).first()
    if not alloc:
        raise HTTPException(404, "Allocation not found")
    data = body.model_dump(exclude_unset=True)
    if "asset_class" in data and data["asset_class"] not in ASSET_CLASSES:
        raise HTTPException(400, f"asset_class must be one of {ASSET_CLASSES}")
    for field, val in data.items():
        setattr(alloc, field, val)
    db.commit()
    db.refresh(alloc)
    return alloc


@router.delete("/allocations/{alloc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_allocation(
    alloc_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    alloc = db.query(FinanceAllocation).filter(FinanceAllocation.id == alloc_id).first()
    if not alloc:
        raise HTTPException(404, "Allocation not found")
    db.delete(alloc)
    db.commit()


# ── FX ───────────────────────────────────────────────────────────────────────

@router.get("/fx", response_model=List[FxRateOut])
def list_fx(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Latest effective rate per (base, quote) pair."""
    rows = db.query(FxRate).order_by(FxRate.as_of.desc(), FxRate.id.desc()).all()
    latest: dict = {}
    for r in rows:
        key = (r.base, r.quote)
        if key not in latest:
            latest[key] = r
    return list(latest.values())


@router.put("/fx", response_model=FxRateOut)
def set_manual_fx(
    body: FxManualIn, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    rate = FxRate(
        base=body.base.upper(), quote=body.quote.upper(),
        rate=float(body.rate), as_of=datetime.utcnow(), source="manual",
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.post("/fx/sync")
def sync_fx(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    count = fx_fetcher.fetch_fx_rates(db)
    if count == 0:
        raise HTTPException(502, "Failed to fetch FX rates from all sources")
    return {"stored": count}


# ── Summary (reporting brain) ────────────────────────────────────────────────

def _account_balance(db: Session, account: FinanceAccount) -> tuple[float, float]:
    """Return (settled_value, pending_value) in the account's native currency.

    Investment accounts: value = latest market valuation (already includes
    returns/payouts). Pending contributions are added on top from pending
    transactions. Cash accounts: value = sum of settled transactions, signed by
    type; pending shown separately.
    """
    settled_txns = db.query(FinanceTransaction).filter(
        FinanceTransaction.account_id == account.id
    ).all()

    def signed(txn: FinanceTransaction) -> float:
        if txn.type in ("deposit", "invest", "payout", "income"):
            return txn.amount
        if txn.type in ("withdraw", "spend", "tax"):
            return -txn.amount
        return 0.0  # transfer handled by paired rows

    pending = sum(t.amount for t in settled_txns if t.status == "pending"
                  and t.type in ("deposit", "invest"))

    if account.account_type == "investment":
        latest_val = db.query(FinanceValuation).filter(
            FinanceValuation.account_id == account.id
        ).order_by(FinanceValuation.as_of.desc(), FinanceValuation.id.desc()).first()
        base = latest_val.market_value if latest_val else sum(
            signed(t) for t in settled_txns if t.status == "settled"
        )
        return (base, pending)

    settled = sum(signed(t) for t in settled_txns if t.status == "settled")
    return (settled, pending)


@router.get("/summary")
def summary(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    accounts = db.query(FinanceAccount).order_by(
        FinanceAccount.sort_order.asc(), FinanceAccount.id.asc()
    ).all()

    base_ccy = profile.base_currency or "SGD"

    by_currency_settled: dict = defaultdict(float)
    by_currency_pending: dict = defaultdict(float)
    risk_split = {"liquid": 0.0, "low_risk": 0.0, "market": 0.0, "unclassified": 0.0}
    account_rows = []
    fx_notes = {}   # rate provenance for conversions we perform

    net_base_settled = 0.0
    net_base_after_pending = 0.0

    for acc in accounts:
        settled, pending = _account_balance(db, acc)
        after = settled + pending
        by_currency_settled[acc.currency] += settled
        by_currency_pending[acc.currency] += pending

        # Convert to base currency for the combined net worth.
        conv = fx_fetcher.convert(db, settled, acc.currency, base_ccy)
        conv_after = fx_fetcher.convert(db, after, acc.currency, base_ccy)
        settled_base = conv[0] if conv else (settled if acc.currency == base_ccy else None)
        after_base = conv_after[0] if conv_after else (after if acc.currency == base_ccy else None)
        if conv and acc.currency != base_ccy:
            fx_notes[f"{acc.currency}->{base_ccy}"] = {
                "rate": conv[1], "as_of": conv[2].isoformat(),
            }
        if settled_base is not None:
            net_base_settled += settled_base
        if after_base is not None:
            net_base_after_pending += after_base

        role = acc.risk_role if acc.risk_role in risk_split else "unclassified"
        if after_base is not None:
            risk_split[role] += after_base

        account_rows.append({
            "id": acc.id, "name": acc.name, "institution": acc.institution,
            "account_type": acc.account_type, "currency": acc.currency,
            "risk_role": acc.risk_role,
            "settled": round(settled, 2), "pending": round(pending, 2),
            "after_pending": round(after, 2),
            "settled_base": round(settled_base, 2) if settled_base is not None else None,
            "after_pending_base": round(after_base, 2) if after_base is not None else None,
        })

    # Primary goal progress (kept separate from account performance).
    goal = (
        db.query(FinanceGoal).filter(FinanceGoal.is_primary == True)  # noqa: E712
        .first()
        or db.query(FinanceGoal).order_by(FinanceGoal.target_date.asc()).first()
    )
    goal_block = None
    if goal:
        goal_conv = fx_fetcher.convert(db, net_base_after_pending, base_ccy, goal.target_currency)
        current_in_goal_ccy = goal_conv[0] if goal_conv else None
        months_remaining = None
        required_monthly = None
        if goal.target_date:
            today = date.today()
            months_remaining = max(
                0,
                (goal.target_date.year - today.year) * 12
                + (goal.target_date.month - today.month),
            )
            if current_in_goal_ccy is not None and months_remaining > 0:
                gap = max(0.0, goal.target_amount - current_in_goal_ccy)
                required_monthly = gap / months_remaining
        completion = (
            (current_in_goal_ccy / goal.target_amount * 100.0)
            if current_in_goal_ccy and goal.target_amount else None
        )
        goal_block = {
            "id": goal.id, "label": goal.label,
            "target_amount": goal.target_amount, "target_currency": goal.target_currency,
            "target_date": goal.target_date.isoformat() if goal.target_date else None,
            "current_value": round(current_in_goal_ccy, 2) if current_in_goal_ccy is not None else None,
            "completion_percent": round(completion, 2) if completion is not None else None,
            "months_remaining": months_remaining,
            "required_monthly_saving_goal_ccy": round(required_monthly, 2) if required_monthly is not None else None,
            "fx_available": goal_conv is not None,
        }
        if goal_conv and base_ccy != goal.target_currency:
            fx_notes[f"{base_ccy}->{goal.target_currency}"] = {
                "rate": goal_conv[1], "as_of": goal_conv[2].isoformat(),
            }

    # This-month savings rate.
    today = date.today()
    m_start = date(today.year, today.month, 1)
    m_txns = db.query(FinanceTransaction).filter(
        FinanceTransaction.date >= m_start, FinanceTransaction.status == "settled"
    ).all()
    saved_base = 0.0
    for t in m_txns:
        if t.type in SAVINGS_IN_TYPES:
            c = fx_fetcher.convert(db, t.amount, t.currency, base_ccy)
            saved_base += c[0] if c else (t.amount if t.currency == base_ccy else 0.0)
    income = profile.monthly_income or 0.0
    if profile.income_currency and profile.income_currency != base_ccy:
        ic = fx_fetcher.convert(db, income, profile.income_currency, base_ccy)
        income = ic[0] if ic else income
    savings_rate = (saved_base / income * 100.0) if income else None

    return {
        "base_currency": base_ccy,
        "net_worth": {
            "settled_base": round(net_base_settled, 2),
            "after_pending_base": round(net_base_after_pending, 2),
            "by_currency_settled": {k: round(v, 2) for k, v in by_currency_settled.items()},
            "by_currency_pending": {k: round(v, 2) for k, v in by_currency_pending.items()},
        },
        "accounts": account_rows,
        "risk_split_base": {k: round(v, 2) for k, v in risk_split.items()},
        "goal": goal_block,
        "this_month": {
            "saved_base": round(saved_base, 2),
            "income_base": round(income, 2) if income else None,
            "savings_rate_percent": round(savings_rate, 2) if savings_rate is not None else None,
        },
        "budget": {
            "monthly_income": profile.monthly_income,
            "income_currency": profile.income_currency,
            "tax_reserve": profile.tax_reserve,
            "personal_allowance_min": profile.personal_allowance_min,
            "personal_allowance_max": profile.personal_allowance_max,
        },
        "fx_notes": fx_notes,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ── Baseline seed (August 2026 snapshot from the profile doc) ─────────────────

@router.post("/baseline")
def import_baseline(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Idempotently seed the Aug-2026 starting state. Refuses if data exists."""
    existing = (
        db.query(FinanceAccount).count()
        + db.query(FinanceTransaction).count()
        + db.query(FinanceGoal).count()
    )
    if existing:
        raise HTTPException(409, "Finance data already exists; baseline import skipped")

    snapshot = date(2026, 8, 31)

    # Profile / budget
    profile = _get_or_create_profile(db)
    profile.base_currency = "SGD"
    profile.goal_currency = "KRW"
    profile.tax_resident = "Singapore"
    profile.monthly_income = 4500.0
    profile.income_currency = "SGD"
    profile.tax_reserve = 150.0
    profile.personal_allowance_min = 800.0
    profile.personal_allowance_max = 1000.0
    profile.updated_at = datetime.utcnow()

    # Goal
    db.add(FinanceGoal(
        label="KRW 100M before National Service",
        target_amount=100_000_000.0, target_currency="KRW",
        target_date=date(2028, 11, 30),
        note="Fixed-horizon savings goal; driven mainly by regular saving.",
        is_primary=True,
    ))

    # Accounts (settled balances + pending contributions from the doc)
    accounts_spec = [
        # name, institution, type, currency, risk_role, planned, contrib_ccy,
        #   settled_balance, pending, market_value, total_return, return_pct
        ("Bank deposit / cash", "Bank", "cash", "SGD", "liquid",
         None, None, 4000.0, 0.0, None, None, None),
        ("Mari Invest Income", "Mari", "investment", "SGD", "market",
         1000.0, "SGD", None, 1000.0, 8891.23, -63.22, None),
        ("Mari Invest SavePlus", "Mari", "investment", "SGD", "low_risk",
         1000.0, "SGD", None, 1000.0, 1002.03, 2.03, 1.33),
        ("DBS DigiPortfolio", "DBS", "investment", "USD", "market",
         1000.0, "USD", None, 1000.0, 5089.08, 89.08, 1.78),
    ]

    id_by_name = {}
    for (name, inst, atype, ccy, risk, planned, cc,
         settled_bal, pending, mv, tr, rp) in accounts_spec:
        acc = FinanceAccount(
            name=name, institution=inst, account_type=atype, currency=ccy,
            risk_role=risk, liquidity_role=risk,
            planned_monthly_contribution=planned, contribution_currency=cc,
            sort_order=len(id_by_name),
        )
        db.add(acc)
        db.flush()
        id_by_name[name] = acc.id

        if atype == "cash" and settled_bal:
            db.add(FinanceTransaction(
                account_id=acc.id, date=snapshot, type="deposit",
                amount=settled_bal, currency=ccy, status="settled",
                note="Opening balance (Aug 2026 baseline)",
            ))
        if atype == "investment" and mv is not None:
            db.add(FinanceValuation(
                account_id=acc.id, as_of=snapshot, market_value=mv, currency=ccy,
                total_return=tr, return_percent=rp,
                note="Aug 2026 baseline snapshot",
            ))
        if pending:
            db.add(FinanceTransaction(
                account_id=acc.id, date=snapshot, type="invest",
                amount=pending, currency=cc or ccy, status="pending",
                note="Pending contribution (Aug 2026 baseline)",
            ))

    # DigiPortfolio allocation ~51/47/3
    digi_id = id_by_name.get("DBS DigiPortfolio")
    if digi_id:
        for cls, pct in (("equity", 51.0), ("fixed_income", 47.0), ("cash", 3.0)):
            db.add(FinanceAllocation(
                account_id=digi_id, as_of=snapshot, asset_class=cls, percentage=pct,
            ))

    db.commit()

    # Best-effort live FX so conversions work immediately (ignore failure).
    try:
        fx_fetcher.fetch_fx_rates(db)
    except Exception:  # noqa: BLE001
        pass

    return {"status": "seeded", "accounts": len(accounts_spec)}
