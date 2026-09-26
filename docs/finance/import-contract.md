# Statement import contract — v1.1

An AI (cloud or local) turns a bank, card or brokerage statement into one JSON
object. The tracker treats that JSON as **proposed** data:

1. **JSON Schema gate.** [`backend/finance/import.schema.json`](../../backend/finance/import.schema.json) (Draft 2020-12) rejects unknown fields and wrong types.
2. **Pydantic parse.** Every `account_ref` must be an existing account's import ref, or be declared in `accounts[]`.
3. **Merchant rules + business rules.** Each row is staged in `finance_import_transactions` as *Ready*, *Review* or *Duplicate?*.
4. **Review queue** (Finance → Import). Fix rows, optionally "remember" a fix as a merchant rule, create any new accounts, then approve.
5. **Approve.** Rows are promoted into `finance_transactions`. Transfers become two linked legs.

The easiest way to produce valid JSON is **Finance → Import → Get AI prompt**
(`GET /api/finance/imports/prompt`). It embeds the schema, your live account refs
and your category tree, so it never drifts from the database.

## Shape

```json
{
  "schema_version": "1.1",
  "statement": {"institution": "DBS", "statement_type": "bank",
                "statement_period_start": "2026-09-01", "statement_period_end": "2026-09-30",
                "source_currency": "SGD", "import_notes": null},
  "accounts": [{"external_account_ref": "dbs_multiplier", "account_name": "DBS Multiplier",
                "account_type": "savings", "currency": "SGD", "masked_identifier": "****4321",
                "statement_closing_balance": 7289.30}],
  "transactions": [{"account_ref": "dbs_multiplier", "transaction_date": "2026-09-05",
                    "description_raw": "NTUC FAIRPRICE 123", "merchant_normalized": "NTUC FairPrice",
                    "transaction_type": "expense", "amount": -86.40, "currency": "SGD",
                    "category": "food", "subcategory": "groceries", "confidence": 0.93}],
  "warnings": [{"type": "uncertain_category", "message": "…", "transaction_index": 0}]
}
```

## Rules

- **`amount` is signed** in the account's currency: money into the account is `+`, money out is `−`.
  Meaning comes from `transaction_type`, never from the sign.
- **`transaction_type`** is one of: `income`, `expense`, `transfer`, `investment_contribution`,
  `investment_withdrawal`, `interest`, `dividend`, `refund`, `fee`, `adjustment`.
- **Transfer types** (`transfer`, `investment_contribution`, `investment_withdrawal`) should set
  `transfer_account_ref`. On approval the counter leg is created, or linked if the other
  statement already produced it. An unknown counter ref is flagged, not rejected, because it may
  be an account you don't track.
- **`category` / `subcategory`** are slugs of *your* categories (e.g. `taxi_ride_hailing`).
  They're matched case- and punctuation-insensitively against `finance_categories`. Unknown
  values are flagged for review, never rejected. Use `uncategorised` + `needs_review: true`
  when unsure.
- **Currencies:** SGD, USD, KRW, EUR, GBP.
- **Closing-balance check:** when `statement_closing_balance` and `statement_period_end` are
  given, approval compares them with the tracker's computed balance on that date. A mismatch is
  recorded as an `account_balance_mismatch` warning.

## Review flags

| Flag | Meaning |
|---|---|
| `uncategorised`, `unknown_category:x`, `subcategory_not_in_category:x` | No usable category |
| `ai_flagged_needs_review`, `low_confidence` (< 0.60) | The AI was unsure; a trusted merchant rule clears these |
| `account_not_created:x` | Account is declared in the payload but not created yet |
| `unknown_transfer_account:x`, `transfer_missing_counter_account` | The transfer can't be linked |
| `incoming_type_with_negative_amount`, `outgoing_type_with_positive_amount`, `zero_amount` | Sign or amount looks wrong |
| `currency_differs_from_account`, `foreign_currency_without_rate` | FX detail missing |
| `possible_duplicate_of_existing`, `possible_duplicate_within_batch` | Advisory fingerprint match (decision D5) |

"Approve all ready" promotes only unflagged rows. "Approve selected" promotes
exactly the ticked rows, including flagged ones.

## Changes from v1.0 (the finance-manager package)

- `schema_version` is `"1.1"`.
- `account_type` adds `savings` (decision D2).
- `category` is a free string validated against the live DB categories instead of a
  fixed enum. The gaming subcategory `subscription` became `game_subscription`, so names are
  unique across the tree.
- `accounts[].statement_closing_balance_sgd` became `statement_closing_balance_base`.
  `accounts[].masked_identifier` was added.
- Currencies were extended to EUR and GBP to match the tracker.
