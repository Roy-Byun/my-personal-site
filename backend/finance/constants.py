"""Canonical vocabularies for the finance tracker.

Single source of truth for the manual-entry path, the import path and the
import JSON Schema (import.schema.json). Change values here first.
"""

IMPORT_SCHEMA_VERSION = "1.1"

CURRENCIES = ("SGD", "USD", "KRW", "EUR", "GBP")

# ── Accounts ─────────────────────────────────────────────────────────────────
ACCOUNT_TYPES = ("cash", "savings", "investment", "liability", "other_asset")
RISK_ROLES = ("liquid", "low_risk", "market")

# ── Transactions ─────────────────────────────────────────────────────────────
# `amount` is SIGNED in the account's currency: money entering the account is
# positive, money leaving is negative. Meaning comes from transaction_type,
# never from the sign.
TRANSACTION_TYPES = (
    "income",
    "expense",
    "transfer",
    "investment_contribution",
    "investment_withdrawal",
    "interest",
    "dividend",
    "refund",
    "fee",
    "adjustment",
)
# Moving money between your own accounts is neither income nor spending.
TRANSFER_TYPES = ("transfer", "investment_contribution", "investment_withdrawal")
INCOME_TYPES = ("income",)
INVESTMENT_INCOME_TYPES = ("interest", "dividend")
SPEND_TYPES = ("expense", "fee")          # refunds net against spending
INCOMING_TYPES = ("income", "interest", "dividend", "refund")
OUTGOING_TYPES = ("expense", "fee")

TRANSACTION_STATUSES = ("settled", "pending")
TRANSACTION_SOURCES = ("manual", "import", "recurring", "auto_leg")

# ── Categories ───────────────────────────────────────────────────────────────
CATEGORY_KINDS = ("subscription", "fixed", "variable", "tax", "investment", "income", "transfer")
# Category kinds whose spending counts as committed/recurring cost rather than
# discretionary variable spend (Emergency Fund maths).
FIXED_COST_KINDS = ("subscription", "fixed")

# Default taxonomy (seed data, not a validator — categories live in the DB and
# can be edited). slug -> (kind, subcategory slugs)
DEFAULT_CATEGORIES = {
    "income": ("income", ("salary", "bonus", "reimbursement", "other_income")),
    "food": ("variable", ("restaurant", "groceries", "cafe", "delivery")),
    "transport": ("variable", ("public_transport", "taxi_ride_hailing", "flight", "rail", "other_transport")),
    "housing": ("fixed", ()),
    "utilities": ("fixed", ()),
    "health": ("variable", ("clinic", "hospital", "pharmacy", "dental", "other_health")),
    "education": ("variable", ("tuition", "lesson", "books", "course")),
    "entertainment": ("variable", ("movie", "event", "hobby")),
    "gaming": ("variable", ("game_purchase", "in_game_purchase", "game_subscription")),
    "shopping": ("variable", ("electronics", "clothing", "household", "online_shopping", "other_shopping")),
    "travel": ("variable", ()),
    "subscriptions": ("subscription", ("ai_services", "music", "video", "cloud_storage", "software", "other_subscription")),
    "insurance": ("fixed", ()),
    "tax": ("tax", ()),
    "family": ("variable", ()),
    "gifts_donations": ("variable", ()),
    "investment": ("investment", ("portfolio_contribution", "brokerage_transfer", "investment_withdrawal")),
    "investment_income": ("income", ("bank_interest", "dividend", "bond_coupon", "cash_distribution", "other_investment_income")),
    "banking": ("variable", ("bank_fee", "card_fee", "fx_fee")),
    "transfer": ("transfer", ("internal_transfer", "external_transfer")),
    "uncategorised": ("variable", ()),
    "other": ("variable", ()),
}
UNCATEGORISED = "uncategorised"

_DISPLAY_OVERRIDES = {
    "ai_services": "AI services",
    "taxi_ride_hailing": "Taxi / ride-hailing",
    "gifts_donations": "Gifts & donations",
}


def display_name(slug: str) -> str:
    return _DISPLAY_OVERRIDES.get(slug) or slug.replace("_", " ").capitalize()


def slugify(name: str) -> str:
    """'Taxi / ride-hailing' -> 'taxi_ride_hailing'. Used to match import
    category strings against DB category names."""
    out, prev_us = [], False
    for ch in (name or "").strip().lower().replace("&", " "):
        if ch.isalnum():
            out.append(ch)
            prev_us = False
        elif not prev_us:
            out.append("_")
            prev_us = True
    return "".join(out).strip("_")


# ── Import pipeline ──────────────────────────────────────────────────────────
IMPORT_ITEM_STATUSES = ("pending", "needs_review", "approved", "ignored", "duplicate")
IMPORT_STATUSES = ("validated", "partially_approved", "completed")
WARNING_TYPES = (
    "uncertain_category",
    "uncertain_transfer",
    "possible_duplicate",
    "missing_currency",
    "unclear_amount",
    "statement_parse_issue",
    "account_balance_mismatch",
)
RULE_MATCH_TYPES = ("contains", "exact", "regex")
LOW_CONFIDENCE = 0.60
