from datetime import datetime
from sqlalchemy import Boolean, Column, Date, DateTime, Float, Integer, Numeric, String, Text
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")

    # Name
    full_name = Column(String, nullable=True)          # legacy – kept for seed compat
    first_name = Column(String, nullable=True)         # 이름
    last_name = Column(String, nullable=True)          # 성
    western_name = Column(String, nullable=True)       # 영어이름

    # Birthday
    birthday = Column(Date, nullable=True)             # 양력 (solar / Gregorian)
    birthday_lunar = Column(Date, nullable=True)       # 음력 (lunar)
    is_lunar = Column(Boolean, nullable=True, default=False)

    # Contact
    country_code = Column(String(10), nullable=True)   # e.g. "+82"
    phone_number = Column(String(20), nullable=True)

    # Profile
    profile_picture_url = Column(String, nullable=True)

    # Account status
    is_active = Column(Boolean, nullable=False, default=True)
    deactivated_at = Column(DateTime, nullable=True)
    is_suspended = Column(Boolean, nullable=False, default=False)
    suspended_until = Column(DateTime, nullable=True)   # None = permanent ban
    suspension_reason = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    created_by_id = Column(Integer, nullable=False)
    note = Column(String, nullable=True)              # optional "for: Roy"
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    used_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class NewsSource(Base):
    __tablename__ = "news_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    source_type = Column(String, nullable=False)          # "newsapi" | "gnews" | "rss"
    api_key = Column(String, nullable=True)               # newsapi / gnews
    rss_url = Column(String, nullable=True)               # rss only
    query = Column(String, nullable=True)                 # search query for api types
    country = Column(String(10), nullable=True, default="us")
    language = Column(String(10), nullable=True, default="en")
    category_override = Column(String, nullable=True)     # force all articles to this category
    enabled = Column(Boolean, nullable=False, default=True)
    last_fetched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class NewsArticle(Base):
    __tablename__ = "news_articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False, unique=True, index=True)
    source_name = Column(String, nullable=True)
    category = Column(String, nullable=False, default="General", index=True)
    summary = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    author = Column(String, nullable=True)
    published_at = Column(DateTime, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow, index=True)
    is_manual = Column(Boolean, nullable=False, default=False)
    is_archived = Column(Boolean, nullable=False, default=False)


class ArchivedArticle(Base):
    __tablename__ = "archived_articles"

    id = Column(Integer, primary_key=True, index=True)
    original_id = Column(Integer, nullable=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False, index=True)
    source_name = Column(String, nullable=True)
    category = Column(String, nullable=False, default="General", index=True)
    summary = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    author = Column(String, nullable=True)
    published_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, default=datetime.utcnow, index=True)
    archive_index = Column(Integer, nullable=True)
    archive_note = Column(String, nullable=True)


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String, nullable=True)
    priority = Column(String, nullable=False, default="normal")  # "normal" | "important"
    created_by = Column(String, nullable=True)                   # username of creator
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)


class FamilyEvent(Base):
    __tablename__ = "family_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    event_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=True)
    event_type = Column(String, nullable=False, default="custom")
    # "birthday" | "holiday_kr" | "holiday_sg" | "leave" | "custom"
    description = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    linked_user_id = Column(Integer, nullable=True)   # birthday owner
    is_recurring = Column(Boolean, nullable=False, default=False)
    recurrence_type = Column(String(20), nullable=True)      # "daily"|"weekly"|"monthly"|"yearly"
    recurrence_interval = Column(Integer, nullable=True, default=1)
    recurrence_end = Column(Date, nullable=True)
    is_public = Column(Boolean, nullable=False, default=True)
    created_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FamilyRelationship(Base):
    __tablename__ = "family_relationships"

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, nullable=False, index=True)
    to_user_id = Column(Integer, nullable=False, index=True)
    # "parent_of" | "spouse_of" | "sibling_of"
    relation_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FamilyPost(Base):
    __tablename__ = "family_posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    image_url = Column(String, nullable=True)
    post_type = Column(String, nullable=False, default="update")
    # "achievement" | "milestone" | "memorial" | "update"
    author_id = Column(Integer, nullable=False)
    author_name = Column(String, nullable=True)      # denormalized for display
    is_pinned = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class PostReaction(Base):
    __tablename__ = "post_reactions"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    emoji = Column(String(10), nullable=False)  # ❤️ 🎉 😢 💪 🙏 😊


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    project_type = Column(String, nullable=False, default="other")   # "github" | "study" | "planning" | "other"
    status = Column(String, nullable=False, default="active")        # "active" | "paused" | "completed" | "archived"

    # GitHub integration (only relevant when project_type == "github")
    github_repo = Column(String, nullable=True)               # "owner/repo", admin-entered
    github_description = Column(Text, nullable=True)          # auto-synced
    github_language = Column(String, nullable=True)           # auto-synced
    github_stars = Column(Integer, nullable=True)              # auto-synced
    github_last_commit_at = Column(DateTime, nullable=True)    # auto-synced
    github_url = Column(String, nullable=True)                 # auto-synced
    github_synced_at = Column(DateTime, nullable=True)          # last successful sync
    github_sync_error = Column(String, nullable=True)          # admin-only visibility

    external_url = Column(String, nullable=True)
    tags = Column(String, nullable=True)                        # comma-separated
    is_public = Column(Boolean, nullable=False, default=True)   # lets admin draft before publishing
    sort_order = Column(Integer, nullable=False, default=0)

    created_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="todo")       # "todo" | "in_progress" | "done"
    priority = Column(String, nullable=False, default="normal")   # "low" | "normal" | "high"
    due_date = Column(Date, nullable=True)
    position = Column(Integer, nullable=False, default=0)   # dense ordering within (project_id, status)

    created_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class AboutProfile(Base):
    __tablename__ = "about_profile"   # singleton row, lazily created on first GET/PUT

    id = Column(Integer, primary_key=True, index=True)
    headline = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    photo_url = Column(String, nullable=True)   # plain URL string, matches User.profile_picture_url convention
    updated_at = Column(DateTime, default=datetime.utcnow)


