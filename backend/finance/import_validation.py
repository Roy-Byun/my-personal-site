"""Validation and staging of an uploaded statement import.

Trust boundary: AI-produced JSON is PROPOSED data. Nothing here writes to
finance_transactions — rows are validated, merchant-ruled, fingerprinted,
flagged and staged into finance_import_transactions. Promotion happens only on
explicit approval (routers/finance_imports.py).

Pipeline: JSON Schema gate -> Pydantic (ImportPayload) -> evaluate_row() per row.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from jsonschema import Draft202012Validator, FormatChecker
from pydantic import BaseModel, field_validator

from models import FinanceImportTransaction, FinanceMerchantRule

from . import constants as C
from .fingerprint import transaction_fingerprint
from .ledger import CategoryIndex

SCHEMA_PATH = pathlib.Path(__file__).with_name("import.schema.json")
IMPORT_SCHEMA = json.loads(SCHEMA_PATH.read_text())
_validator = Draft202012Validator(IMPORT_SCHEMA, format_checker=FormatChecker())


def schema_errors(raw) -> List[str]:
    """Human-readable JSON Schema violations (empty list = passes the gate)."""
    out = []
    for err in sorted(_validator.iter_errors(raw), key=lambda e: list(e.absolute_path)):
        where = "/".join(str(p) for p in err.absolute_path) or "(root)"
        out.append(f"{where}: {err.message}")
    return out[:50]


# ── Payload models (mirror import.schema.json v1.1) ──────────────────────────

class ImportStatementMeta(BaseModel):
    institution: Optional[str] = None
    statement_type: Optional[str] = None
    statement_period_start: Optional[dt.date] = None
    statement_period_end: Optional[dt.date] = None
    source_currency: Optional[str] = None
    import_notes: Optional[str] = None


class ImportAccount(BaseModel):
    external_account_ref: str
    institution: Optional[str] = None
    account_name: str
    account_type: str
    currency: str
    masked_identifier: Optional[str] = None
    statement_closing_balance: Optional[float] = None
    statement_closing_balance_base: Optional[float] = None


class ImportTransactionIn(BaseModel):
    external_id: Optional[str] = None
    account_ref: str
    transaction_date: dt.date
    posting_date: Optional[dt.date] = None
    description_raw: str
    merchant_normalized: Optional[str] = None
    transaction_type: str
    amount: float
    currency: str
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    transfer_account_ref: Optional[str] = None
    is_recurring: bool = False
    is_fixed_expense: bool = False
    needs_review: bool = False
    confidence: Optional[float] = None
    notes: Optional[str] = None


class ImportWarningIn(BaseModel):
    type: str
    message: Optional[str] = None
    transaction_index: Optional[int] = None


class ImportPayload(BaseModel):
    schema_version: str
    statement: ImportStatementMeta
    accounts: List[ImportAccount] = []
    transactions: List[ImportTransactionIn] = []
    warnings: List[ImportWarningIn] = []

    @field_validator("schema_version")
    @classmethod
    def _ver(cls, v):
        if v != C.IMPORT_SCHEMA_VERSION:
            raise ValueError(f"unsupported schema_version {v!r}; expected {C.IMPORT_SCHEMA_VERSION}")
        return v


# ── Merchant rules ───────────────────────────────────────────────────────────

def rule_matches(rule: FinanceMerchantRule, description: str, merchant: Optional[str]) -> bool:
    desc = (description or "").strip()
    merch = (merchant or "").strip()
    pat = rule.pattern or ""
    if not pat:
        return False
    if rule.match_type == "exact":
        return pat.lower() in (desc.lower(), merch.lower())
    if rule.match_type == "regex":
        try:
            return bool(re.search(pat, f"{desc} {merch}", re.IGNORECASE))
        except re.error:
            return False
    return pat.lower() in f"{desc} {merch}".lower()


def first_matching_rule(rules: List[FinanceMerchantRule], description: str, merchant: Optional[str]):
    for r in sorted(rules, key=lambda r: (r.priority, r.id or 0)):
        if r.is_active and rule_matches(r, description, merchant):
            return r
    return None


# ── Row evaluation ───────────────────────────────────────────────────────────

@dataclass
class StagingContext:
    categories: CategoryIndex
    rules: List[FinanceMerchantRule]
    db_account_refs: Dict[str, str]          # external_ref -> account currency
    payload_account_refs: Set[str]
    existing_fingerprints: Dict[str, int]    # fingerprint -> finance_transactions.id
    seen_in_batch: Set[str] = field(default_factory=set)


FINAL_STATUSES = ("approved", "ignored")


def evaluate_row(row: FinanceImportTransaction, ctx: StagingContext, apply_rules: bool = True) -> None:
    """(Re)compute a staged row's category, flags and status in place."""
    if row.status in FINAL_STATUSES:
        return
    reasons: List[str] = []
    rule = None

    if apply_rules and not row.user_edited:
        rule = first_matching_rule(ctx.rules, row.description_raw, row.merchant_normalized)
        row.rule_id = rule.id if rule else None
        if rule and rule.set_transaction_type:
            row.transaction_type = rule.set_transaction_type
    auto_ok = bool(rule and rule.auto_approve)

    # Category: user edits and merchant rules win over the AI's guess.
    if row.user_edited or (rule and rule.category_id):
        if rule and rule.category_id and not row.user_edited:
            row.category_id = rule.category_id
        if row.category_id is None or row.category_id not in ctx.categories.by_id:
            row.category_id = None
            reasons.append("uncategorised")
    else:
        row.category_id, problems = ctx.categories.resolve(row.category, row.subcategory)
        reasons += problems

    if row.ai_needs_review and not row.user_edited and not auto_ok:
        reasons.append("ai_flagged_needs_review")

    # Accounts
    if row.account_ref not in ctx.db_account_refs:
        reasons.append(f"account_not_created:{row.account_ref}")
    elif ctx.db_account_refs[row.account_ref] != row.currency:
        reasons.append("currency_differs_from_account")

    # Transfers need a counter-account to become two legs.
    if row.transaction_type in C.TRANSFER_TYPES:
        if not row.transfer_account_ref:
            reasons.append("transfer_missing_counter_account")
        elif row.transfer_account_ref == row.account_ref:
            reasons.append("transfer_to_same_account")
        elif row.transfer_account_ref not in ctx.db_account_refs:
            reasons.append(f"unknown_transfer_account:{row.transfer_account_ref}")

    # Sign sanity (advisory — meaning comes from type, not sign).
    if row.transaction_type in C.INCOMING_TYPES and row.amount < 0:
        reasons.append("incoming_type_with_negative_amount")
    if row.transaction_type in C.OUTGOING_TYPES and row.amount > 0:
        reasons.append("outgoing_type_with_positive_amount")
    if row.amount == 0:
        reasons.append("zero_amount")

    if row.original_currency and row.original_currency != row.currency and row.exchange_rate is None \
            and row.original_amount is None:
        reasons.append("foreign_currency_without_rate")

    if row.confidence is not None and row.confidence < C.LOW_CONFIDENCE \
            and not row.user_edited and not auto_ok:
        reasons.append("low_confidence")

    # Duplicates (advisory, decision D5): surface, never silently discard.
    row.fingerprint = transaction_fingerprint(
        row.account_ref, row.transaction_date, row.description_raw, row.amount, row.currency
    )
    dup_id = ctx.existing_fingerprints.get(row.fingerprint)
    row.duplicate_of_id = dup_id
    if dup_id is not None:
        reasons.append("possible_duplicate_of_existing")
    elif row.fingerprint in ctx.seen_in_batch:
        reasons.append("possible_duplicate_within_batch")
    ctx.seen_in_batch.add(row.fingerprint)

    row.review_reasons = ",".join(dict.fromkeys(reasons)) or None
    if dup_id is not None:
        row.status = "duplicate"
    else:
        row.status = "needs_review" if reasons else "pending"


