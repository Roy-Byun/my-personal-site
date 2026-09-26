"""Finance tracker API (admin-only).

Every route requires an admin user. Resources: a singleton profile (budget
assumptions), savings goals, accounts, a signed transaction ledger with two-leg
transfers, market valuations, asset allocations, categories (with
subcategories), recurring items, month-end closes and FX rates. /summary is the
reporting brain; /baseline seeds the August-2026 starting state. Statement
imports and merchant rules live in routers/finance_imports.py.

Ledger model (docs/finance/decisions.md): amounts are signed in the account's
currency; meaning comes from transaction_type; transfers between own accounts
are never income or spending; amount_base is locked at entry time.
"""

import calendar
import time
import uuid
from collections import defaultdict
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import fx_fetcher
from auth_utils import require_admin
from database import get_db
from finance import constants as C
from finance import ledger
from finance.ledger import CategoryIndex, FxIndex
from models import (
    FinanceAccount,
    FinanceAllocation,
    FinanceCategory,
    FinanceGoal,
    FinanceImportTransaction,
    FinanceMerchantRule,
    FinanceMonthlyClose,
    FinanceRecurring,
    FinanceTransaction,
    FinanceValuation,
    FxRate,
    User,
)

router = APIRouter(prefix="/finance", tags=["finance"])

ASSET_CLASSES = ("equity", "fixed_income", "cash")
RECURRING_TYPES = ("expense", "income")
# Accounts whose inflows count as "saved" in the savings rate.
SAVINGS_ACCOUNT_TYPES = ("savings", "investment")


def invalidate_summary_cache() -> None:
    _summary_cache.clear()


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
    emergency_fund_opening: Optional[float]
    alert_email: Optional[str]
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
    emergency_fund_opening: Optional[float] = None
    alert_email: Optional[str] = None


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
    external_ref: Optional[str]
    masked_identifier: Optional[str]
    opening_balance: float
    include_in_net_worth: bool
    risk_role: Optional[str]
    liquidity_role: Optional[str]
    planned_monthly_contribution: Optional[float]
    contribution_currency: Optional[str]
    is_active: bool
    sort_order: int
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    # computed (native currency)
    balance: Optional[float] = None
    pending: Optional[float] = None
    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    name: str
    institution: Optional[str] = None
    account_type: str = "cash"
    currency: str = "SGD"
    external_ref: Optional[str] = None
    masked_identifier: Optional[str] = None
    opening_balance: float = 0.0
    include_in_net_worth: bool = True
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
    external_ref: Optional[str] = None
    masked_identifier: Optional[str] = None
    opening_balance: Optional[float] = None
    include_in_net_worth: Optional[bool] = None
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
    transaction_date: date
    posting_date: Optional[date]
    description_raw: str
    merchant_normalized: Optional[str]
    transaction_type: str
    amount: float
    currency: str
    original_amount: Optional[float]
    original_currency: Optional[str]
    exchange_rate: Optional[float]
    amount_base: Optional[float]
    base_currency: Optional[str]
    category_id: Optional[int]
    status: str
    is_fixed_expense: bool
    transfer_account_id: Optional[int]
    transfer_group_id: Optional[str]
    recurring_id: Optional[int]
    source: str
    import_id: Optional[int]
    notes: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class TransactionCreate(BaseModel):
    account_id: Optional[int] = None
    transaction_date: date
    posting_date: Optional[date] = None
    description_raw: str = ""
    merchant_normalized: Optional[str] = None
    transaction_type: str
    amount: float = Field(description="signed: money in = +, money out = −")
    currency: Optional[str] = None           # defaults to the account's currency
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    category_id: Optional[int] = None
    status: str = "settled"
    is_fixed_expense: bool = False
    # For transfer types: the other own account → a linked counter leg is created.
    transfer_account_id: Optional[int] = None
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    account_id: Optional[int] = None
    transaction_date: Optional[date] = None
    posting_date: Optional[date] = None
    description_raw: Optional[str] = None
    merchant_normalized: Optional[str] = None
    transaction_type: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    category_id: Optional[int] = None
    status: Optional[str] = None
    is_fixed_expense: Optional[bool] = None
    notes: Optional[str] = None


class TransferCreate(BaseModel):
    """Move money between two own accounts: materialised as two linked legs."""
    from_account_id: int
    to_account_id: int
    amount: float = Field(gt=0, description="positive magnitude leaving from_account")
    to_amount: Optional[float] = Field(default=None, gt=0, description="arriving amount if currencies differ")
    transaction_date: date
    transaction_type: str = "transfer"      # transfer | investment_contribution | investment_withdrawal
    status: str = "settled"
    description_raw: Optional[str] = None
    category_id: Optional[int] = None
    notes: Optional[str] = None


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

_get_or_create_profile = ledger.get_profile


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
    invalidate_summary_cache()
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
    invalidate_summary_cache()
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
    invalidate_summary_cache()
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
    invalidate_summary_cache()


# ── Accounts ─────────────────────────────────────────────────────────────────

def _validate_account(db: Session, data: dict, account_id: Optional[int] = None) -> None:
    if "account_type" in data and data["account_type"] not in C.ACCOUNT_TYPES:
        raise HTTPException(400, f"account_type must be one of {C.ACCOUNT_TYPES}")
    if "external_ref" in data:
        ref = (data["external_ref"] or "").strip() or None
        data["external_ref"] = ref
        if ref:
            clash = db.query(FinanceAccount).filter(FinanceAccount.external_ref == ref)
            if account_id is not None:
                clash = clash.filter(FinanceAccount.id != account_id)
            if clash.first():
                raise HTTPException(400, f"Another account already uses external_ref {ref!r}")


def _with_balances(db: Session, accounts: List[FinanceAccount]) -> List[AccountOut]:
    bals = ledger.account_balances(db, accounts)
    out = []
    for a in accounts:
        row = AccountOut.model_validate(a)
        row.balance, row.pending = bals.get(a.id, (None, None))
        out.append(row)
    return out


