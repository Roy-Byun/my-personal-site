"""Statement import + merchant rules API (admin-only).

Flow (docs/finance/import-contract.md):
  POST /finance/imports                 raw JSON -> JSON Schema gate -> Pydantic
                                        -> merchant rules + business rules -> staged rows
  GET  /finance/imports/{id}/queue      staged rows with review reasons
  PATCH /finance/imports/rows/{row_id}  fix a row (optionally remember as a rule)
  POST /finance/imports/{id}/approve    promote rows into finance_transactions
                                        (transfers become two linked legs)

Nothing reaches finance_transactions without passing through approve.
"""

import json
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from auth_utils import require_admin
from database import get_db
from finance import constants as C
from finance import ledger
from finance.import_validation import (
    IMPORT_SCHEMA,
    ImportAccount,
    ImportPayload,
    StagingContext,
    evaluate_row,
    schema_errors,
    stage_transactions,
    unknown_refs,
)
from finance.ledger import CategoryIndex, FxIndex
from models import (
    FinanceAccount,
    FinanceCategory,
    FinanceImportTransaction,
    FinanceImportWarning,
    FinanceMerchantRule,
    FinanceStatementImport,
    FinanceTransaction,
    User,
)
from routers.finance import invalidate_summary_cache

router = APIRouter(prefix="/finance", tags=["finance:imports"])

MAX_IMPORT_BYTES = 2_000_000


# ── Schemas ──────────────────────────────────────────────────────────────────

class ImportOut(BaseModel):
    id: int
    schema_version: str
    institution: Optional[str]
    statement_type: Optional[str]
    period_start: Optional[date]
    period_end: Optional[date]
    source_currency: Optional[str]
    status: str
    import_notes: Optional[str]
    created_at: datetime
    counts: dict = {}
    model_config = {"from_attributes": True}


class StagedRowOut(BaseModel):
    id: int
    import_id: int
    line_index: int
    account_ref: str
    transaction_date: date
    description_raw: str
    merchant_normalized: Optional[str]
    transaction_type: str
    amount: float
    currency: str
    original_amount: Optional[float]
    original_currency: Optional[str]
    category: Optional[str]
    subcategory: Optional[str]
    category_id: Optional[int]
    transfer_account_ref: Optional[str]
    confidence: Optional[float]
    notes: Optional[str]
    status: str
    review_reasons: List[str] = []
    rule_id: Optional[int]
    user_edited: bool
    duplicate_of_id: Optional[int]
    approved_transaction_id: Optional[int]
    model_config = {"from_attributes": True}


class StagedRowUpdate(BaseModel):
    account_ref: Optional[str] = None
    transaction_date: Optional[str] = None
    description_raw: Optional[str] = None
    merchant_normalized: Optional[str] = None
    transaction_type: Optional[str] = None
    amount: Optional[float] = None
    category_id: Optional[int] = None
    transfer_account_ref: Optional[str] = None
    notes: Optional[str] = None
    # Create a merchant rule from this row's merchant/description → category.
    remember_rule: bool = False
    rule_auto_approve: bool = False


class RuleOut(BaseModel):
    id: int
    match_type: str
    pattern: str
    category_id: Optional[int]
    set_transaction_type: Optional[str]
    priority: int
    auto_approve: bool
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class RuleIn(BaseModel):
    match_type: str = "contains"
    pattern: str
    category_id: Optional[int] = None
    set_transaction_type: Optional[str] = None
    priority: int = 100
    auto_approve: bool = False
    is_active: bool = True


class RuleUpdate(BaseModel):
    match_type: Optional[str] = None
    pattern: Optional[str] = None
    category_id: Optional[int] = None
    set_transaction_type: Optional[str] = None
    priority: Optional[int] = None
    auto_approve: Optional[bool] = None
    is_active: Optional[bool] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _row_out(row: FinanceImportTransaction) -> StagedRowOut:
    data = {c.name: getattr(row, c.name) for c in row.__table__.columns}
    data["review_reasons"] = [r for r in (row.review_reasons or "").split(",") if r]
    return StagedRowOut.model_validate(data)