class ExperienceEntry(Base):
    __tablename__ = "experience_entries"

    id = Column(Integer, primary_key=True, index=True)
    entry_type = Column(String, nullable=False, default="work")   # "work" | "education"
    title = Column(String, nullable=False)
    organization = Column(String, nullable=False)
    location = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)   # null = ongoing / "present"
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class GalleryPhoto(Base):
    __tablename__ = "gallery_photos"

    id = Column(Integer, primary_key=True, index=True)
    photo_url = Column(String, nullable=False)
    caption = Column(String, nullable=True)
    taken_date = Column(Date, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class LifeMilestone(Base):
    __tablename__ = "life_milestones"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)          # e.g. "PhD Completion"
    target_date = Column(DateTime, nullable=False)
    note = Column(Text, nullable=True)
    is_featured = Column(Boolean, nullable=False, default=False)   # only one enforced True at a time (app-level)
    created_at = Column(DateTime, default=datetime.utcnow)



# ── Finance Tracker (admin-only) ──────────────────────────────────────────────
# Design rules (baseline doc + finance-manager package, docs/finance/):
#   * `amount` is SIGNED in the account's currency (in = +, out = −); meaning
#     comes from transaction_type, never from the sign.
#   * Transfers between own accounts are two linked legs sharing
#     transfer_group_id, so both balances move and no expense is recorded.
#   * amount_base is the base-currency value LOCKED at entry time, so past
#     months never drift when FX moves. Only net worth uses current FX.
#   * Account balances are computed (opening + settled amounts, or latest
#     valuation for investments), never stored, so edits can't drift them.
#   * Imported statements are PROPOSED data: staged in finance_import_* and
#     only reach finance_transactions on explicit approval.
#   * Keep pending and settled transactions separate — never mix in a total.

# Exact storage, float in Python (keeps the reporting maths simple).
Money = Numeric(18, 2, asdecimal=False)


class FinanceProfile(Base):
    __tablename__ = "finance_profile"   # singleton row, lazily created on first GET/PUT

    id = Column(Integer, primary_key=True, index=True)
    base_currency = Column(String(3), nullable=False, default="SGD")   # reporting currency
    goal_currency = Column(String(3), nullable=False, default="KRW")   # denomination of the goal
    tax_resident = Column(String, nullable=True)                       # e.g. "Singapore"

    # Monthly budget assumptions (editable without rewriting history)
    monthly_income = Column(Float, nullable=True)
    income_currency = Column(String(3), nullable=True, default="SGD")
    tax_reserve = Column(Float, nullable=True)                         # monthly provision
    personal_allowance_min = Column(Float, nullable=True)
    personal_allowance_max = Column(Float, nullable=True)

    # Emergency Fund + month-end reminder
    emergency_fund_opening = Column(Float, nullable=True)              # starting balance before month closes
    alert_email = Column(String, nullable=True)                       # month-end reminder recipient

    updated_at = Column(DateTime, default=datetime.utcnow)


