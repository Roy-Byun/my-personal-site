"""Finance tracker API (admin-only).

Every route requires an admin user. Resources mirror the personal-finance
baseline document: a singleton profile (budget assumptions), savings goals,
accounts, a full transaction ledger, market valuations, asset allocations, and
FX rates. The /summary endpoint is the reporting brain that applies the
document's calculation rules; /baseline seeds the August-2026 starting state.
"""

import calendar
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
    FinanceCategory,
    FinanceGoal,
    FinanceMonthlyClose,
    FinanceProfile,
    FinanceRecurring,
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
CATEGORY_KINDS = ("subscription", "fixed", "variable", "tax", "investment", "income")
RECURRING_TYPES = ("spend", "income")
# Category kinds whose spending is treated as committed/recurring cost rather
# than discretionary "variable" spend (matters for the Emergency Fund maths).
FIXED_COST_KINDS = ("subscription", "fixed")

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
    category_id: Optional[int]
    recurring_id: Optional[int]
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
    category_id: Optional[int] = None
    note: Optional[str] = None


class TransactionUpdate(BaseModel):
    account_id: Optional[int] = None
    date: Optional[date] = None
    type: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[int] = None
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
    if body.category_id is not None and not db.query(FinanceCategory).filter(
        FinanceCategory.id == body.category_id
    ).first():
        raise HTTPException(400, "category_id does not exist")
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
    if data.get("category_id") is not None and not db.query(FinanceCategory).filter(
        FinanceCategory.id == data["category_id"]
    ).first():
        raise HTTPException(400, "category_id does not exist")
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