def _counts(db: Session, import_id: int) -> dict:
    counts = {s: 0 for s in C.IMPORT_ITEM_STATUSES}
    for (st,) in db.query(FinanceImportTransaction.status).filter(
        FinanceImportTransaction.import_id == import_id
    ).all():
        counts[st] = counts.get(st, 0) + 1
    counts["total"] = sum(counts[s] for s in C.IMPORT_ITEM_STATUSES)
    return counts


def _import_out(db: Session, imp: FinanceStatementImport) -> ImportOut:
    out = ImportOut.model_validate(imp)
    out.counts = _counts(db, imp.id)
    return out


def _context(db: Session, payload_refs=()) -> StagingContext:
    return StagingContext(
        categories=CategoryIndex(db.query(FinanceCategory).all()),
        rules=db.query(FinanceMerchantRule).filter(FinanceMerchantRule.is_active == True).all(),  # noqa: E712
        db_account_refs={a.external_ref: a.currency for a in db.query(FinanceAccount).all() if a.external_ref},
        payload_account_refs=set(payload_refs),
        existing_fingerprints={
            fp: tid for tid, fp in db.query(FinanceTransaction.id, FinanceTransaction.fingerprint)
            .filter(FinanceTransaction.fingerprint.isnot(None)).all()
        },
    )


def _get_import(db: Session, import_id: int) -> FinanceStatementImport:
    imp = db.query(FinanceStatementImport).filter(FinanceStatementImport.id == import_id).first()
    if not imp:
        raise HTTPException(404, "Import not found")
    return imp


def _payload_accounts(imp: FinanceStatementImport) -> List[ImportAccount]:
    try:
        return [ImportAccount(**a) for a in json.loads(imp.accounts_json or "[]")]
    except (ValueError, ValidationError):
        return []


def _reevaluate(db: Session, import_id: int) -> None:
    """Re-run the rules over an import's open rows (after accounts/rules change)."""
    imp = _get_import(db, import_id)
    ctx = _context(db, [a.external_account_ref for a in _payload_accounts(imp)])
    rows = db.query(FinanceImportTransaction).filter(
        FinanceImportTransaction.import_id == import_id
    ).order_by(FinanceImportTransaction.line_index).all()
    for row in rows:
        evaluate_row(row, ctx)