class FinanceGoal(Base):
    __tablename__ = "finance_goals"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)                    # e.g. "National Service fund"
    target_amount = Column(Float, nullable=False)
    target_currency = Column(String(3), nullable=False, default="KRW")
    target_date = Column(Date, nullable=True)
    note = Column(Text, nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False)   # only one enforced True (app-level)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceAccount(Base):
    __tablename__ = "finance_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)                     # e.g. "Mari Invest Income"
    institution = Column(String, nullable=True)               # e.g. "Mari" / "DBS"
    # "cash" | "savings" | "investment" | "liability" | "other_asset"
    account_type = Column(String, nullable=False, default="cash")
    currency = Column(String(3), nullable=False, default="SGD")

    # Stable slug that import payloads target (account_ref); never the account number.
    external_ref = Column(String(80), nullable=True, unique=True, index=True)
    masked_identifier = Column(String(40), nullable=True)     # e.g. "****4321"
    opening_balance = Column(Money, nullable=False, default=0)
    include_in_net_worth = Column(Boolean, nullable=False, default=True)

    # Roles used by the dashboard to split liquid vs market-risk exposure
    risk_role = Column(String, nullable=True)        # "liquid" | "low_risk" | "market"
    liquidity_role = Column(String, nullable=True)   # free-text / same vocabulary as risk_role

    planned_monthly_contribution = Column(Float, nullable=True)
    contribution_currency = Column(String(3), nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class FinanceTransaction(Base):
    __tablename__ = "finance_transactions"

    id = Column(Integer, primary_key=True, index=True)
    # Nullable: income/spend can be logged without tracking the bank account.
    account_id = Column(Integer, nullable=True, index=True)
    transaction_date = Column(Date, nullable=False, index=True)
    posting_date = Column(Date, nullable=True)
    description_raw = Column(Text, nullable=False, default="")
    merchant_normalized = Column(String(160), nullable=True)

    transaction_type = Column(String(30), nullable=False)        # finance.constants.TRANSACTION_TYPES
    amount = Column(Money, nullable=False)                       # signed, in `currency`
    currency = Column(String(3), nullable=False, default="SGD")
    original_amount = Column(Money, nullable=True)               # e.g. the USD charge on an SGD card
    original_currency = Column(String(3), nullable=True)
    exchange_rate = Column(Numeric(18, 8, asdecimal=False), nullable=True)
    amount_base = Column(Money, nullable=True)                   # locked at entry; None = no FX then
    base_currency = Column(String(3), nullable=True)

    category_id = Column(Integer, nullable=True, index=True)     # → finance_categories.id (leaf or parent)
    status = Column(String, nullable=False, default="settled")   # "settled" | "pending"
    is_fixed_expense = Column(Boolean, nullable=False, default=False)

    transfer_account_id = Column(Integer, nullable=True)         # the other side of a transfer
    transfer_group_id = Column(String(36), nullable=True, index=True)   # shared by both legs
    recurring_id = Column(Integer, nullable=True, index=True)    # set when generated from a recurring item

    source = Column(String(10), nullable=False, default="manual")   # manual|import|recurring|auto_leg
    import_id = Column(Integer, nullable=True, index=True)       # → finance_statement_imports.id
    fingerprint = Column(String(64), nullable=True, index=True)  # advisory dedupe key
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceValuation(Base):
    __tablename__ = "finance_valuations"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, nullable=False, index=True)
    as_of = Column(Date, nullable=False, index=True)
    market_value = Column(Float, nullable=False)
    currency = Column(String(3), nullable=False, default="SGD")
    total_return = Column(Float, nullable=True)      # platform-reported, already includes payouts
    return_percent = Column(Float, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceAllocation(Base):
    __tablename__ = "finance_allocations"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, nullable=False, index=True)
    as_of = Column(Date, nullable=False, index=True)
    asset_class = Column(String, nullable=False)     # "equity" | "fixed_income" | "cash"
    percentage = Column(Float, nullable=False)       # 0–100
    created_at = Column(DateTime, default=datetime.utcnow)


