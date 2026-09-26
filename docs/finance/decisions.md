# Decisions & reconciliations

> **Status in this repo (Sept 2026).** These decisions came with the standalone
> *finance-manager* package, which was designed without this repo. They were
> folded into the **existing** Finance Tracker (`backend/routers/finance.py`) rather than
> mounted alongside it. Each decision below has an *In this repo* note. The old ledger
> tables were dropped on first start (`main._reset_legacy_finance`); profile,
> goals and FX rates were kept.

Design choices made while turning the proposal + import spec into this MVP
package. Read this before re-developing on the Home PC — it explains where the
code deliberately differs from the two source documents.

## D1 — Stack: stay React+Vite + FastAPI (NOT Next.js/Prisma)
The proposal §41 recommends Next.js + Prisma + shadcn/ui. The existing site is
React+Vite + FastAPI + Postgres/SQLite behind Nginx. Introducing Next.js would
mean a second frontend runtime or a rewrite, and Prisma clashes with FastAPI.
**Decision:** keep the existing stack. ORM = SQLAlchemy + Alembic. Charts =
Recharts. For the shadcn look, use Radix primitives + Tailwind in Vite. This
keeps the module droppable into the current repo and consistent with the AOI app.

*In this repo:* adopted, using the existing React + Vite + Tailwind + Recharts and FastAPI + SQLAlchemy stack.

## D2 — Account types reconciled to five
Proposal §9 lists `cash, savings, investment, liability, other_asset`; import
spec §4 dropped `savings`. **Decision:** keep all five (see `constants.ACCOUNT_TYPES`
and the JSON Schema). The import spec should be updated to add `savings`.

*In this repo:* adopted. Import contract v1.1 includes `savings`.

## D3 — Transfers are stored as TWO linked legs
The import spec models a transfer as one row with `transfer_account_ref`. That
under-counts balances (only one account moves). **Decision:** the authoritative
table materialises two legs — an outgoing negative leg and an incoming positive
leg — sharing one `transfer_group_id`, so both account balances stay correct and
no expense is recorded. The import path still *accepts* the single-row form; the
approval step is where the second leg is created. `transfer_account_id` +
`transfer_group_id` columns support this.

*In this repo:* adopted for manual entries (`POST /finance/transactions/transfer`) and imports. When both statements are imported, the second one **links** to the leg the first created (or to an unlinked or pending leg within ±3 days) instead of double-counting.

## D4 — FX timing: lock cash flow, current-rate only for net worth
Cash-flow transactions store `amount_sgd` computed at entry time and are never
re-valued — otherwise historical months would drift whenever rates move. Net
worth is the only place a *current* rate is applied (to live balances/snapshots).
`fx_rates` is a daily cache; never queried on page load; on API failure keep the
last cached value and show its age (spec §34).

*In this repo:* `amount_base` + `base_currency` are locked on every transaction. Monthly figures use them, and net worth uses current FX (`fx_rates`, filled by `fx_fetcher.py` every 12h).

## D5 — Duplicate fingerprint is advisory, not authoritative
`SHA256(account_ref|date|description_raw|amount|currency)` is a first-pass FLAG
only. Raw descriptions vary between interim/final statements and PayNow refs
carry timestamps, so the same transaction can hash two ways, and two identical
small purchases can collide. **Decision:** always surface a match for review,
never auto-discard; pair with `line_index` within a batch for clean re-imports.

*In this repo:* adopted. Duplicates get status `duplicate` and are only promoted if you explicitly select them.

## D6 — Tax engine deferred; simple manual reserve for now
The full Singapore YA-versioned bracket/relief engine (proposal §23) is real
yearly maintenance and IRAS already provides a calculator. **Decision:** v1 uses
a manually-set monthly tax reserve that reduces allowance. Build the engine in
Phase 7 only if it earns its keep.

*In this repo:* the existing monthly `tax_reserve` on the profile is used; tax actually paid = expenses in a category of kind `tax`.

## D7 — Investment gain simplified
Spec §18's formula conflates streams. **Decision:** v1 unrealised gain =
`market_value − net_contributions`; dividends/interest are tracked as separate
income, never mixed into the gain. TWR/MWR is a later upgrade.

*In this repo:* `/finance/summary` returns `net_contributions` and `investment_gain` per investment account. Opening balance of an investment account = cost basis.

## D8 — user_id present but not FK-bound (yet)
Every owned row carries `user_id` (multi-user-ready per §6) but it is a plain
Integer so the module runs standalone. On integration, add
`ForeignKey("users.id")` to the host users table and replace
`finance/deps.py:current_user_id` with the real session check.

*In this repo:* not adopted. The feature is admin-only and single-user, and `require_admin` is the auth seam, so there are no `user_id` columns.

## D9 — Threat model to confirm: Tailscale private vs Funnel public
The docs say "publicly reachable", but the site is on Tailscale. If it stays on
the private tailnet, most of proposal §47–49 is low-stakes and you can move fast.
If exposed via Tailscale Funnel, the full security posture applies. **Action:**
decide this before Phase 2, because it sets how much import/upload hardening is
load-bearing. Either way: finance routes behind auth, authorise server-side,
DB not exposed to the internet, JSON Schema gate on uploads (implemented).

*In this repo:* all finance routes require an admin session. The import endpoint enforces the JSON Schema gate and a 2 MB limit.

## D10 — Postgres optional
For a single-user tool on the mini PC, SQLite is sufficient (backup = copy one
file). `DATABASE_URL` selects Postgres when set, SQLite otherwise — no code change.

*In this repo:* the host's `DATABASE_URL` (Postgres in Docker, SQLite locally) is used. Money columns are `Numeric(18,2)`. There's no Alembic; the repo keeps `create_all` + `_run_migrations`.

## Opportunity — local model for statement extraction
The import step relies on pasting real statements into a cloud AI; that paste is
the actual privacy exposure, more than the website. Given the local-VLM work and
the 5070 Ti, running statement→JSON extraction on a local model (Home PC / mini
PC) keeps statements entirely in your infrastructure and fits beside the Home
Assistant AI setup. Good Phase-2+ target; the JSON contract is model-agnostic.