def _refresh_import_status(db: Session, imp: FinanceStatementImport) -> None:
    counts = _counts(db, imp.id)
    open_rows = counts["pending"] + counts["needs_review"] + counts["duplicate"]
    if counts["approved"] == 0:
        imp.status = "validated"
    else:
        imp.status = "partially_approved" if open_rows else "completed"


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/imports", status_code=status.HTTP_201_CREATED)
async def upload_import(
    request: Request, _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    raw_bytes = await request.body()
    if len(raw_bytes) > MAX_IMPORT_BYTES:
        raise HTTPException(413, "Import payload too large (max 2 MB)")
    try:
        raw = json.loads(raw_bytes or b"null")
    except ValueError as e:
        raise HTTPException(422, {"errors": [f"Not valid JSON: {e}"]})

    # 1. JSON Schema gate — rejects unknown fields/wrong types (Pydantic coerces).
    errors = schema_errors(raw)
    if errors:
        raise HTTPException(422, {"errors": errors})
    # 2. Pydantic parse.
    try:
        payload = ImportPayload(**raw)
    except ValidationError as e:
        raise HTTPException(422, {"errors": [f"{'/'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors()]})

    ctx = _context(db, [a.external_account_ref for a in payload.accounts])
    ref_errors = unknown_refs(payload, set(ctx.db_account_refs))
    if ref_errors:
        raise HTTPException(422, {"errors": ref_errors})

    st = payload.statement
    imp = FinanceStatementImport(
        schema_version=payload.schema_version,
        institution=st.institution, statement_type=st.statement_type,
        period_start=st.statement_period_start, period_end=st.statement_period_end,
        source_currency=st.source_currency, import_notes=st.import_notes,
        accounts_json=json.dumps([a.model_dump() for a in payload.accounts]),
        status="validated",
    )
    db.add(imp)
    db.flush()

    # 3. Merchant rules + business rules -> staged rows.
    for row in stage_transactions(payload, imp.id, ctx):
        db.add(row)
    for w in payload.warnings:
        db.add(FinanceImportWarning(
            import_id=imp.id, type=w.type, message=w.message, transaction_index=w.transaction_index,
        ))
    db.commit()
    db.refresh(imp)
    return _import_out(db, imp)


@router.get("/imports/schema")
def import_schema(_: User = Depends(require_admin)):
    return IMPORT_SCHEMA


@router.get("/imports/prompt")
def import_prompt(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """A ready-to-paste instruction for an AI (cloud or local) that turns a bank
    statement into import JSON — built from the LIVE categories and accounts so
    the contract never drifts from the database."""
    cidx = CategoryIndex(db.query(FinanceCategory).filter(FinanceCategory.is_active == True).all())  # noqa: E712
    tops = sorted((c for c in cidx.by_id.values() if c.parent_id is None), key=lambda c: (c.sort_order, c.name))
    cat_lines = []
    for c in tops:
        subs = sorted((s for s in cidx.by_id.values() if s.parent_id == c.id), key=lambda s: (s.sort_order, s.name))
        sub_txt = ", ".join(C.slugify(s.name) for s in subs)
        cat_lines.append(f"- {C.slugify(c.name)}" + (f" (subcategories: {sub_txt})" if sub_txt else ""))
    accounts = db.query(FinanceAccount).filter(FinanceAccount.is_active == True).all()  # noqa: E712
    acc_lines = [
        f"- {a.external_ref}: {a.name} ({a.institution or '-'}, {a.account_type}, {a.currency})"
        for a in accounts if a.external_ref
    ] or ["- (none yet — declare every account you use in accounts[])"]

    prompt = f"""Convert the attached bank/card/brokerage statement into JSON for my finance tracker.
Output ONLY one JSON object that validates against the JSON Schema below (schema_version "{C.IMPORT_SCHEMA_VERSION}"). No prose.

Rules:
1. amount is SIGNED in the account's currency: money INTO the account is positive, money OUT is negative. A card purchase is negative; a refund is positive.
2. transaction_type is one of: {", ".join(C.TRANSACTION_TYPES)}.
   - Moving money between two of MY accounts is "transfer" (or "investment_contribution"/"investment_withdrawal" for brokerage/robo-advisor accounts) and MUST set transfer_account_ref. It is never income or expense.
   - Bank interest → "interest"; dividends/coupons → "dividend"; bank/card/FX charges → "fee".
3. account_ref must be one of my account refs below, or declare a new account in accounts[] (short snake_case slug, never the account number).
4. category/subcategory: use the slugs below. If unsure use "uncategorised" and set needs_review=true. Never invent categories.
5. For foreign-currency charges fill original_amount/original_currency (and exchange_rate if shown).
6. Set confidence 0–1 per row; set needs_review=true for anything ambiguous.
7. Put statement-level problems (parse issues, balance mismatch, unclear rows) in warnings[].
8. Fill accounts[].statement_closing_balance when the statement shows it — it is used to check the import.

My accounts (external_ref: name):
{chr(10).join(acc_lines)}

Categories:
{chr(10).join(cat_lines) or "- uncategorised"}

JSON Schema:
{json.dumps(IMPORT_SCHEMA, indent=1)}
"""
    return {"prompt": prompt, "schema_version": C.IMPORT_SCHEMA_VERSION}


# ── Batches & queue ──────────────────────────────────────────────────────────

@router.get("/imports", response_model=List[ImportOut])
def list_imports(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    imps = db.query(FinanceStatementImport).order_by(FinanceStatementImport.id.desc()).all()
    return [_import_out(db, i) for i in imps]


@router.get("/imports/{import_id}")
def get_import(import_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    imp = _get_import(db, import_id)
    known = {a.external_ref for a in db.query(FinanceAccount).all() if a.external_ref}
    accounts = []
    for a in _payload_accounts(imp):
        d = a.model_dump()
        d["exists"] = a.external_account_ref in known
        accounts.append(d)
    warnings = db.query(FinanceImportWarning).filter(
        FinanceImportWarning.import_id == import_id
    ).order_by(FinanceImportWarning.id).all()
    return {
        "import": _import_out(db, imp),
        "accounts": accounts,
        "warnings": [
            {"id": w.id, "type": w.type, "message": w.message, "transaction_index": w.transaction_index}
            for w in warnings
        ],
    }


@router.get("/imports/{import_id}/queue", response_model=List[StagedRowOut])
def review_queue(
    import_id: int, only_open: bool = False,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    _get_import(db, import_id)
    q = db.query(FinanceImportTransaction).filter(FinanceImportTransaction.import_id == import_id)
    if only_open:
        q = q.filter(FinanceImportTransaction.status.in_(("pending", "needs_review", "duplicate")))
    return [_row_out(r) for r in q.order_by(FinanceImportTransaction.line_index).all()]


@router.patch("/imports/rows/{row_id}", response_model=StagedRowOut)
def update_row(
    row_id: int, body: StagedRowUpdate,
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    row = db.query(FinanceImportTransaction).filter(FinanceImportTransaction.id == row_id).first()
    if not row:
        raise HTTPException(404, "Row not found")
    if row.status == "approved":
        raise HTTPException(409, "Row already approved — edit the transaction instead")
    data = body.model_dump(exclude_unset=True)
    remember = data.pop("remember_rule", False)
    auto_approve = data.pop("rule_auto_approve", False)
    if data.get("transaction_type") is not None and data["transaction_type"] not in C.TRANSACTION_TYPES:
        raise HTTPException(400, f"transaction_type must be one of {C.TRANSACTION_TYPES}")
    if data.get("category_id") is not None and not db.query(FinanceCategory).filter(
        FinanceCategory.id == data["category_id"]
    ).first():
        raise HTTPException(400, "category_id does not exist")
    if "transaction_date" in data:
        try:
            data["transaction_date"] = datetime.fromisoformat(data["transaction_date"]).date()
        except (TypeError, ValueError):
            raise HTTPException(400, "transaction_date must be YYYY-MM-DD")
    for field, val in data.items():
        setattr(row, field, val)
    row.user_edited = True
    if row.status == "ignored":
        row.status = "needs_review"

    if remember:
        pattern = (row.merchant_normalized or row.description_raw or "").strip()
        if not pattern:
            raise HTTPException(400, "Nothing to build a rule from")
        db.add(FinanceMerchantRule(
            match_type="contains", pattern=pattern[:200], category_id=row.category_id,
            set_transaction_type=data.get("transaction_type"), auto_approve=auto_approve,
        ))
    db.flush()
    imp = _get_import(db, row.import_id)
    ctx = _context(db, [a.external_account_ref for a in _payload_accounts(imp)])
    evaluate_row(row, ctx, apply_rules=False)
    db.commit()
    db.refresh(row)
    if remember:
        # Let the new rule classify the batch's other (unedited) rows too.
        _reevaluate(db, row.import_id)
        db.commit()
        db.refresh(row)
    return _row_out(row)


@router.post("/imports/{import_id}/accounts")
def create_missing_accounts(
    import_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """Create the accounts declared in the payload's accounts[] that don't exist yet."""
    imp = _get_import(db, import_id)
    known = {a.external_ref for a in db.query(FinanceAccount).all() if a.external_ref}
    created = []
    for a in _payload_accounts(imp):
        if a.external_account_ref in known:
            continue
        acc = FinanceAccount(
            name=a.account_name, institution=a.institution, account_type=a.account_type,
            currency=a.currency, external_ref=a.external_account_ref,
            masked_identifier=a.masked_identifier, opening_balance=0.0,
            sort_order=len(known) + len(created),
        )
        db.add(acc)
        known.add(a.external_account_ref)
        created.append(a.external_account_ref)
    db.flush()
    _reevaluate(db, import_id)
    db.commit()
    invalidate_summary_cache()
    return {"created": created}


@router.post("/imports/{import_id}/revalidate")
def revalidate(import_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Re-run merchant rules + checks (e.g. after adding rules or categories)."""
    _reevaluate(db, import_id)
    db.commit()
    return _counts(db, import_id)


@router.post("/imports/{import_id}/approve")
def approve_import(
    import_id: int,
    row_ids: Optional[List[int]] = Body(default=None, embed=True),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    """Promote staged rows to authoritative transactions.

    With `row_ids`, exactly those rows are promoted (an explicit decision — even
    flagged or duplicate rows). Without, every READY row (status "pending") is
    promoted and flagged rows stay in the queue. Transfer rows become two
    linked legs; if the other statement already produced the counter leg it is
    linked instead of duplicated.
    """
    imp = _get_import(db, import_id)
    q = db.query(FinanceImportTransaction).filter(
        FinanceImportTransaction.import_id == import_id,
        FinanceImportTransaction.approved_transaction_id.is_(None),
    )
    if row_ids:
        q = q.filter(FinanceImportTransaction.id.in_(row_ids),
                     FinanceImportTransaction.status != "approved")
    else:
        q = q.filter(FinanceImportTransaction.status == "pending")

    accounts = {a.external_ref: a for a in db.query(FinanceAccount).all() if a.external_ref}
    idx, base = FxIndex(db), ledger.base_currency(db)
    promoted, skipped = 0, []
    for s in q.order_by(FinanceImportTransaction.line_index).all():
        acc = accounts.get(s.account_ref)
        if acc is None:
            skipped.append({"row_id": s.id, "reason": f"account {s.account_ref!r} not created yet"})
            continue
        counter = accounts.get(s.transfer_account_ref) if s.transaction_type in C.TRANSFER_TYPES else None
        if counter is not None and counter.id == acc.id:
            counter = None

        existing = None
        if counter is not None:
            # Did the counter-account's statement already create this leg?
            existing = ledger.find_matching_leg(
                db, acc.id, s.amount, s.currency, s.transaction_date, counter_account_id=counter.id,
            )
        if existing is not None:
            existing.description_raw = s.description_raw
            existing.merchant_normalized = s.merchant_normalized
            existing.source, existing.import_id = "import", imp.id
            existing.fingerprint = s.fingerprint
            existing.category_id = existing.category_id or s.category_id
            txn = existing
        else:
            txn = FinanceTransaction(
                account_id=acc.id, transaction_date=s.transaction_date, posting_date=s.posting_date,
                description_raw=s.description_raw, merchant_normalized=s.merchant_normalized,
                transaction_type=s.transaction_type, amount=s.amount, currency=s.currency,
                original_amount=s.original_amount, original_currency=s.original_currency,
                exchange_rate=s.exchange_rate, category_id=s.category_id,
                is_fixed_expense=s.is_fixed_expense, status="settled",
                source="import", import_id=imp.id, fingerprint=s.fingerprint, notes=s.notes,
            )
            ledger.lock_base_amount(txn, idx, base)
            db.add(txn)
            db.flush()
            if counter is not None:
                other = ledger.find_matching_leg(
                    db, counter.id, ledger.counter_amount(s.amount, s.currency, counter.currency, idx)[0],
                    counter.currency, s.transaction_date,
                )
                if other is not None and other.id != txn.id:
                    # Link the unlinked leg we already have instead of adding one.
                    group = str(uuid.uuid4())
                    for leg, opp in ((txn, other), (other, txn)):
                        leg.transfer_group_id = group
                        leg.transfer_account_id = opp.account_id
                    # The statement shows the money moved: a pending leg has settled.
                    other.status = "settled"
                else:
                    ledger.create_counter_leg(db, txn, counter, idx, base)
        s.approved_transaction_id = txn.id
        s.status = "approved"
        promoted += 1

    db.flush()
    _check_closing_balances(db, imp)
    _refresh_import_status(db, imp)
    db.commit()
    invalidate_summary_cache()
    return {"import_id": import_id, "promoted": promoted, "skipped": skipped, "counts": _counts(db, import_id)}


def _check_closing_balances(db: Session, imp: FinanceStatementImport) -> None:
    """Compare each account's computed balance at period_end with the statement's
    closing balance; record a warning on mismatch (cash-like accounts only)."""
    if imp.period_end is None:
        return
    db.query(FinanceImportWarning).filter(
        FinanceImportWarning.import_id == imp.id,
        FinanceImportWarning.type == "account_balance_mismatch",
        FinanceImportWarning.message.like("[check]%"),
    ).delete(synchronize_session=False)
    by_ref = {a.external_ref: a for a in db.query(FinanceAccount).all() if a.external_ref}
    for pa in _payload_accounts(imp):
        acc = by_ref.get(pa.external_account_ref)
        if acc is None or pa.statement_closing_balance is None or acc.account_type == "investment":
            continue
        settled, pending = ledger.account_balances(db, [acc], as_of=imp.period_end)[acc.id]
        if abs(settled - pa.statement_closing_balance) > 0.01:
            db.add(FinanceImportWarning(
                import_id=imp.id, type="account_balance_mismatch",
                message=(f"[check] {acc.name}: tracker balance {settled:,.2f} {acc.currency} on "
                         f"{imp.period_end.isoformat()} vs statement {pa.statement_closing_balance:,.2f}. "
                         "Check the opening balance or missing transactions."),
            ))


@router.post("/imports/{import_id}/ignore")
def ignore_rows(
    import_id: int, row_ids: List[int] = Body(..., embed=True),
    _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    imp = _get_import(db, import_id)
    n = 0
    for row in db.query(FinanceImportTransaction).filter(
        FinanceImportTransaction.import_id == import_id,
        FinanceImportTransaction.id.in_(row_ids),
        FinanceImportTransaction.status != "approved",
    ).all():
        row.status = "ignored"
        n += 1
    _refresh_import_status(db, imp)
    db.commit()
    return {"ignored": n, "counts": _counts(db, import_id)}


@router.delete("/imports/{import_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_import(import_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    imp = _get_import(db, import_id)
    if _counts(db, import_id)["approved"]:
        raise HTTPException(409, "This import has approved rows — delete those transactions first")
    db.query(FinanceImportTransaction).filter(FinanceImportTransaction.import_id == import_id).delete()
    db.query(FinanceImportWarning).filter(FinanceImportWarning.import_id == import_id).delete()
    db.delete(imp)
    db.commit()


# ── Merchant rules ───────────────────────────────────────────────────────────

def _validate_rule(db: Session, data: dict) -> None:
    if data.get("match_type") is not None and data["match_type"] not in C.RULE_MATCH_TYPES:
        raise HTTPException(400, f"match_type must be one of {C.RULE_MATCH_TYPES}")
    if data.get("set_transaction_type") and data["set_transaction_type"] not in C.TRANSACTION_TYPES:
        raise HTTPException(400, f"set_transaction_type must be one of {C.TRANSACTION_TYPES}")
    if data.get("category_id") is not None and not db.query(FinanceCategory).filter(
        FinanceCategory.id == data["category_id"]
    ).first():
        raise HTTPException(400, "category_id does not exist")
    if "pattern" in data and not (data["pattern"] or "").strip():
        raise HTTPException(400, "pattern is required")
    if data.get("match_type") == "regex":
        import re
        try:
            re.compile(data.get("pattern") or "")
        except re.error as e:
            raise HTTPException(400, f"invalid regex: {e}")


@router.get("/rules", response_model=List[RuleOut])
def list_rules(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(FinanceMerchantRule).order_by(
        FinanceMerchantRule.priority.asc(), FinanceMerchantRule.id.asc()
    ).all()


@router.post("/rules", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(body: RuleIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    data = body.model_dump()
    _validate_rule(db, data)
    rule = FinanceMerchantRule(**data)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=RuleOut)
def update_rule(
    rule_id: int, body: RuleUpdate, _: User = Depends(require_admin), db: Session = Depends(get_db),
):
    rule = db.query(FinanceMerchantRule).filter(FinanceMerchantRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    data = body.model_dump(exclude_unset=True)
    _validate_rule(db, {"match_type": rule.match_type, "pattern": rule.pattern, **data})
    for field, val in data.items():
        setattr(rule, field, val)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    rule = db.query(FinanceMerchantRule).filter(FinanceMerchantRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