class FxRate(Base):
    __tablename__ = "fx_rates"

    id = Column(Integer, primary_key=True, index=True)
    base = Column(String(3), nullable=False, index=True)    # e.g. "USD"
    quote = Column(String(3), nullable=False, index=True)   # e.g. "SGD"  → 1 base = rate quote
    rate = Column(Float, nullable=False)
    as_of = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    source = Column(String, nullable=False, default="live")  # "live" | "manual"
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceCategory(Base):
    __tablename__ = "finance_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)                         # unique per parent (app-level)
    parent_id = Column(Integer, nullable=True, index=True)        # set → this is a subcategory
    # "subscription" | "fixed" | "variable" | "tax" | "investment" | "income" | "transfer"
    kind = Column(String, nullable=False, default="variable")
    monthly_budget = Column(Float, nullable=True)                 # spending limit (top-level only)
    budget_currency = Column(String(3), nullable=True)
    color = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceRecurring(Base):
    __tablename__ = "finance_recurring"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)                        # e.g. "Spotify"
    amount = Column(Float, nullable=False)                        # positive magnitude
    currency = Column(String(3), nullable=False, default="SGD")
    day_of_month = Column(Integer, nullable=False, default=1)     # 1-31, clamped to month length
    type = Column(String, nullable=False, default="expense")      # "expense" | "income"
    category_id = Column(Integer, nullable=True)
    account_id = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    last_run_month = Column(String(7), nullable=True)             # "YYYY-MM" dedupe guard
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceMonthlyClose(Base):
    __tablename__ = "finance_monthly_close"
    # One finalised row per calendar month. emergency_contribution_base is the
    # leftover that flows into the Emergency Fund:
    #   income − tax − investments − recurring − variable_spend   (all in base ccy)

    id = Column(Integer, primary_key=True, index=True)
    month = Column(String(7), nullable=False, unique=True, index=True)   # "YYYY-MM"
    base_currency = Column(String(3), nullable=False, default="SGD")
    income_base = Column(Float, nullable=False, default=0.0)
    tax_base = Column(Float, nullable=False, default=0.0)
    investments_base = Column(Float, nullable=False, default=0.0)
    recurring_base = Column(Float, nullable=False, default=0.0)
    variable_spend_base = Column(Float, nullable=False, default=0.0)
    emergency_contribution_base = Column(Float, nullable=False, default=0.0)
    reminder_sent_at = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceMerchantRule(Base):
    """Maps a raw-description pattern to a category (+ optional type override).
    Applied while staging imports; user rules beat the AI's guess."""
    __tablename__ = "finance_merchant_rules"

    id = Column(Integer, primary_key=True, index=True)
    match_type = Column(String(10), nullable=False, default="contains")   # contains|exact|regex
    pattern = Column(String(200), nullable=False)
    category_id = Column(Integer, nullable=True)
    set_transaction_type = Column(String(30), nullable=True)
    priority = Column(Integer, nullable=False, default=100)       # lower = applied first
    auto_approve = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceStatementImport(Base):
    """One uploaded statement JSON batch."""
    __tablename__ = "finance_statement_imports"

    id = Column(Integer, primary_key=True, index=True)
    schema_version = Column(String(10), nullable=False)
    institution = Column(String(120), nullable=True)
    statement_type = Column(String(60), nullable=True)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    source_currency = Column(String(3), nullable=True)
    accounts_json = Column(Text, nullable=True)                  # payload accounts[] (create-missing, balance check)
    status = Column(String(20), nullable=False, default="validated")
    import_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceImportTransaction(Base):
    """A staged, not-yet-authoritative transaction awaiting review/approval."""
    __tablename__ = "finance_import_transactions"

    id = Column(Integer, primary_key=True, index=True)
    import_id = Column(Integer, nullable=False, index=True)
    line_index = Column(Integer, nullable=False, default=0)
    external_id = Column(String(120), nullable=True)
    account_ref = Column(String(80), nullable=False)
    transaction_date = Column(Date, nullable=False)
    posting_date = Column(Date, nullable=True)
    description_raw = Column(Text, nullable=False, default="")
    merchant_normalized = Column(String(160), nullable=True)
    transaction_type = Column(String(30), nullable=False)
    amount = Column(Money, nullable=False)
    currency = Column(String(3), nullable=False)
    original_amount = Column(Money, nullable=True)
    original_currency = Column(String(3), nullable=True)
    exchange_rate = Column(Numeric(18, 8, asdecimal=False), nullable=True)
    category = Column(String(80), nullable=True)                 # as proposed by the AI
    subcategory = Column(String(80), nullable=True)
    category_id = Column(Integer, nullable=True)                 # resolved against finance_categories
    transfer_account_ref = Column(String(80), nullable=True)
    is_recurring = Column(Boolean, nullable=False, default=False)
    is_fixed_expense = Column(Boolean, nullable=False, default=False)
    ai_needs_review = Column(Boolean, nullable=False, default=False)
    confidence = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    fingerprint = Column(String(64), nullable=True, index=True)
    status = Column(String(12), nullable=False, default="pending")   # pending|needs_review|approved|ignored|duplicate
    review_reasons = Column(Text, nullable=True)                  # comma-separated flags
    rule_id = Column(Integer, nullable=True)                      # merchant rule that matched
    user_edited = Column(Boolean, nullable=False, default=False)
    duplicate_of_id = Column(Integer, nullable=True)              # → finance_transactions.id
    approved_transaction_id = Column(Integer, nullable=True)      # set once promoted
    created_at = Column(DateTime, default=datetime.utcnow)


class FinanceImportWarning(Base):
    __tablename__ = "finance_import_warnings"

    id = Column(Integer, primary_key=True, index=True)
    import_id = Column(Integer, nullable=False, index=True)
    type = Column(String(40), nullable=False)                    # finance.constants.WARNING_TYPES
    message = Column(Text, nullable=True)
    transaction_index = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