@router.get("/accounts", response_model=List[AccountOut])
def list_accounts(
    include_inactive: bool = Query(default=True),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(FinanceAccount)
    if not include_inactive:
        q = q.filter(FinanceAccount.is_active == True)  # noqa: E712
    accounts = q.order_by(FinanceAccount.sort_order.asc(), FinanceAccount.id.asc()).all()
    return _with_balances(db, accounts)


@router.post("/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    body: AccountCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    data = body.model_dump()
    _validate_account(db, data)
    account = FinanceAccount(**data)
    db.add(account)
    db.commit()
    db.refresh(account)
    invalidate_summary_cache()
    return _with_balances(db, [account])[0]


@router.put("/accounts/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int, body: AccountUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    account = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    data = body.model_dump(exclude_unset=True)
    _validate_account(db, data, account_id)
    for field, val in data.items():
        setattr(account, field, val)
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    invalidate_summary_cache()
    return _with_balances(db, [account])[0]


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
    db.query(FinanceTransaction).filter(
        FinanceTransaction.account_id == account_id
    ).update({FinanceTransaction.account_id: None}, synchronize_session=False)
    db.query(FinanceTransaction).filter(
        FinanceTransaction.transfer_account_id == account_id
    ).update({FinanceTransaction.transfer_account_id: None}, synchronize_session=False)
    db.delete(account)
    db.commit()
    invalidate_summary_cache()


# ── Transactions ─────────────────────────────────────────────────────────────

def _month_bounds(month: str) -> tuple[date, date]:
    try:
        year, mon = (int(x) for x in month.split("-"))
        return _month_range(year, mon)
    except (ValueError, TypeError):
        raise HTTPException(400, "month must be formatted YYYY-MM")


def _get_account(db: Session, account_id: Optional[int]) -> Optional[FinanceAccount]:
    if account_id is None:
        return None
    acc = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not acc:
        raise HTTPException(400, f"account_id {account_id} does not exist")
    return acc


def _validate_txn_fields(db: Session, data: dict) -> None:
    if data.get("transaction_type") is not None and data["transaction_type"] not in C.TRANSACTION_TYPES:
        raise HTTPException(400, f"transaction_type must be one of {C.TRANSACTION_TYPES}")
    if data.get("status") is not None and data["status"] not in C.TRANSACTION_STATUSES:
        raise HTTPException(400, f"status must be one of {C.TRANSACTION_STATUSES}")
    if data.get("category_id") is not None and not db.query(FinanceCategory).filter(
        FinanceCategory.id == data["category_id"]
    ).first():
        raise HTTPException(400, "category_id does not exist")


@router.get("/transactions", response_model=List[TransactionOut])
def list_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    month: Optional[str] = Query(default=None, description="YYYY-MM"),
    type: Optional[str] = None,
    status: Optional[str] = Query(default=None),
    source: Optional[str] = None,
    import_id: Optional[int] = None,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(FinanceTransaction)
    if account_id is not None:
        q = q.filter(FinanceTransaction.account_id == account_id)
    if category_id is not None:
        # A parent category also matches its subcategories.
        child_ids = [c.id for c in db.query(FinanceCategory.id).filter(
            FinanceCategory.parent_id == category_id)]
        q = q.filter(FinanceTransaction.category_id.in_([category_id, *child_ids]))
    if type:
        q = q.filter(FinanceTransaction.transaction_type == type)
    if status:
        q = q.filter(FinanceTransaction.status == status)
    if source:
        q = q.filter(FinanceTransaction.source == source)
    if import_id is not None:
        q = q.filter(FinanceTransaction.import_id == import_id)
    if month:
        start, end = _month_bounds(month)
        q = q.filter(FinanceTransaction.transaction_date >= start,
                     FinanceTransaction.transaction_date < end)
    return q.order_by(FinanceTransaction.transaction_date.desc(), FinanceTransaction.id.desc()).all()


@router.post("/transactions", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    body: TransactionCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    data = body.model_dump()
    _validate_txn_fields(db, data)
    account = _get_account(db, body.account_id)
    counter = _get_account(db, body.transfer_account_id)
    if counter is not None:
        if body.transaction_type not in C.TRANSFER_TYPES:
            raise HTTPException(400, "transfer_account_id is only valid for transfer types")
        if account is None or counter.id == account.id:
            raise HTTPException(400, "A transfer needs two different accounts")
    data.pop("transfer_account_id")
    if not data.get("currency"):
        data["currency"] = account.currency if account else ledger.base_currency(db)

    idx, base = FxIndex(db), ledger.base_currency(db)
    txn = FinanceTransaction(**data, source="manual")
    ledger.lock_base_amount(txn, idx, base)
    txn.fingerprint = ledger.fingerprint_for(txn, account)
    db.add(txn)
    db.flush()
    if counter is not None:
        ledger.create_counter_leg(db, txn, counter, idx, base, source="manual")
    db.commit()
    db.refresh(txn)
    invalidate_summary_cache()
    return txn


@router.post("/transactions/transfer", response_model=List[TransactionOut], status_code=status.HTTP_201_CREATED)
def create_transfer(
    body: TransferCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    """Two linked legs: −amount on from_account, +amount (or +to_amount) on
    to_account. Neither leg is income or spending."""
    if body.transaction_type not in C.TRANSFER_TYPES:
        raise HTTPException(400, f"transaction_type must be one of {C.TRANSFER_TYPES}")
    _validate_txn_fields(db, body.model_dump())
    src, dst = _get_account(db, body.from_account_id), _get_account(db, body.to_account_id)
    if src.id == dst.id:
        raise HTTPException(400, "from and to accounts must differ")

    idx, base = FxIndex(db), ledger.base_currency(db)
    group = str(uuid.uuid4())
    desc = body.description_raw or f"Transfer {src.name} → {dst.name}"
    if body.to_amount is not None:
        in_amt = body.to_amount
    else:
        in_amt, _ccy = ledger.counter_amount(-body.amount, src.currency, dst.currency, idx)
    legs = []
    for acc, other, amt in ((src, dst, -body.amount), (dst, src, in_amt)):
        leg = FinanceTransaction(
            account_id=acc.id, transaction_date=body.transaction_date,
            description_raw=desc, transaction_type=body.transaction_type,
            amount=amt, currency=acc.currency, category_id=body.category_id,
            status=body.status, transfer_account_id=other.id, transfer_group_id=group,
            source="manual", notes=body.notes,
        )
        ledger.lock_base_amount(leg, idx, base)
        leg.fingerprint = ledger.fingerprint_for(leg, acc)
        db.add(leg)
        legs.append(leg)
    db.commit()
    for leg in legs:
        db.refresh(leg)
    invalidate_summary_cache()
    return legs


@router.put("/transactions/{txn_id}", response_model=TransactionOut)
def update_transaction(
    txn_id: int, body: TransactionUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    txn = db.query(FinanceTransaction).filter(FinanceTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    data = body.model_dump(exclude_unset=True)
    _validate_txn_fields(db, data)
    if "account_id" in data:
        _get_account(db, data["account_id"])
    for field, val in data.items():
        setattr(txn, field, val)

    idx, base = FxIndex(db), ledger.base_currency(db)
    accounts = {a.id: a for a in db.query(FinanceAccount).all()}
    # Keep the other leg of a transfer in step (date/status/type/amount).
    for other in ledger.transfer_legs(db, txn):
        if other.id == txn.id:
            continue
        for field in ("transaction_date", "status", "transaction_type", "description_raw", "category_id"):
            if field in data:
                setattr(other, field, getattr(txn, field))
        if "amount" in data or "currency" in data:
            other.amount, other.currency = ledger.counter_amount(
                txn.amount, txn.currency,
                accounts[other.account_id].currency if other.account_id in accounts else other.currency,
                idx,
            )
        ledger.lock_base_amount(other, idx, base)
        if other.source != "auto_leg":
            other.fingerprint = ledger.fingerprint_for(other, accounts.get(other.account_id))
    ledger.lock_base_amount(txn, idx, base)
    txn.fingerprint = ledger.fingerprint_for(txn, accounts.get(txn.account_id))
    db.commit()
    db.refresh(txn)
    invalidate_summary_cache()
    return txn


@router.delete("/transactions/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    txn_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    txn = db.query(FinanceTransaction).filter(FinanceTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    legs = ledger.transfer_legs(db, txn)
    ids = [leg.id for leg in legs]
    # Staged import rows that produced these go back to the review queue.
    for row in db.query(FinanceImportTransaction).filter(
        FinanceImportTransaction.approved_transaction_id.in_(ids)
    ).all():
        row.approved_transaction_id = None
        row.status = "needs_review"
    for leg in legs:
        db.delete(leg)
    db.commit()
    invalidate_summary_cache()


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
    invalidate_summary_cache()
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
    invalidate_summary_cache()
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
    invalidate_summary_cache()


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
    invalidate_summary_cache()
    return rate


@router.post("/fx/sync")
def sync_fx(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    count = fx_fetcher.fetch_fx_rates(db)
    if count == 0:
        raise HTTPException(502, "Failed to fetch FX rates from all sources")
    invalidate_summary_cache()
    return {"stored": count}


# ── Categories ───────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    kind: str
    monthly_budget: Optional[float]
    budget_currency: Optional[str]
    color: Optional[str]
    is_active: bool
    sort_order: int
    created_at: datetime
    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    kind: Optional[str] = None            # defaults to the parent's kind, else "variable"
    monthly_budget: Optional[float] = None
    budget_currency: Optional[str] = None
    color: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    monthly_budget: Optional[float] = None
    budget_currency: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


def _check_category_name(db: Session, name: str, parent_id: Optional[int], exclude_id: Optional[int] = None):
    q = db.query(FinanceCategory).filter(FinanceCategory.parent_id == parent_id) if parent_id \
        else db.query(FinanceCategory).filter(FinanceCategory.parent_id.is_(None))
    for c in q.all():
        if c.id != exclude_id and C.slugify(c.name) == C.slugify(name):
            raise HTTPException(400, "A category with that name already exists here")


@router.post("/categories/seed-defaults")
def seed_default_categories(
    _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    return {"added": ledger.seed_default_categories(db)}


@router.get("/categories", response_model=List[CategoryOut])
def list_categories(
    include_inactive: bool = Query(default=True),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(FinanceCategory)
    if not include_inactive:
        q = q.filter(FinanceCategory.is_active == True)  # noqa: E712
    return q.order_by(FinanceCategory.sort_order.asc(), FinanceCategory.name.asc()).all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    body: CategoryCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    data = body.model_dump()
    parent = None
    if body.parent_id is not None:
        parent = db.query(FinanceCategory).filter(FinanceCategory.id == body.parent_id).first()
        if not parent or parent.parent_id is not None:
            raise HTTPException(400, "parent_id must be an existing top-level category")
    data["kind"] = body.kind or (parent.kind if parent else "variable")
    if data["kind"] not in C.CATEGORY_KINDS:
        raise HTTPException(400, f"kind must be one of {C.CATEGORY_KINDS}")
    _check_category_name(db, body.name, body.parent_id)
    cat = FinanceCategory(**data)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    invalidate_summary_cache()
    return cat


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int, body: CategoryUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    cat = db.query(FinanceCategory).filter(FinanceCategory.id == category_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    data = body.model_dump(exclude_unset=True)
    if "kind" in data and data["kind"] not in C.CATEGORY_KINDS:
        raise HTTPException(400, f"kind must be one of {C.CATEGORY_KINDS}")
    if "name" in data:
        _check_category_name(db, data["name"], cat.parent_id, exclude_id=cat.id)
    for field, val in data.items():
        setattr(cat, field, val)
    if "kind" in data and cat.parent_id is None:
        # Subcategories follow their parent's kind.
        db.query(FinanceCategory).filter(FinanceCategory.parent_id == cat.id).update(
            {FinanceCategory.kind: cat.kind}, synchronize_session=False)
    db.commit()
    db.refresh(cat)
    invalidate_summary_cache()
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    cat = db.query(FinanceCategory).filter(FinanceCategory.id == category_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    ids = [category_id] + [c.id for c in db.query(FinanceCategory).filter(
        FinanceCategory.parent_id == category_id).all()]
    # Detach references rather than cascade-delete history. Transactions in a
    # deleted subcategory fall back to its parent.
    fallback = cat.parent_id
    db.query(FinanceTransaction).filter(FinanceTransaction.category_id.in_(ids)).update(
        {FinanceTransaction.category_id: fallback}, synchronize_session=False)
    db.query(FinanceRecurring).filter(FinanceRecurring.category_id.in_(ids)).update(
        {FinanceRecurring.category_id: fallback}, synchronize_session=False)
    db.query(FinanceMerchantRule).filter(FinanceMerchantRule.category_id.in_(ids)).update(
        {FinanceMerchantRule.category_id: fallback}, synchronize_session=False)
    db.query(FinanceCategory).filter(FinanceCategory.parent_id == category_id).delete(
        synchronize_session=False)
    db.delete(cat)
    db.commit()
    invalidate_summary_cache()


# ── Recurring items (subscriptions / fixed costs) ────────────────────────────

class RecurringOut(BaseModel):
    id: int
    label: str
    amount: float
    currency: str
    day_of_month: int
    type: str
    category_id: Optional[int]
    account_id: Optional[int]
    is_active: bool
    start_date: Optional[date]
    end_date: Optional[date]
    last_run_month: Optional[str]
    note: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class RecurringCreate(BaseModel):
    label: str
    amount: float = Field(gt=0)
    currency: str = "SGD"
    day_of_month: int = 1
    type: str = "expense"
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    is_active: bool = True
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    note: Optional[str] = None


class RecurringUpdate(BaseModel):
    label: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0)
    currency: Optional[str] = None
    day_of_month: Optional[int] = None
    type: Optional[str] = None
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    is_active: Optional[bool] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    note: Optional[str] = None


def _validate_recurring(db: Session, data: dict) -> None:
    if data.get("type") is not None and data["type"] not in RECURRING_TYPES:
        raise HTTPException(400, f"type must be one of {RECURRING_TYPES}")
    if data.get("day_of_month") is not None and not (1 <= data["day_of_month"] <= 31):
        raise HTTPException(400, "day_of_month must be between 1 and 31")
    if data.get("category_id") is not None and not db.query(FinanceCategory).filter(
        FinanceCategory.id == data["category_id"]
    ).first():
        raise HTTPException(400, "category_id does not exist")
    if data.get("account_id") is not None and not db.query(FinanceAccount).filter(
        FinanceAccount.id == data["account_id"]
    ).first():
        raise HTTPException(400, "account_id does not exist")


@router.get("/recurring", response_model=List[RecurringOut])
def list_recurring(
    include_inactive: bool = Query(default=True),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    q = db.query(FinanceRecurring)
    if not include_inactive:
        q = q.filter(FinanceRecurring.is_active == True)  # noqa: E712
    return q.order_by(FinanceRecurring.day_of_month.asc(), FinanceRecurring.label.asc()).all()


@router.post("/recurring", response_model=RecurringOut, status_code=status.HTTP_201_CREATED)
def create_recurring(
    body: RecurringCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    _validate_recurring(db, body.model_dump())
    item = FinanceRecurring(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    invalidate_summary_cache()
    return item


@router.put("/recurring/{recurring_id}", response_model=RecurringOut)
def update_recurring(
    recurring_id: int, body: RecurringUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    item = db.query(FinanceRecurring).filter(FinanceRecurring.id == recurring_id).first()
    if not item:
        raise HTTPException(404, "Recurring item not found")
    data = body.model_dump(exclude_unset=True)
    _validate_recurring(db, data)
    for field, val in data.items():
        setattr(item, field, val)
    db.commit()
    db.refresh(item)
    invalidate_summary_cache()
    return item


@router.delete("/recurring/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring(
    recurring_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    item = db.query(FinanceRecurring).filter(FinanceRecurring.id == recurring_id).first()
    if not item:
        raise HTTPException(404, "Recurring item not found")
    # Keep any transactions already generated; just drop the back-reference.
    db.query(FinanceTransaction).filter(
        FinanceTransaction.recurring_id == recurring_id
    ).update({FinanceTransaction.recurring_id: None}, synchronize_session=False)
    db.delete(item)
    db.commit()
    invalidate_summary_cache()


@router.post("/recurring/run")
def run_recurring(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    created = materialise_recurring(db)
    invalidate_summary_cache()
    return {"created": created}


# ── Monthly close (Emergency Fund ledger) ────────────────────────────────────

class MonthlyCloseOut(BaseModel):
    id: int
    month: str
    base_currency: str
    income_base: float
    tax_base: float
    investments_base: float
    recurring_base: float
    variable_spend_base: float
    emergency_contribution_base: float
    reminder_sent_at: Optional[datetime]
    note: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("/monthly-close", response_model=List[MonthlyCloseOut])
def list_monthly_close(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(FinanceMonthlyClose).order_by(FinanceMonthlyClose.month.desc()).all()


@router.post("/monthly-close/{month}", response_model=MonthlyCloseOut)
def recompute_monthly_close(
    month: str, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    start, _end = _month_bounds(month)
    row = close_month(db, start.year, start.month)
    invalidate_summary_cache()
    return row


# ── Shared month helpers (used by endpoints and the scheduler) ───────────────

def _month_range(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year + (month == 12), (month % 12) + 1, 1)
    return start, end


def _clamp_day(year: int, month: int, day: int) -> int:
    return min(day, calendar.monthrange(year, month)[1])


def _settled_between(db: Session, start: date, end: date) -> List[FinanceTransaction]:
    return db.query(FinanceTransaction).filter(
        FinanceTransaction.transaction_date >= start,
        FinanceTransaction.transaction_date < end,
        FinanceTransaction.status == "settled",
    ).all()


def _is_contribution_in(t: FinanceTransaction, accounts: dict, into_types=("investment",)) -> bool:
    """An incoming transfer leg into an account of `into_types` that did not come
    from another account of the same class (moving between two brokerages is
    not new saving)."""
    acc = accounts.get(t.account_id)
    if acc is None or acc.account_type not in into_types:
        return False
    if t.transaction_type not in C.TRANSFER_TYPES or t.amount <= 0:
        return False
    other = accounts.get(t.transfer_account_id)
    return other is None or other.account_type not in into_types


def _month_figures(
    db: Session, year: int, month: int, idx: Optional[FxIndex] = None,
    *, accounts=None, cats=None, txns=None,
) -> dict:
    """Compute the Emergency-Fund inputs for one calendar month, in base ccy.

    emergency_contribution = income − tax − investments − recurring − variable_spend
    (so unspent allowance also flows into the Emergency Fund).

    Transfers between own accounts are excluded from income and spending;
    investments are money arriving in investment accounts from elsewhere.
    `accounts` / `cats` / `txns` may be passed pre-loaded (as the month's
    settled rows) to avoid re-querying — /summary does this.
    """
    idx = idx or FxIndex(db)
    profile = _get_or_create_profile(db)
    base = profile.base_currency or "SGD"
    start, end = _month_range(year, month)

    if txns is None:
        txns = _settled_between(db, start, end)
    accounts = ({a.id: a for a in accounts} if accounts is not None
                else {a.id: a for a in db.query(FinanceAccount).all()})
    cidx = CategoryIndex(cats if cats is not None else db.query(FinanceCategory).all())

    def b(t: FinanceTransaction) -> float:
        return ledger.base_value(t, idx, base)

    # Income: prefer logged income transactions, else the profile assumption.
    income_txn_total = sum(b(t) for t in txns if t.transaction_type in C.INCOME_TYPES)
    if income_txn_total > 0:
        income_base = income_txn_total
    else:
        inc = profile.monthly_income or 0.0
        income_base = idx.to_base(inc, profile.income_currency or base, base) or 0.0

    spend_rows = [t for t in txns if t.transaction_type in C.SPEND_TYPES + ("refund",)]
    tax_txn_total = -sum(b(t) for t in spend_rows if cidx.kind(t.category_id) == "tax")
    tax_base = tax_txn_total if tax_txn_total > 0 else float(profile.tax_reserve or 0.0)

    investments_base = sum(b(t) for t in txns if _is_contribution_in(t, accounts))

    def is_recurring_cost(t: FinanceTransaction) -> bool:
        return (t.recurring_id is not None or t.is_fixed_expense
                or cidx.kind(t.category_id) in C.FIXED_COST_KINDS)

    non_tax = [t for t in spend_rows if cidx.kind(t.category_id) != "tax"]
    recurring_base = -sum(b(t) for t in non_tax if is_recurring_cost(t))
    variable_spend_base = -sum(b(t) for t in non_tax if not is_recurring_cost(t))

    emergency = (
        income_base - tax_base - investments_base - recurring_base - variable_spend_base
    )
    return {
        "base_currency": base,
        "income_base": round(income_base, 2),
        "tax_base": round(tax_base, 2),
        "investments_base": round(investments_base, 2),
        "recurring_base": round(recurring_base, 2),
        "variable_spend_base": round(variable_spend_base, 2),
        "emergency_contribution_base": round(emergency, 2),
    }


def close_month(db: Session, year: int, month: int) -> FinanceMonthlyClose:
    """Upsert the FinanceMonthlyClose row for one month."""
    key = f"{year:04d}-{month:02d}"
    fig = _month_figures(db, year, month)
    row = db.query(FinanceMonthlyClose).filter(
        FinanceMonthlyClose.month == key
    ).first()
    if not row:
        row = FinanceMonthlyClose(month=key)
        db.add(row)
    for k, v in fig.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def materialise_recurring(db: Session, today: Optional[date] = None) -> int:
    """Generate this month's settled transactions for every due recurring item.

    Idempotent within a month via FinanceRecurring.last_run_month.
    """
    today = today or date.today()
    key = f"{today.year:04d}-{today.month:02d}"
    created = 0
    items = db.query(FinanceRecurring).filter(
        FinanceRecurring.is_active == True  # noqa: E712
    ).all()
    idx, base = None, None
    for item in items:
        if item.last_run_month == key:
            continue
        if item.start_date and item.start_date > today:
            continue
        if item.end_date and item.end_date < today:
            continue
        charge_day = _clamp_day(today.year, today.month, item.day_of_month)
        if today.day < charge_day:
            continue
        if idx is None:
            idx, base = FxIndex(db), ledger.base_currency(db)
        sign = 1 if item.type == "income" else -1
        txn = FinanceTransaction(
            account_id=item.account_id,
            transaction_date=date(today.year, today.month, charge_day),
            description_raw=item.label,
            transaction_type=item.type,
            amount=sign * abs(item.amount),
            currency=item.currency,
            status="settled",
            category_id=item.category_id,
            recurring_id=item.id,
            source="recurring",
            notes=f"Auto: {item.label}",
        )
        ledger.lock_base_amount(txn, idx, base)
        db.add(txn)
        item.last_run_month = key
        created += 1
    if created:
        db.commit()
        invalidate_summary_cache()
    return created


def _net_worth_base(db: Session, base: str, idx: Optional[FxIndex] = None) -> float:
    idx = idx or FxIndex(db)
    accounts = [a for a in db.query(FinanceAccount).all() if a.include_in_net_worth]
    bals = ledger.account_balances(db, accounts)
    total = 0.0
    for acc in accounts:
        settled, pending = bals[acc.id]
        v = idx.to_base(settled + pending, acc.currency, base)
        if v is not None:
            total += v
    return round(total, 2)


def month_end_maintenance(db: Session, today: Optional[date] = None) -> dict:
    """Scheduler entry point: finalise the previous month and, near month-end,
    email the fill-in-your-transactions reminder + a short summary.

    Returns a small dict describing what happened (handy for logs / manual runs).
    """
    import emailer

    today = today or date.today()
    result = {"closed_month": None, "reminder_month": None, "email_sent": False}

    # 1. Finalise the previous calendar month a few days in.
    if today.day <= 3:
        py, pm = ((today.year, today.month - 1) if today.month > 1
                  else (today.year - 1, 12))
        key = f"{py:04d}-{pm:02d}"
        if not db.query(FinanceMonthlyClose).filter(
            FinanceMonthlyClose.month == key
        ).first():
            close_month(db, py, pm)
            result["closed_month"] = key

    # 2. Month-end reminder (last 3 days of month, or first 3 of the next).
    dim = calendar.monthrange(today.year, today.month)[1]
    if today.day >= dim - 2:
        rmy, rmm = today.year, today.month
    elif today.day <= 3:
        rmy, rmm = ((today.year, today.month - 1) if today.month > 1
                    else (today.year - 1, 12))
    else:
        return result

    rm_key = f"{rmy:04d}-{rmm:02d}"
    result["reminder_month"] = rm_key
    row = db.query(FinanceMonthlyClose).filter(
        FinanceMonthlyClose.month == rm_key
    ).first()
    if row and row.reminder_sent_at:
        return result

    profile = _get_or_create_profile(db)
    base = profile.base_currency or "SGD"
    recipient = profile.alert_email
    if not recipient:
        admin = db.query(User).filter(User.role == "admin").order_by(User.id.asc()).first()
        recipient = admin.email if admin else None
    if not recipient:
        return result

    idx = FxIndex(db)
    fig = _month_figures(db, rmy, rmm, idx)
    start, end = _month_range(rmy, rmm)
    auto_count = db.query(FinanceTransaction).filter(
        FinanceTransaction.transaction_date >= start, FinanceTransaction.transaction_date < end,
        FinanceTransaction.recurring_id.isnot(None),
    ).count()
    pending_review = db.query(FinanceImportTransaction).filter(
        FinanceImportTransaction.status.in_(("needs_review", "pending", "duplicate"))
    ).count()
    cats = db.query(FinanceCategory).all()
    spent_by_cat, _inc = _category_flows(idx, CategoryIndex(cats), _settled_between(db, start, end), base)
    over = [
        f"  • {b['category']}: {b['spent_base']:.0f} / {b['limit_base']:.0f} {base}"
        for b in _budgets_from_spend(idx, cats, spent_by_cat, base) if b["over"]
    ]

    nw = _net_worth_base(db, base, idx)
    lines = [
        f"Time to log your transactions for {rm_key}.",
        "",
        f"So far this month ({base}):",
        f"  Income logged:        {fig['income_base']:.0f}",
        f"  Variable spend:       {fig['variable_spend_base']:.0f}",
        f"  Recurring / fixed:    {fig['recurring_base']:.0f}",
        f"  Investments:          {fig['investments_base']:.0f}",
        f"  → Emergency Fund add: {fig['emergency_contribution_base']:.0f}",
        "",
        f"Recurring items auto-added this month: {auto_count}",
    ]
    if pending_review:
        lines += [f"Imported rows waiting in the review queue: {pending_review}"]
    if over:
        lines += ["", "Budgets over limit:"] + over
    lines += [
        "",
        f"Net worth (incl. pending): {nw:.0f} {base}",
        "",
        "Open the Finance tab to import statements and complete the month.",
    ]
    body = "\n".join(lines)

    sent = emailer.send_email(recipient, f"Finance: log your {rm_key} transactions", body)
    result["email_sent"] = sent
    if sent:
        if not row:
            row = close_month(db, rmy, rmm)
        row.reminder_sent_at = datetime.utcnow()
        db.commit()
    return result


# ── Summary (reporting brain) ────────────────────────────────────────────────

def _category_flows(idx: FxIndex, cidx: CategoryIndex, month_txns, base_ccy):
    """(spent_by_top_category, income_by_top_category) in base ccy.

    Spending = expenses + fees net of refunds; income = income + interest +
    dividends. Transfers and adjustments are neither.
    """
    spent: dict = defaultdict(float)
    income: dict = defaultdict(float)
    for t in month_txns:
        top = cidx.top(t.category_id)
        label = top.name if top else "Uncategorised"
        amt = ledger.base_value(t, idx, base_ccy)
        if t.transaction_type in C.SPEND_TYPES or t.transaction_type == "refund":
            spent[label] -= amt
        elif t.transaction_type in C.INCOME_TYPES + C.INVESTMENT_INCOME_TYPES:
            income[label] += amt
    return spent, income


def _budgets_from_spend(idx: FxIndex, cats, spent_by_cat, base_ccy):
    rows = []
    for c in cats:
        if c.parent_id is not None or not c.is_active or c.monthly_budget is None:
            continue
        limit_base = idx.to_base(c.monthly_budget, c.budget_currency or base_ccy, base_ccy)
        spent = round(spent_by_cat.get(c.name, 0.0), 2)
        rows.append({
            "category": c.name, "kind": c.kind,
            "limit_base": round(limit_base, 2) if limit_base is not None else None,
            "spent_base": spent,
            "percent": round(spent / limit_base * 100.0, 1) if limit_base else None,
            "over": bool(limit_base is not None and spent > limit_base),
        })
    rows.sort(key=lambda b: (b["percent"] is None, -(b["percent"] or 0)))
    return rows


@router.get("/budgets")
def budgets_endpoint(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Just the per-category budget bars for the current month — the cheap subset
    of /summary that the Budget & Categories tab needs (≈3 queries)."""
    profile = _get_or_create_profile(db)
    base_ccy = profile.base_currency or "SGD"
    idx = FxIndex(db)
    today = date.today()
    m_start, m_end = _month_range(today.year, today.month)
    cats = db.query(FinanceCategory).order_by(
        FinanceCategory.sort_order.asc(), FinanceCategory.name.asc()
    ).all()
    spent, _income = _category_flows(idx, CategoryIndex(cats), _settled_between(db, m_start, m_end), base_ccy)
    return {"base_currency": base_ccy, "budgets": _budgets_from_spend(idx, cats, spent, base_ccy)}


# Short-lived cache for /summary: admin-only, read-heavy, hit from both the
# dashboard and (indirectly) other views. Writes through this router clear it.
_SUMMARY_TTL = 15.0
_summary_cache: dict = {}   # as_of_key -> (expires_at, payload)


@router.get("/summary")
def summary(
    as_of: Optional[str] = Query(default=None, description="projection target date YYYY-MM-DD"),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    cache_key = as_of or ""
    hit = _summary_cache.get(cache_key)
    if hit and hit[0] > time.monotonic():
        return hit[1]

    profile = _get_or_create_profile(db)
    accounts = db.query(FinanceAccount).order_by(
        FinanceAccount.sort_order.asc(), FinanceAccount.id.asc()
    ).all()
    acc_by_id = {a.id: a for a in accounts}

    base_ccy = profile.base_currency or "SGD"
    idx = FxIndex(db)

    def _b(amount, ccy):
        v = idx.to_base(amount, ccy, base_ccy)
        return v if v is not None else 0.0

    today = date.today()
    # One query covers this month + the previous 3 completed months.
    hist_start = _month_range(today.year, today.month)[0]
    for _k in range(3):
        py, pm = (hist_start.year, hist_start.month - 1) if hist_start.month > 1 else (hist_start.year - 1, 12)
        hist_start = date(py, pm, 1)
    m_start, m_end = _month_range(today.year, today.month)
    hist_txns = _settled_between(db, hist_start, m_end)
    m_txns = [t for t in hist_txns if t.transaction_date >= m_start]

    by_currency_settled: dict = defaultdict(float)
    by_currency_pending: dict = defaultdict(float)
    account_rows = []
    fx_notes = {}   # rate provenance for conversions we perform

    net_base_settled = 0.0
    net_base_after_pending = 0.0
    liabilities_base = 0.0
    bals = ledger.account_balances(db, accounts)
    contributions = ledger.net_contributions(db, [a for a in accounts if a.account_type == "investment"])

    for acc in accounts:
        settled, pending = bals[acc.id]
        after = settled + pending
        settled_base = idx.to_base(settled, acc.currency, base_ccy)
        after_base = idx.to_base(after, acc.currency, base_ccy)
        if acc.currency != base_ccy and idx.rate(acc.currency, base_ccy) is not None:
            ao = idx.as_of(acc.currency, base_ccy)
            fx_notes[f"{acc.currency}->{base_ccy}"] = {
                "rate": idx.rate(acc.currency, base_ccy),
                "as_of": ao.isoformat() if ao else None,
            }
        if acc.include_in_net_worth:
            by_currency_settled[acc.currency] += settled
            by_currency_pending[acc.currency] += pending
            if settled_base is not None:
                net_base_settled += settled_base
            if after_base is not None:
                net_base_after_pending += after_base
            if acc.account_type == "liability" and settled_base is not None:
                liabilities_base += -settled_base

        gain = None
        if acc.account_type == "investment":
            # Decision D7: unrealised gain = market value − net contributions.
            gain = round(settled - contributions.get(acc.id, 0.0), 2)

        account_rows.append({
            "id": acc.id, "name": acc.name, "institution": acc.institution,
            "account_type": acc.account_type, "currency": acc.currency,
            "risk_role": acc.risk_role, "include_in_net_worth": acc.include_in_net_worth,
            "settled": round(settled, 2), "pending": round(pending, 2),
            "after_pending": round(after, 2),
            "settled_base": round(settled_base, 2) if settled_base is not None else None,
            "after_pending_base": round(after_base, 2) if after_base is not None else None,
            "net_contributions": round(contributions[acc.id], 2) if acc.id in contributions else None,
            "investment_gain": gain,
            "investment_gain_base": round(_b(gain, acc.currency), 2) if gain is not None else None,
        })

    # Primary goal progress (kept separate from account performance).
    goal = (
        db.query(FinanceGoal).filter(FinanceGoal.is_primary == True)  # noqa: E712
        .first()
        or db.query(FinanceGoal).order_by(FinanceGoal.target_date.asc()).first()
    )
    goal_block = None
    if goal:
        goal_rate = idx.rate(base_ccy, goal.target_currency)
        current_in_goal_ccy = (
            net_base_after_pending * goal_rate if goal_rate is not None else None
        )
        months_remaining = None
        required_monthly = None
        if goal.target_date:
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
            "fx_available": goal_rate is not None,
        }

    # This-month savings: money arriving in savings/investment accounts from
    # elsewhere (transfers between two such accounts are not new saving).
    saved_base = sum(
        ledger.base_value(t, idx, base_ccy) for t in m_txns
        if _is_contribution_in(t, acc_by_id, SAVINGS_ACCOUNT_TYPES)
    )
    income = idx.to_base(
        profile.monthly_income or 0.0, profile.income_currency or base_ccy, base_ccy
    ) or 0.0
    logged_income = sum(ledger.base_value(t, idx, base_ccy) for t in m_txns
                        if t.transaction_type in C.INCOME_TYPES)
    if logged_income > 0:
        income = logged_income
    savings_rate = (saved_base / income * 100.0) if income else None

    # ── Categories, budgets, top spending/income (this month) ────────────────
    cats = db.query(FinanceCategory).order_by(
        FinanceCategory.sort_order.asc(), FinanceCategory.name.asc()
    ).all()
    cidx = CategoryIndex(cats)
    spent_by_cat, income_by_cat = _category_flows(idx, cidx, m_txns, base_ccy)
    budgets = _budgets_from_spend(idx, cats, spent_by_cat, base_ccy)

    top_spending = sorted(
        ({"category": k, "amount_base": round(v, 2)} for k, v in spent_by_cat.items() if v > 0),
        key=lambda x: x["amount_base"], reverse=True,
    )[:5]
    top_income = sorted(
        ({"category": k, "amount_base": round(v, 2)} for k, v in income_by_cat.items() if v > 0),
        key=lambda x: x["amount_base"], reverse=True,
    )[:5]
    investment_income_base = sum(
        ledger.base_value(t, idx, base_ccy) for t in m_txns
        if t.transaction_type in C.INVESTMENT_INCOME_TYPES
    )

    # ── Recent 3 completed months (income vs spending) ─────────────────────
    # Bucketed from the single history query above — no extra round-trips.
    by_month_inc: dict = defaultdict(float)
    by_month_spend: dict = defaultdict(float)
    for t in hist_txns:
        if t.transaction_date >= m_start:
            continue
        key = f"{t.transaction_date.year:04d}-{t.transaction_date.month:02d}"
        v = ledger.base_value(t, idx, base_ccy)
        if t.transaction_type in C.INCOME_TYPES + C.INVESTMENT_INCOME_TYPES:
            by_month_inc[key] += v
        elif t.transaction_type in C.SPEND_TYPES or t.transaction_type == "refund":
            by_month_spend[key] -= v
    recent_months = []
    ry, rm = today.year, today.month
    for _i in range(3):
        rm -= 1
        if rm == 0:
            rm, ry = 12, ry - 1
        key = f"{ry:04d}-{rm:02d}"
        inc, spend = round(by_month_inc[key], 2), round(by_month_spend[key], 2)
        recent_months.append({
            "month": key, "income_base": inc, "spend_base": spend,
            "net_base": round(inc - spend, 2),
        })
    recent_months.reverse()

    # ── Recurring items ────────────────────────────────────────────────────
    rec_items = db.query(FinanceRecurring).filter(
        FinanceRecurring.is_active == True  # noqa: E712
    ).order_by(FinanceRecurring.day_of_month.asc()).all()
    recurring_rows = []
    recurring_total_base = 0.0
    for it in rec_items:
        monthly_base = idx.to_base(it.amount, it.currency, base_ccy)
        day = _clamp_day(today.year, today.month, it.day_of_month)
        if today.day <= day:
            nxt = date(today.year, today.month, day)
        else:
            ny, nm = (today.year + (today.month == 12), (today.month % 12) + 1)
            nxt = date(ny, nm, _clamp_day(ny, nm, it.day_of_month))
        recurring_rows.append({
            "id": it.id, "label": it.label, "amount": it.amount, "currency": it.currency,
            "type": it.type, "day_of_month": it.day_of_month,
            "next_charge_date": nxt.isoformat(),
            "monthly_base": round(monthly_base, 2) if monthly_base is not None else None,
        })
        if it.type == "expense" and monthly_base:
            recurring_total_base += monthly_base

    # ── Emergency Fund ────────────────────────────────────────────────────
    contributed = 0.0
    for row in db.query(FinanceMonthlyClose).all():
        v = idx.to_base(row.emergency_contribution_base, row.base_currency, base_ccy)
        contributed += v if v is not None else row.emergency_contribution_base
    opening = float(profile.emergency_fund_opening or 0.0)
    this_month_fig = _month_figures(
        db, today.year, today.month, idx,
        accounts=accounts, cats=cats, txns=m_txns,
    )

    planned_investments_base = 0.0
    for acc in accounts:
        if acc.account_type == "investment" and acc.planned_monthly_contribution:
            planned_investments_base += _b(
                acc.planned_monthly_contribution, acc.contribution_currency or acc.currency
            )
    allowance_max_base = float(profile.personal_allowance_max or 0.0)
    tax_reserve_base = float(profile.tax_reserve or 0.0)
    monthly_target = (
        income - tax_reserve_base - planned_investments_base
        - recurring_total_base - allowance_max_base
    )
    emergency_fund = {
        "opening_base": round(opening, 2),
        "contributed_base": round(contributed, 2),
        "balance_base": round(opening + contributed, 2),
        "this_month_projected_base": this_month_fig["emergency_contribution_base"],
        "monthly_target_base": round(monthly_target, 2),
    }

    # ── Net-worth projection ──────────────────────────────────────────────
    as_of_date = None
    if as_of:
        try:
            as_of_date = date.fromisoformat(as_of)
        except ValueError:
            raise HTTPException(400, "as_of must be formatted YYYY-MM-DD")
    if as_of_date is None:
        as_of_date = (goal.target_date if goal and goal.target_date
                      else date(today.year + 1, today.month, 1))
    months_ahead = max(
        0, (as_of_date.year - today.year) * 12 + (as_of_date.month - today.month)
    )
    monthly_delta = income - tax_reserve_base - recurring_total_base - allowance_max_base
    points = []
    val, py, pm = net_base_after_pending, today.year, today.month
    for _i in range(months_ahead + 1):
        points.append({"month": f"{py:04d}-{pm:02d}", "value": round(val, 2)})
        val += monthly_delta
        pm += 1
        if pm == 13:
            pm, py = 1, py + 1
    projection = {
        "as_of": as_of_date.isoformat(),
        "monthly_delta_base": round(monthly_delta, 2),
        "projected_net_worth_base": round(net_base_after_pending + months_ahead * monthly_delta, 2),
        "points": points,
    }

    # ── Month-end reminder flag (frontend banner fallback) ─────────────────
    dim = calendar.monthrange(today.year, today.month)[1]
    if today.day >= dim - 2:
        rmy, rmm, rm_active = today.year, today.month, True
    elif today.day <= 5:
        rmy, rmm = ((today.year, today.month - 1) if today.month > 1
                    else (today.year - 1, 12))
        rm_active = True
    else:
        rmy, rmm, rm_active = today.year, today.month, False
    rm_key = f"{rmy:04d}-{rmm:02d}"
    if rm_active:
        rc = db.query(FinanceMonthlyClose).filter(
            FinanceMonthlyClose.month == rm_key
        ).first()
        if rc and rc.reminder_sent_at:
            rm_active = False
    reminder = {"active": bool(rm_active), "month": rm_key}

    review_queue = db.query(FinanceImportTransaction).filter(
        FinanceImportTransaction.status.in_(("needs_review", "duplicate"))
    ).count()

    payload = {
        "base_currency": base_ccy,
        "net_worth": {
            "settled_base": round(net_base_settled, 2),
            "after_pending_base": round(net_base_after_pending, 2),
            "liabilities_base": round(liabilities_base, 2),
            "by_currency_settled": {k: round(v, 2) for k, v in by_currency_settled.items()},
            "by_currency_pending": {k: round(v, 2) for k, v in by_currency_pending.items()},
        },
        "accounts": account_rows,
        "goal": goal_block,
        "this_month": {
            "saved_base": round(saved_base, 2),
            "income_base": round(income, 2) if income else None,
            "savings_rate_percent": round(savings_rate, 2) if savings_rate is not None else None,
            "investment_income_base": round(investment_income_base, 2),
        },
        "budget": {
            "monthly_income": profile.monthly_income,
            "income_currency": profile.income_currency,
            "tax_reserve": profile.tax_reserve,
            "personal_allowance_min": profile.personal_allowance_min,
            "personal_allowance_max": profile.personal_allowance_max,
        },
        "budgets": budgets,
        "top_spending": top_spending,
        "top_income": top_income,
        "recent_months": recent_months,
        "recurring": {"items": recurring_rows, "recurring_total_base": round(recurring_total_base, 2)},
        "emergency_fund": emergency_fund,
        "projection": projection,
        "reminder": reminder,
        "review_queue_count": review_queue,
        "fx_notes": fx_notes,
        "generated_at": datetime.utcnow().isoformat(),
    }
    _summary_cache[cache_key] = (time.monotonic() + _SUMMARY_TTL, payload)
    return payload


# ── Baseline seed (August 2026 snapshot from the profile doc) ─────────────────

@router.post("/baseline")
def import_baseline(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Idempotently seed the Aug-2026 starting state. Refuses if data exists."""
    # Goals and the profile survive the ledger reset, so only ledger rows block.
    existing = db.query(FinanceAccount).count() + db.query(FinanceTransaction).count()
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
    profile.emergency_fund_opening = 0.0
    profile.updated_at = datetime.utcnow()

    # Standard spending-category taxonomy
    ledger.seed_default_categories(db)

    # Goal (kept goals are left alone)
    if not db.query(FinanceGoal).count():
        db.add(FinanceGoal(
            label="KRW 100M before National Service",
            target_amount=100_000_000.0, target_currency="KRW",
            target_date=date(2028, 11, 30),
            note="Fixed-horizon savings goal; driven mainly by regular saving.",
            is_primary=True,
        ))

    # Accounts. Cash: opening balance. Investments: opening balance = cost basis
    # (market value − platform total return) so D7's gain matches the platform,
    # plus the baseline valuation and the pending contribution.
    accounts_spec = [
        # name, ref, institution, type, currency, risk_role, planned, contrib_ccy,
        #   cash_balance, pending, market_value, total_return, return_pct
        ("Bank deposit / cash", "bank_cash_sgd", "Bank", "cash", "SGD", "liquid",
         None, None, 4000.0, 0.0, None, None, None),
        ("Mari Invest Income", "mari_invest_income", "Mari", "investment", "SGD", "market",
         1000.0, "SGD", None, 1000.0, 8891.23, -63.22, None),
        ("Mari Invest SavePlus", "mari_invest_saveplus", "Mari", "investment", "SGD", "low_risk",
         1000.0, "SGD", None, 1000.0, 1002.03, 2.03, 1.33),
        ("DBS DigiPortfolio", "dbs_digiportfolio", "DBS", "investment", "USD", "market",
         1000.0, "USD", None, 1000.0, 5089.08, 89.08, 1.78),
    ]

    idx, base = FxIndex(db), "SGD"
    id_by_name = {}
    for (name, ref, inst, atype, ccy, risk, planned, cc,
         cash_bal, pending, mv, tr, rp) in accounts_spec:
        opening = cash_bal if cash_bal is not None else (mv - (tr or 0.0) if mv is not None else 0.0)
        acc = FinanceAccount(
            name=name, external_ref=ref, institution=inst, account_type=atype, currency=ccy,
            opening_balance=round(opening, 2),
            risk_role=risk, liquidity_role=risk,
            planned_monthly_contribution=planned, contribution_currency=cc,
            sort_order=len(id_by_name),
        )
        db.add(acc)
        db.flush()
        id_by_name[name] = acc.id

        if atype == "investment" and mv is not None:
            db.add(FinanceValuation(
                account_id=acc.id, as_of=snapshot, market_value=mv, currency=ccy,
                total_return=tr, return_percent=rp,
                note="Aug 2026 baseline snapshot",
            ))
        if pending:
            txn = FinanceTransaction(
                account_id=acc.id, transaction_date=snapshot,
                description_raw="Pending contribution (Aug 2026 baseline)",
                transaction_type="investment_contribution",
                amount=pending, currency=cc or ccy, status="pending", source="manual",
            )
            ledger.lock_base_amount(txn, idx, base)
            db.add(txn)

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

    invalidate_summary_cache()
    return {"status": "seeded", "accounts": len(accounts_spec)}