def stage_transactions(payload: ImportPayload, import_id: int, ctx: StagingContext) -> List[FinanceImportTransaction]:
    rows = []
    for i, t in enumerate(payload.transactions):
        row = FinanceImportTransaction(
            import_id=import_id, line_index=i, external_id=t.external_id,
            account_ref=t.account_ref, transaction_date=t.transaction_date,
            posting_date=t.posting_date, description_raw=t.description_raw,
            merchant_normalized=t.merchant_normalized, transaction_type=t.transaction_type,
            amount=float(t.amount), currency=t.currency,
            original_amount=t.original_amount, original_currency=t.original_currency,
            exchange_rate=t.exchange_rate, category=t.category, subcategory=t.subcategory,
            transfer_account_ref=t.transfer_account_ref, is_recurring=t.is_recurring,
            is_fixed_expense=t.is_fixed_expense, ai_needs_review=t.needs_review,
            confidence=t.confidence, notes=t.notes, user_edited=False, status="pending",
        )
        evaluate_row(row, ctx)
        rows.append(row)
    return rows


def unknown_refs(payload: ImportPayload, db_refs: Set[str]) -> List[str]:
    """account_refs that are neither existing accounts nor declared in the
    payload's accounts[] block — these reject the upload. (An unknown
    transfer_account_ref is only flagged: it may be an untracked account.)"""
    declared = {a.external_account_ref for a in payload.accounts} | set(db_refs)
    errs = []
    for i, t in enumerate(payload.transactions):
        if t.account_ref not in declared:
            errs.append(f"transactions/{i}: unknown account_ref {t.account_ref!r} (declare it in accounts[])")
    return errs