# ── Categories ───────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: int
    name: str
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
    kind: str = "variable"
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
    if body.kind not in CATEGORY_KINDS:
        raise HTTPException(400, f"kind must be one of {CATEGORY_KINDS}")
    if db.query(FinanceCategory).filter(FinanceCategory.name == body.name).first():
        raise HTTPException(400, "A category with that name already exists")
    cat = FinanceCategory(**body.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
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
    if "kind" in data and data["kind"] not in CATEGORY_KINDS:
        raise HTTPException(400, f"kind must be one of {CATEGORY_KINDS}")
    if "name" in data and db.query(FinanceCategory).filter(
        FinanceCategory.name == data["name"], FinanceCategory.id != category_id
    ).first():
        raise HTTPException(400, "A category with that name already exists")
    for field, val in data.items():
        setattr(cat, field, val)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    cat = db.query(FinanceCategory).filter(FinanceCategory.id == category_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    # Detach references rather than cascade-delete history.
    db.query(FinanceTransaction).filter(
        FinanceTransaction.category_id == category_id
    ).update({FinanceTransaction.category_id: None}, synchronize_session=False)
    db.query(FinanceRecurring).filter(
        FinanceRecurring.category_id == category_id
    ).update({FinanceRecurring.category_id: None}, synchronize_session=False)
    db.delete(cat)
    db.commit()


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
    amount: float
    currency: str = "SGD"
    day_of_month: int = 1
    type: str = "spend"
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    is_active: bool = True
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    note: Optional[str] = None


class RecurringUpdate(BaseModel):
    label: Optional[str] = None
    amount: Optional[float] = None
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


@router.post("/recurring/run")
def run_recurring(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    created = materialise_recurring(db)
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
    try:
        year, mon = (int(x) for x in month.split("-"))
        date(year, mon, 1)
    except (ValueError, TypeError):
        raise HTTPException(400, "month must be formatted YYYY-MM")
    row = close_month(db, year, mon)
    return row


# ── Shared month helpers (used by endpoints and the scheduler) ───────────────

def _to_base(db: Session, amount: Optional[float], ccy: str, base: str) -> Optional[float]:
    """Convert to base currency, falling back to the raw amount only when the
    currency already is the base. Returns None when a conversion is needed but
    no FX rate is available."""
    if amount is None:
        return None
    if ccy == base:
        return float(amount)
    conv = fx_fetcher.convert(db, amount, ccy, base)
    return conv[0] if conv else None


def _month_range(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year + (month == 12), (month % 12) + 1, 1)
    return start, end


def _clamp_day(year: int, month: int, day: int) -> int:
    return min(day, calendar.monthrange(year, month)[1])


def _month_figures(db: Session, year: int, month: int) -> dict:
    """Compute the Emergency-Fund inputs for one calendar month, in base ccy.

    emergency_contribution = income − tax − investments − recurring − variable_spend
    (so unspent allowance also flows into the Emergency Fund).
    """
    profile = _get_or_create_profile(db)
    base = profile.base_currency or "SGD"
    start, end = _month_range(year, month)

    txns = db.query(FinanceTransaction).filter(
        FinanceTransaction.date >= start, FinanceTransaction.date < end,
        FinanceTransaction.status == "settled",
    ).all()

    accounts = {a.id: a for a in db.query(FinanceAccount).all()}
    cats = {c.id: c for c in db.query(FinanceCategory).all()}

    def base_amt(t: FinanceTransaction) -> float:
        v = _to_base(db, t.amount, t.currency, base)
        return v if v is not None else 0.0

    # Income: prefer logged income transactions, else the profile assumption.
    income_txn_total = sum(base_amt(t) for t in txns if t.type == "income")
    if income_txn_total > 0:
        income_base = income_txn_total
    else:
        inc = profile.monthly_income or 0.0
        income_base = _to_base(db, inc, profile.income_currency or base, base) or 0.0

    tax_txn_total = sum(base_amt(t) for t in txns if t.type == "tax")
    tax_base = tax_txn_total if tax_txn_total > 0 else (
        _to_base(db, profile.tax_reserve or 0.0, base, base) or 0.0
    )

    investments_base = sum(
        base_amt(t) for t in txns
        if t.type in ("deposit", "invest")
        and accounts.get(t.account_id) is not None
        and accounts[t.account_id].account_type == "investment"
    )

    def is_recurring_cost(t: FinanceTransaction) -> bool:
        if t.recurring_id is not None:
            return True
        cat = cats.get(t.category_id)
        return cat is not None and cat.kind in FIXED_COST_KINDS

    recurring_base = sum(
        base_amt(t) for t in txns if t.type == "spend" and is_recurring_cost(t)
    )
    variable_spend_base = sum(
        base_amt(t) for t in txns if t.type == "spend" and not is_recurring_cost(t)
    )

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
        db.add(FinanceTransaction(
            account_id=item.account_id,
            date=date(today.year, today.month, charge_day),
            type=item.type,
            amount=item.amount,
            currency=item.currency,
            status="settled",
            category_id=item.category_id,
            recurring_id=item.id,
            note=f"Auto: {item.label}",
        ))
        item.last_run_month = key
        created += 1
    if created:
        db.commit()
    return created


def _net_worth_base(db: Session, base: str) -> float:
    total = 0.0
    for acc in db.query(FinanceAccount).all():
        settled, pending = _account_balance(db, acc)
        v = _to_base(db, settled + pending, acc.currency, base)
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

    fig = _month_figures(db, rmy, rmm)
    start, end = _month_range(rmy, rmm)
    auto_count = db.query(FinanceTransaction).filter(
        FinanceTransaction.date >= start, FinanceTransaction.date < end,
        FinanceTransaction.recurring_id.isnot(None),
    ).count()
    over = []
    for c in db.query(FinanceCategory).filter(
        FinanceCategory.is_active == True, FinanceCategory.monthly_budget.isnot(None)  # noqa: E712
    ).all():
        limit_base = _to_base(db, c.monthly_budget, c.budget_currency or base, base) or 0.0
        spent = 0.0
        for t in db.query(FinanceTransaction).filter(
            FinanceTransaction.date >= start, FinanceTransaction.date < end,
            FinanceTransaction.status == "settled", FinanceTransaction.type == "spend",
            FinanceTransaction.category_id == c.id,
        ).all():
            spent += _to_base(db, t.amount, t.currency, base) or 0.0
        if limit_base and spent > limit_base:
            over.append(f"  • {c.name}: {spent:.0f} / {limit_base:.0f} {base}")

    nw = _net_worth_base(db, base)
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
    if over:
        lines += ["", "Budgets over limit:"] + over
    lines += [
        "",
        f"Net worth (incl. pending): {nw:.0f} {base}",
        "",
        "Open the Finance tab to review and complete the month.",
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
def summary(
    as_of: Optional[str] = Query(default=None, description="projection target date YYYY-MM-DD"),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
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

    # ── Categories, budgets, top spending/income (this month) ────────────────
    def _b(amount, ccy):
        v = _to_base(db, amount, ccy, base_ccy)
        return v if v is not None else 0.0

    cats = db.query(FinanceCategory).order_by(
        FinanceCategory.sort_order.asc(), FinanceCategory.name.asc()
    ).all()
    cat_by_id = {c.id: c for c in cats}
    m_end = date(today.year + (today.month == 12), (today.month % 12) + 1, 1)
    this_month_txns = [t for t in m_txns if t.date < m_end]

    spent_by_cat: dict = defaultdict(float)
    income_by_cat: dict = defaultdict(float)
    for t in this_month_txns:
        label = (cat_by_id[t.category_id].name if t.category_id in cat_by_id
                 else (t.category or "Uncategorised"))
        if t.type == "spend":
            spent_by_cat[label] += _b(t.amount, t.currency)
        elif t.type == "income":
            income_by_cat[label] += _b(t.amount, t.currency)

    budgets = []
    for c in cats:
        if not c.is_active or c.monthly_budget is None:
            continue
        limit_base = _to_base(db, c.monthly_budget, c.budget_currency or base_ccy, base_ccy)
        spent = round(spent_by_cat.get(c.name, 0.0), 2)
        budgets.append({
            "category": c.name, "kind": c.kind,
            "limit_base": round(limit_base, 2) if limit_base is not None else None,
            "spent_base": spent,
            "percent": round(spent / limit_base * 100.0, 1) if limit_base else None,
            "over": bool(limit_base is not None and spent > limit_base),
        })
    budgets.sort(key=lambda b: (b["percent"] is None, -(b["percent"] or 0)))

    top_spending = sorted(
        ({"category": k, "amount_base": round(v, 2)} for k, v in spent_by_cat.items() if v > 0),
        key=lambda x: x["amount_base"], reverse=True,
    )[:5]
    top_income = sorted(
        ({"category": k, "amount_base": round(v, 2)} for k, v in income_by_cat.items() if v > 0),
        key=lambda x: x["amount_base"], reverse=True,
    )[:5]

    # ── Recent 3 completed months (income vs spending) ──────────────────────
    recent_months = []
    ry, rm = today.year, today.month
    for _i in range(3):
        rm -= 1
        if rm == 0:
            rm, ry = 12, ry - 1
        rs, re = _month_range(ry, rm)
        rtx = db.query(FinanceTransaction).filter(
            FinanceTransaction.date >= rs, FinanceTransaction.date < re,
            FinanceTransaction.status == "settled",
        ).all()
        inc = sum(_b(t.amount, t.currency) for t in rtx if t.type == "income")
        spend = sum(_b(t.amount, t.currency) for t in rtx if t.type in ("spend", "tax"))
        recent_months.append({
            "month": f"{ry:04d}-{rm:02d}",
            "income_base": round(inc, 2), "spend_base": round(spend, 2),
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
        monthly_base = _to_base(db, it.amount, it.currency, base_ccy)
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
        if it.type == "spend" and monthly_base:
            recurring_total_base += monthly_base

    # ── Emergency Fund ────────────────────────────────────────────────────
    contributed = 0.0
    for row in db.query(FinanceMonthlyClose).all():
        v = _to_base(db, row.emergency_contribution_base, row.base_currency, base_ccy)
        contributed += v if v is not None else row.emergency_contribution_base
    opening = _to_base(db, profile.emergency_fund_opening or 0.0, base_ccy, base_ccy) or 0.0
    this_month_fig = _month_figures(db, today.year, today.month)

    planned_investments_base = 0.0
    for acc in accounts:
        if acc.account_type == "investment" and acc.planned_monthly_contribution:
            planned_investments_base += _b(
                acc.planned_monthly_contribution, acc.contribution_currency or acc.currency
            )
    allowance_max_base = _to_base(db, profile.personal_allowance_max or 0.0, base_ccy, base_ccy) or 0.0
    tax_reserve_base = _to_base(db, profile.tax_reserve or 0.0, base_ccy, base_ccy) or 0.0
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
        "budgets": budgets,
        "top_spending": top_spending,
        "top_income": top_income,
        "recent_months": recent_months,
        "recurring": {"items": recurring_rows, "recurring_total_base": round(recurring_total_base, 2)},
        "emergency_fund": emergency_fund,
        "projection": projection,
        "reminder": reminder,
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
    profile.emergency_fund_opening = 0.0
    profile.updated_at = datetime.utcnow()

    # Starter spending categories (name, kind, monthly_budget)
    for i, (cname, ckind, cbudget) in enumerate([
        ("Rent", "fixed", None),
        ("Groceries", "variable", 400.0),
        ("Transport", "variable", 120.0),
        ("Subscriptions", "subscription", 60.0),
        ("Tax", "tax", None),
        ("Salary", "income", None),
    ]):
        db.add(FinanceCategory(
            name=cname, kind=ckind, monthly_budget=cbudget,
            budget_currency="SGD" if cbudget is not None else None, sort_order=i,
        ))

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
