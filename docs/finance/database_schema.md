# Finance database schema

The authoritative source is the finance section of `backend/models.py`. Tables are
created by `Base.metadata.create_all` at startup. Money is `Numeric(18,2)`.

| Table | Purpose |
|---|---|
| `finance_profile` | Singleton: base currency, income/tax/allowance assumptions, Emergency Fund opening, alert email |
| `finance_goals` | Savings goals (one primary) |
| `finance_accounts` | `account_type` ∈ cash, savings, investment, liability, other_asset; `external_ref` (import slug, unique); `masked_identifier`; `opening_balance`; `include_in_net_worth`; risk role; planned contribution |
| `finance_transactions` | **Authoritative ledger.** Signed `amount` in `currency`; `transaction_type` (10 values); `amount_base` locked at entry; `category_id`; `status` settled/pending; `transfer_account_id` + `transfer_group_id` link the two legs of a transfer; `recurring_id`; `source` manual/import/recurring/auto_leg; `import_id`; advisory `fingerprint` |
| `finance_valuations` | Market value snapshots of investment accounts |
| `finance_allocations` | Asset-class split per investment account |
| `finance_categories` | Two-level tree via `parent_id`; `kind` (subscription, fixed, variable, tax, investment, income, transfer) drives the Emergency Fund maths; budgets on top-level categories |
| `finance_recurring` | Monthly expense/income items materialised by the scheduler |
| `finance_monthly_close` | One finalised row per month (Emergency Fund ledger) |
| `finance_merchant_rules` | contains/exact/regex pattern → category (+ optional type), priority, trusted flag |
| `finance_statement_imports` | One uploaded JSON batch (+ its `accounts[]` block) and its lifecycle status |
| `finance_import_transactions` | **Staging** rows awaiting review; `status` pending/needs_review/duplicate/approved/ignored; `review_reasons`; `approved_transaction_id` |
| `finance_import_warnings` | Statement-level warnings (from the AI or the closing-balance check) |
| `fx_rates` | FX observations (live + manual); latest per pair is used |

**Balances are computed**, never stored:
- Cash-like accounts: opening balance + Σ settled amounts.
- Investment accounts: latest valuation + Σ settled amounts dated after it.
- Pending amounts are reported separately.
- Liabilities carry negative balances, so they reduce net worth.

```
finance_accounts ─┬─ finance_transactions   (transfer legs share transfer_group_id)
                  ├─ finance_valuations / finance_allocations
finance_categories (parent_id) ─ finance_transactions, finance_recurring, finance_merchant_rules
finance_statement_imports ─┬─ finance_import_transactions ──(approve)──▶ finance_transactions
                           └─ finance_import_warnings
```
