"""End-to-end tests for the finance ledger + statement import pipeline.

Run from backend/:  pip install -r requirements.txt -r requirements-dev.txt && pytest
Uses a throwaway SQLite file; the admin dependency is overridden.
"""
import copy
import json
import os
import sys
import tempfile
from datetime import date

import pytest

_DB = os.path.join(tempfile.mkdtemp(), "finance_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, inspect, text  # noqa: E402

from auth_utils import require_admin  # noqa: E402
from database import Base, engine  # noqa: E402
from finance import constants as C  # noqa: E402
from finance.import_validation import IMPORT_SCHEMA  # noqa: E402
from models import FxRate  # noqa: E402
from routers import finance, finance_imports  # noqa: E402

TODAY = date.today()
THIS_MONTH = TODAY.replace(day=1)


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    finance.invalidate_summary_cache()
    app = FastAPI()
    app.include_router(finance.router)
    app.include_router(finance_imports.router)
    app.dependency_overrides[require_admin] = lambda: None
    c = TestClient(app)
    # FX: 1 USD = 1.35 SGD
    from database import SessionLocal
    db = SessionLocal()
    db.add(FxRate(base="USD", quote="SGD", rate=1.35))
    db.commit()
    db.close()
    assert c.post("/finance/categories/seed-defaults").status_code == 200
    return c


def _acct(c, **kw):
    body = {"name": "Acct", "account_type": "cash", "currency": "SGD", **kw}
    r = c.post("/finance/accounts", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _cat_id(c, name, parent=None):
    cats = c.get("/finance/categories").json()
    parent_id = None
    if parent:
        parent_id = next(x["id"] for x in cats if x["name"] == parent and x["parent_id"] is None)
    return next(x["id"] for x in cats if x["name"] == name and x["parent_id"] == parent_id)


def _balances(c):
    return {a["external_ref"] or a["name"]: a["balance"] for a in c.get("/finance/accounts").json()}


# ── Ledger ───────────────────────────────────────────────────────────────────

def test_schema_enums_match_constants():
    d = IMPORT_SCHEMA["$defs"]
    assert d["transactionType"]["enum"] == list(C.TRANSACTION_TYPES)
    assert d["accountType"]["enum"] == list(C.ACCOUNT_TYPES)
    assert d["currency"]["enum"] == list(C.CURRENCIES)
    assert d["isoCurrencyOrNull"]["pattern"] == C.ISO_CURRENCY_PATTERN
    assert IMPORT_SCHEMA["properties"]["transactions"]["items"]["properties"]["original_currency"] == \
        {"$ref": "#/$defs/isoCurrencyOrNull"}
    assert d["warningType"]["enum"] == list(C.WARNING_TYPES)
    assert IMPORT_SCHEMA["properties"]["schema_version"]["const"] == C.IMPORT_SCHEMA_VERSION


def test_default_categories_have_subcategories(client):
    cats = client.get("/finance/categories").json()
    food = next(c for c in cats if c["name"] == "Food" and c["parent_id"] is None)
    subs = {c["name"] for c in cats if c["parent_id"] == food["id"]}
    assert {"Groceries", "Restaurant"} <= subs
    # Idempotent
    assert client.post("/finance/categories/seed-defaults").json()["added"] == 0


def test_manual_expense_and_balance(client):
    _acct(client, name="DBS", external_ref="dbs", opening_balance=1000)
    groceries = _cat_id(client, "Groceries", parent="Food")
    r = client.post("/finance/transactions", json={
        "account_id": 1, "transaction_date": str(TODAY), "transaction_type": "expense",
        "amount": -50, "description_raw": "NTUC", "category_id": groceries,
    })
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["currency"] == "SGD" and t["amount_base"] == -50 and t["source"] == "manual"
    assert _balances(client)["dbs"] == 950


def test_transfer_two_legs_not_cashflow(client):
    _acct(client, name="DBS", external_ref="dbs", opening_balance=1000)
    _acct(client, name="Robo", external_ref="robo", account_type="investment", currency="USD")
    r = client.post("/finance/transactions/transfer", json={
        "from_account_id": 1, "to_account_id": 2, "amount": 135,
        "transaction_date": str(TODAY), "transaction_type": "investment_contribution",
    })
    assert r.status_code == 201, r.text
    legs = r.json()
    assert len(legs) == 2 and legs[0]["transfer_group_id"] == legs[1]["transfer_group_id"]
    bal = _balances(client)
    assert bal["dbs"] == 865 and bal["robo"] == 100  # 135 SGD → 100 USD

    s = client.get("/finance/summary").json()
    assert s["top_spending"] == []                     # a transfer is not spending
    assert s["this_month"]["saved_base"] == pytest.approx(135)
    robo = next(a for a in s["accounts"] if a["name"] == "Robo")
    assert robo["net_contributions"] == 100 and robo["investment_gain"] == 0

    # A valuation above contributions shows as gain (D7).
    client.post("/finance/valuations", json={
        "account_id": 2, "as_of": str(TODAY), "market_value": 110, "currency": "USD"})
    finance.invalidate_summary_cache()
    s = client.get("/finance/summary").json()
    robo = next(a for a in s["accounts"] if a["name"] == "Robo")
    assert robo["investment_gain"] == 10

    # Deleting one leg deletes both.
    client.delete(f"/finance/transactions/{legs[0]['id']}")
    assert client.get("/finance/transactions").json() == []


def test_liability_reduces_net_worth(client):
    _acct(client, name="DBS", opening_balance=1000)
    _acct(client, name="Card", account_type="liability", opening_balance=-200)
    s = client.get("/finance/summary").json()
    assert s["net_worth"]["settled_base"] == 800
    assert s["net_worth"]["liabilities_base"] == 200


def test_month_figures_exclude_transfers(client):
    _acct(client, name="DBS", external_ref="dbs")
    _acct(client, name="Robo", external_ref="robo", account_type="investment")
    salary = _cat_id(client, "Salary", parent="Income")
    tax = _cat_id(client, "Tax")
    for body in (
        {"transaction_type": "income", "amount": 5000, "category_id": salary},
        {"transaction_type": "expense", "amount": -300, "category_id": tax},
        {"transaction_type": "expense", "amount": -200},
        {"transaction_type": "refund", "amount": 20},
    ):
        client.post("/finance/transactions", json={
            "account_id": 1, "transaction_date": str(THIS_MONTH), **body})
    client.post("/finance/transactions/transfer", json={
        "from_account_id": 1, "to_account_id": 2, "amount": 1000,
        "transaction_date": str(THIS_MONTH), "transaction_type": "investment_contribution"})
    r = client.post(f"/finance/monthly-close/{THIS_MONTH:%Y-%m}").json()
    assert r["income_base"] == 5000
    assert r["tax_base"] == 300
    assert r["investments_base"] == 1000
    assert r["variable_spend_base"] == 180
    assert r["emergency_contribution_base"] == 5000 - 300 - 1000 - 180


def test_recurring_materialises_signed(client):
    _acct(client, name="DBS")
    client.post("/finance/recurring", json={
        "label": "Spotify", "amount": 12, "day_of_month": 1, "account_id": 1})
    assert finance.materialise_recurring(finance_db(), TODAY) == 1
    t = client.get("/finance/transactions").json()[0]
    assert t["amount"] == -12 and t["transaction_type"] == "expense" and t["source"] == "recurring"


def finance_db():
    from database import SessionLocal
    return SessionLocal()


# ── Import pipeline ──────────────────────────────────────────────────────────

PAYLOAD = {
    "schema_version": "1.1",
    "statement": {"institution": "DBS", "statement_period_start": "2026-09-01",
                  "statement_period_end": "2026-09-30", "source_currency": "SGD"},
    "accounts": [
        {"external_account_ref": "dbs", "account_name": "DBS Multiplier",
         "account_type": "savings", "currency": "SGD", "statement_closing_balance": 3799.5},
        {"external_account_ref": "robo", "account_name": "digiPortfolio",
         "account_type": "investment", "currency": "SGD"},
    ],
    "transactions": [
        {"account_ref": "dbs", "transaction_date": "2026-09-01", "description_raw": "SALARY ACME",
         "transaction_type": "income", "amount": 5000, "currency": "SGD",
         "category": "income", "subcategory": "salary", "confidence": 0.99},
        {"account_ref": "dbs", "transaction_date": "2026-09-03", "description_raw": "GRAB *RIDE 123",
         "transaction_type": "expense", "amount": -18.5, "currency": "SGD",
         "category": "uncategorised", "needs_review": True, "confidence": 0.4},
        {"account_ref": "dbs", "transaction_date": "2026-09-05", "description_raw": "TO DIGIPORTFOLIO",
         "transaction_type": "investment_contribution", "amount": -1000, "currency": "SGD",
         "category": "investment", "transfer_account_ref": "robo", "confidence": 0.95},
        {"account_ref": "dbs", "transaction_date": "2026-09-06", "description_raw": "COLD STORAGE",
         "transaction_type": "expense", "amount": -182, "currency": "SGD",
         "category": "food", "subcategory": "groceries", "confidence": 0.9},
    ],
    "warnings": [{"type": "uncertain_category", "message": "Grab ride unclear", "transaction_index": 1}],
}


def test_schema_gate_rejects_bad_payload(client):
    bad = copy.deepcopy(PAYLOAD)
    bad["transactions"][0]["surprise"] = 1
    bad["transactions"][1]["transaction_type"] = "spend"
    r = client.post("/finance/imports", content=json.dumps(bad))
    assert r.status_code == 422
    errs = r.json()["detail"]["errors"]
    assert any("surprise" in e for e in errs) and any("spend" in e for e in errs)

    bad = copy.deepcopy(PAYLOAD)
    bad["transactions"][0]["account_ref"] = "nope"
    r = client.post("/finance/imports", content=json.dumps(bad))
    assert r.status_code == 422 and "unknown account_ref" in r.text


def test_import_review_approve_flow(client):
    r = client.post("/finance/imports", content=json.dumps(PAYLOAD))
    assert r.status_code == 201, r.text
    imp = r.json()
    iid = imp["id"]
    # Accounts don't exist yet → every row needs review.
    assert imp["counts"]["needs_review"] == 4

    created = client.post(f"/finance/imports/{iid}/accounts").json()["created"]
    assert created == ["dbs", "robo"]
    q = {row["line_index"]: row for row in client.get(f"/finance/imports/{iid}/queue").json()}
    assert q[0]["status"] == "pending" and q[0]["category_id"] == _cat_id(client, "Salary", parent="Income")
    assert q[1]["status"] == "needs_review"
    assert {"uncategorised", "ai_flagged_needs_review", "low_confidence"} <= set(q[1]["review_reasons"])
    assert q[2]["status"] == "pending" and q[3]["status"] == "pending"

    # Fix the Grab row and remember a rule for next time.
    taxi = _cat_id(client, "Taxi / ride-hailing", parent="Transport")
    r = client.patch(f"/finance/imports/rows/{q[1]['id']}", json={
        "category_id": taxi, "merchant_normalized": "Grab", "remember_rule": True, "rule_auto_approve": True})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending" and r.json()["review_reasons"] == []

    r = client.post(f"/finance/imports/{iid}/approve", json={})
    assert r.status_code == 200, r.text
    assert r.json()["promoted"] == 4
    txns = client.get("/finance/transactions").json()
    assert len(txns) == 5                       # 4 rows + the counter leg of the contribution
    legs = [t for t in txns if t["transaction_type"] == "investment_contribution"]
    assert sorted(t["amount"] for t in legs) == [-1000, 1000]
    assert legs[0]["transfer_group_id"] == legs[1]["transfer_group_id"]
    bal = _balances(client)
    assert bal["dbs"] == pytest.approx(5000 - 18.5 - 1000 - 182) and bal["robo"] == 1000

    # Closing balance 3799.50 matches → no mismatch warning.
    detail = client.get(f"/finance/imports/{iid}").json()
    assert detail["import"]["status"] == "completed"
    assert not [w for w in detail["warnings"] if w["type"] == "account_balance_mismatch"]

    # Re-importing the same statement: every row flagged as a possible duplicate.
    r = client.post("/finance/imports", content=json.dumps(PAYLOAD)).json()
    assert r["counts"]["duplicate"] == 4
    assert client.post(f"/finance/imports/{r['id']}/approve", json={}).json()["promoted"] == 0

    # The remembered rule classifies (and auto-approves) a new Grab charge.
    new = copy.deepcopy(PAYLOAD)
    new["transactions"] = [dict(PAYLOAD["transactions"][1], transaction_date="2026-10-02",
                                description_raw="GRAB *RIDE 999")]
    new["accounts"], new["warnings"] = [], []
    r = client.post("/finance/imports", content=json.dumps(new)).json()
    row = client.get(f"/finance/imports/{r['id']}/queue").json()[0]
    assert row["category_id"] == taxi and row["status"] == "pending" and row["rule_id"]


def test_import_links_counter_statement(client):
    """Importing the brokerage statement after the bank's links to the leg the
    bank import already created instead of double-counting the transfer."""
    _acct(client, name="DBS", external_ref="dbs")
    _acct(client, name="Robo", external_ref="robo", account_type="investment")
    bank = copy.deepcopy(PAYLOAD)
    bank["transactions"] = [PAYLOAD["transactions"][2]]
    bank["accounts"], bank["warnings"] = [], []
    iid = client.post("/finance/imports", content=json.dumps(bank)).json()["id"]
    client.post(f"/finance/imports/{iid}/approve", json={})

    broker = copy.deepcopy(bank)
    broker["transactions"] = [{
        "account_ref": "robo", "transaction_date": "2026-09-06", "description_raw": "Deposit from DBS",
        "transaction_type": "investment_contribution", "amount": 1000, "currency": "SGD",
        "category": "investment", "transfer_account_ref": "dbs", "confidence": 0.9}]
    iid = client.post("/finance/imports", content=json.dumps(broker)).json()["id"]
    assert client.post(f"/finance/imports/{iid}/approve", json={}).json()["promoted"] == 1
    txns = client.get("/finance/transactions").json()
    assert len(txns) == 2
    robo_leg = next(t for t in txns if t["account_id"] == 2)
    assert robo_leg["source"] == "import" and robo_leg["description_raw"] == "Deposit from DBS"


def test_import_settles_matching_pending_contribution(client):
    _acct(client, name="DBS", external_ref="dbs")
    _acct(client, name="Robo", external_ref="robo", account_type="investment")
    client.post("/finance/transactions", json={
        "account_id": 2, "transaction_date": "2026-09-03", "transaction_type": "investment_contribution",
        "amount": 1000, "status": "pending"})
    p = copy.deepcopy(PAYLOAD)
    p["transactions"] = [PAYLOAD["transactions"][2]]
    p["accounts"], p["warnings"] = [], []
    iid = client.post("/finance/imports", content=json.dumps(p)).json()["id"]
    client.post(f"/finance/imports/{iid}/approve", json={})
    txns = client.get("/finance/transactions").json()
    assert len(txns) == 2                               # linked, not a third leg
    robo = next(t for t in txns if t["account_id"] == 2)
    assert robo["status"] == "settled" and robo["transfer_group_id"]
    assert robo["transaction_date"] == "2026-09-05"      # settles on the statement date


def test_balance_mismatch_warning(client):
    _acct(client, name="DBS", external_ref="dbs", account_type="savings")
    p = copy.deepcopy(PAYLOAD)
    p["transactions"] = [PAYLOAD["transactions"][0]]
    p["accounts"] = [PAYLOAD["accounts"][0]]            # claims closing 3799.50
    iid = client.post("/finance/imports", content=json.dumps(p)).json()["id"]
    client.post(f"/finance/imports/{iid}/approve", json={})
    warnings = client.get(f"/finance/imports/{iid}").json()["warnings"]
    assert any(w["type"] == "account_balance_mismatch" for w in warnings)


def test_prompt_lists_live_categories_and_accounts(client):
    _acct(client, name="DBS", external_ref="dbs")
    p = client.get("/finance/imports/prompt").json()["prompt"]
    assert "- dbs: DBS" in p and "taxi_ride_hailing" in p and '"1.1"' in p


# ── Legacy reset ─────────────────────────────────────────────────────────────

def test_reset_legacy_finance(monkeypatch, tmp_path):
    import main

    eng = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE finance_transactions (id INTEGER PRIMARY KEY, type VARCHAR, date DATE)"))
        conn.execute(text("CREATE TABLE finance_accounts (id INTEGER PRIMARY KEY, name VARCHAR)"))
        conn.execute(text("CREATE TABLE finance_profile (id INTEGER PRIMARY KEY, base_currency VARCHAR)"))
        conn.execute(text("INSERT INTO finance_profile (id, base_currency) VALUES (1, 'SGD')"))
    monkeypatch.setattr(main, "engine", eng)
    main._reset_legacy_finance()
    tables = set(inspect(eng).get_table_names())
    assert "finance_transactions" not in tables and "finance_accounts" not in tables
    assert "finance_profile" in tables                 # config is kept

    Base.metadata.create_all(bind=eng)
    main._reset_legacy_finance()                        # new schema → no-op
    assert "transaction_type" in {c["name"] for c in inspect(eng).get_columns("finance_transactions")}


def test_postgres_url_uses_installed_psycopg2_driver(monkeypatch):
    import importlib

    import database

    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db:5432/site")
    monkeypatch.setattr("sqlalchemy.create_engine", lambda url, **kw: url)
    try:
        importlib.reload(database)
        assert database.DATABASE_URL == "postgresql+psycopg2://u:p@db:5432/site"
    finally:
        monkeypatch.undo()
        importlib.reload(database)


def test_baseline_allowed_with_kept_goal(client):
    """After the legacy reset goals survive; the baseline must still seed and
    must not add a second goal."""
    client.post("/finance/goals", json={"label": "Kept", "target_amount": 1, "is_primary": True})
    r = client.post("/finance/baseline")
    assert r.status_code == 200, r.text
    assert [g["label"] for g in client.get("/finance/goals").json()] == ["Kept"]
    assert client.post("/finance/baseline").status_code == 409


def test_settled_pending_contribution_counts_after_valuation(client):
    """Baseline pattern: a pending contribution and a valuation on the same day;
    the bank statement dates the transfer a day earlier. Settling it must not
    hide it behind the valuation (which excluded it) — the gain stays the
    platform's."""
    _acct(client, name="DBS", external_ref="dbs")
    _acct(client, name="Robo", external_ref="robo", account_type="investment", opening_balance=950)
    client.post("/finance/valuations", json={"account_id": 2, "as_of": "2026-08-31", "market_value": 1000})
    client.post("/finance/transactions", json={
        "account_id": 2, "transaction_date": "2026-08-31", "transaction_type": "investment_contribution",
        "amount": 500, "status": "pending"})
    p = copy.deepcopy(PAYLOAD)
    p["transactions"] = [dict(PAYLOAD["transactions"][2], transaction_date="2026-08-30", amount=-500)]
    p["accounts"], p["warnings"] = [], []
    iid = client.post("/finance/imports", content=json.dumps(p)).json()["id"]
    client.post(f"/finance/imports/{iid}/approve", json={})
    robo_leg = next(t for t in client.get("/finance/transactions").json() if t["account_id"] == 2)
    assert robo_leg["status"] == "settled" and robo_leg["transaction_date"] == "2026-09-01"
    finance.invalidate_summary_cache()
    robo = next(a for a in client.get("/finance/summary").json()["accounts"] if a["name"] == "Robo")
    assert robo["settled"] == 1500 and robo["investment_gain"] == 50


def test_both_sides_of_fx_transfer_in_one_import_are_linked(client):
    _acct(client, name="DBS SGD", external_ref="dbs")
    _acct(client, name="DBS USD", external_ref="dbs_usd", currency="USD")
    p = copy.deepcopy(PAYLOAD)
    p["accounts"], p["warnings"] = [], []
    p["transactions"] = [
        {"account_ref": "dbs", "transaction_date": "2026-07-01", "description_raw": "FT260701 SGD leg",
         "transaction_type": "transfer", "amount": -6529.93, "currency": "SGD", "category": "transfer",
         "transfer_account_ref": "dbs_usd", "confidence": 0.9},
        {"account_ref": "dbs_usd", "transaction_date": "2026-07-01", "description_raw": "FT260701 USD leg",
         "transaction_type": "transfer", "amount": 5000, "currency": "USD", "category": "transfer",
         "transfer_account_ref": "dbs", "confidence": 0.9},
        {"account_ref": "dbs", "transaction_date": "2026-07-03", "description_raw": "UNIQLO TOKYO",
         "transaction_type": "expense", "amount": -41.75, "currency": "SGD", "original_amount": -4990,
         "original_currency": "JPY", "category": "shopping", "subcategory": "clothing", "confidence": 0.9},
    ]
    iid = client.post("/finance/imports", content=json.dumps(p)).json()["id"]
    assert client.post(f"/finance/imports/{iid}/approve", json={}).json()["promoted"] == 3
    txns = client.get("/finance/transactions").json()
    assert len(txns) == 3                                  # no synthesised legs
    legs = [t for t in txns if t["transaction_type"] == "transfer"]
    assert legs[0]["transfer_group_id"] and legs[0]["transfer_group_id"] == legs[1]["transfer_group_id"]
    assert sorted((t["currency"], t["amount"]) for t in legs) == [("SGD", -6529.93), ("USD", 5000)]
    jp = next(t for t in txns if t["original_currency"] == "JPY")
    assert jp["original_amount"] == -4990
    bal = _balances(client)
    assert bal["dbs"] == -6529.93 - 41.75 and bal["dbs_usd"] == 5000


def test_import_confirms_recurring_placeholder_instead_of_duplicating(client):
    _acct(client, name="DBS", external_ref="dbs")
    _acct(client, name="DBS USD", external_ref="dbs_usd", currency="USD")
    video = _cat_id(client, "Video", parent="Subscriptions")
    ai = _cat_id(client, "AI services", parent="Subscriptions")
    salary = _cat_id(client, "Salary", parent="Income")
    for body in (
        {"label": "YouTube Premium", "amount": 27.98, "day_of_month": 1, "account_id": 1, "category_id": video},
        {"label": "ChatGPT", "amount": 21.80, "currency": "USD", "day_of_month": 23, "account_id": 2, "category_id": ai},
        {"label": "Salary", "amount": 4500, "type": "income", "day_of_month": 29, "account_id": 1, "category_id": salary},
    ):
        assert client.post("/finance/recurring", json=body).status_code == 201
    assert finance.materialise_recurring(finance_db(), date(2026, 9, 30)) == 3
    assert len(client.get("/finance/transactions").json()) == 3

    p = copy.deepcopy(PAYLOAD)
    p["accounts"], p["warnings"] = [], []
    p["transactions"] = [
        {"account_ref": "dbs", "transaction_date": "2026-09-01", "description_raw": "GOOGLE*YOUTUBEPREMIUM",
         "transaction_type": "expense", "amount": -27.98, "currency": "SGD", "category": "subscriptions",
         "subcategory": "video", "confidence": 0.95},
        # ChatGPT billed on the SGD card this month (FX-converted): still the same subscription.
        {"account_ref": "dbs", "transaction_date": "2026-09-23", "description_raw": "OPENAI *CHATGPT SUBSCR",
         "transaction_type": "expense", "amount": -28.66, "currency": "SGD", "original_amount": -21.80,
         "original_currency": "USD", "category": "subscriptions", "subcategory": "ai_services", "confidence": 0.95},
        {"account_ref": "dbs", "transaction_date": "2026-09-28", "description_raw": "GIRO Salary",
         "transaction_type": "income", "amount": 4500, "currency": "SGD", "category": "income",
         "subcategory": "salary", "confidence": 0.99},
        {"account_ref": "dbs", "transaction_date": "2026-09-05", "description_raw": "NTUC",
         "transaction_type": "expense", "amount": -27.00, "currency": "SGD", "category": "food",
         "subcategory": "groceries", "confidence": 0.95},
    ]
    iid = client.post("/finance/imports", content=json.dumps(p)).json()["id"]
    assert client.post(f"/finance/imports/{iid}/approve", json={}).json()["promoted"] == 4
    txns = client.get("/finance/transactions").json()
    assert len(txns) == 4                                   # 3 confirmed placeholders + 1 new
    chatgpt = next(t for t in txns if "CHATGPT" in t["description_raw"])
    assert chatgpt["source"] == "import" and chatgpt["recurring_id"] and chatgpt["account_id"] == 1
    assert chatgpt["amount"] == -28.66 and chatgpt["currency"] == "SGD"
    assert all(t["source"] == "import" for t in txns)


def test_allowance_card_numbers(client):
    client.put("/finance/profile", json={"monthly_income": 4500, "income_currency": "SGD", "tax_reserve": 150})
    _acct(client, name="DBS", external_ref="dbs")
    _acct(client, name="Robo", account_type="investment", planned_monthly_contribution=1000)
    client.post("/finance/recurring", json={"label": "Violin", "amount": 399, "day_of_month": 1, "account_id": 1})
    client.post("/finance/transactions", json={
        "account_id": 1, "transaction_date": str(THIS_MONTH), "transaction_type": "expense", "amount": -100})
    a = client.get("/finance/summary").json()["allowance"]
    assert a["allowed_variable_base"] == 4500 - 150 - 1000 - 399
    assert a["spent_variable_base"] == 100
    assert a["left_base"] == 4500 - 150 - 1000 - 399 - 100
    assert a["safe_daily_base"] == round(a["left_base"] / a["days_left"], 2)


def test_budget_suggestions_skip_unusual_month(client):
    _acct(client, name="DBS", external_ref="dbs")
    food = _cat_id(client, "Food")
    shopping = _cat_id(client, "Shopping")
    months = []
    y, m = TODAY.year, TODAY.month
    for _ in range(4):                                       # 4 complete months before this one
        m -= 1
        if m == 0:
            m, y = 12, y - 1
        months.append(date(y, m, 10))
    for i, d in enumerate(months):
        client.post("/finance/transactions", json={
            "account_id": 1, "transaction_date": str(d), "transaction_type": "expense",
            "amount": -100 - i, "category_id": food})
    # The oldest month is a trip: big shopping spree.
    client.post("/finance/transactions", json={
        "account_id": 1, "transaction_date": str(months[-1]), "transaction_type": "expense",
        "amount": -2000, "category_id": shopping})
    r = client.get("/finance/budgets/suggest").json()
    trip = f"{months[-1]:%Y-%m}"
    assert next(x for x in r["months"] if x["month"] == trip)["unusual"] is True
    assert trip not in [x["month"] for x in r["months"] if x["selected"]]
    sug = {s["category"]: s for s in r["suggestions"]}
    assert "Shopping" not in sug                             # only spent in the excluded month
    assert sug["Food"]["average_base"] == 101.0 and sug["Food"]["suggested"] == 110.0
    # Explicit selection overrides the default.
    r = client.get(f"/finance/budgets/suggest?months={trip}").json()
    assert {s["category"] for s in r["suggestions"]} == {"Food", "Shopping"}


def test_budget_suggestions_skip_sparse_month(client):
    _acct(client, name="DBS", external_ref="dbs")
    food = _cat_id(client, "Food")
    y, m = TODAY.year, TODAY.month
    ds = []
    for _ in range(4):
        m -= 1
        if m == 0:
            m, y = 12, y - 1
        ds.append(date(y, m, 28))
    for d, amt in zip(ds, (-200, -200, -200, -5)):           # oldest month: a stray 5.00
        client.post("/finance/transactions", json={
            "account_id": 1, "transaction_date": str(d), "transaction_type": "expense",
            "amount": amt, "category_id": food})
    r = client.get("/finance/budgets/suggest").json()
    stray = next(x for x in r["months"] if x["month"] == f"{ds[-1]:%Y-%m}")
    assert stray["sparse"] and not stray["selected"]
    assert r["suggestions"][0]["average_base"] == 200.0


def test_focus_category_can_still_spend(client):
    """Gaming room = allowance left − what other budgets still need (minus the
    part recurring items pay)."""
    _acct(client, name="DBS", external_ref="dbs")
    gaming, food = _cat_id(client, "Gaming"), _cat_id(client, "Food")
    family, subs = _cat_id(client, "Family"), _cat_id(client, "Subscriptions")
    client.put("/finance/profile", json={"monthly_income": 2000, "income_currency": "SGD", "tax_reserve": 0,
                                         "focus_category_id": gaming})
    for cid, b in ((food, 150), (family, 300), (subs, 50)):
        client.put(f"/finance/categories/{cid}", json={"monthly_budget": b, "budget_currency": "SGD"})
    client.post("/finance/recurring", json={"label": "Parents", "amount": 300, "day_of_month": 28,
                                            "account_id": 1, "category_id": family})
    client.post("/finance/recurring", json={"label": "Spotify", "amount": 12, "day_of_month": 28,
                                            "account_id": 1, "category_id": subs})
    for cid, amt in ((food, -50), (gaming, -200)):
        client.post("/finance/transactions", json={"account_id": 1, "transaction_date": str(THIS_MONTH),
                                                   "transaction_type": "expense", "amount": amt, "category_id": cid})
    a = client.get("/finance/summary").json()["allowance"]
    f = a["focus"]
    # allowed = 2000 − 0 − 0 − 312 recurring = 1688; spent 250 → 1438 left.
    assert a["left_base"] == 1438
    # Food still needs 100; Family 0 (recurring covers it); Subscriptions 50 − 12 = 38.
    assert f["reserved_for_others_base"] == 138
    assert f["spent_base"] == 200 and f["can_still_spend_base"] == 1300
    assert f["category"] == "Gaming"


def test_summary_rows_carry_category_ids_for_drilldown(client):
    _acct(client, name="DBS", external_ref="dbs")
    food = _cat_id(client, "Food")
    groceries = _cat_id(client, "Groceries", parent="Food")
    client.put(f"/finance/categories/{food}", json={"monthly_budget": 200, "budget_currency": "SGD"})
    for cid, amt in ((groceries, -40), (None, -9)):
        client.post("/finance/transactions", json={"account_id": 1, "transaction_date": str(THIS_MONTH),
                                                   "transaction_type": "expense", "amount": amt, "category_id": cid})
    s = client.get("/finance/summary").json()
    assert next(b for b in s["budgets"] if b["category"] == "Food")["category_id"] == food
    tops = {t["category"]: t for t in s["top_spending"]}
    assert tops["Food"]["category_id"] == food and not tops["Food"]["uncategorised"]
    assert tops["Uncategorised"]["uncategorised"] is True
    month = f"{THIS_MONTH:%Y-%m}"
    # Drill-down queries: a parent includes its subcategories; uncategorised has its own filter.
    assert [t["amount"] for t in client.get(f"/finance/transactions?category_id={food}&month={month}").json()] == [-40]
    assert [t["amount"] for t in client.get(f"/finance/transactions?uncategorised=true&month={month}").json()] == [-9]


def test_sg_tax_resident_bands():
    from finance import sg_tax
    r = sg_tax.estimate(annual_employment_income=54_000)
    assert r["chargeable_income"] == 53_000 and r["tax"] == 1_460
    assert [b["tax"] for b in r["bands"]] == [0, 200, 350, 910]
    # Higher band and relief cap
    assert sg_tax.resident_tax(100_000)["tax"] == 550 + 2_800 + 2_300
    r = sg_tax.estimate(annual_employment_income=200_000, other_reliefs=100_000)
    assert r["total_reliefs"] == 80_000 and r["chargeable_income"] == 120_000
    # Rebate: known YA2025 60% capped at 200
    assert sg_tax.estimate(annual_employment_income=54_000, year_of_assessment=2025)["tax"] == 1_260


def test_sg_tax_non_resident():
    from finance import sg_tax
    r = sg_tax.estimate(annual_employment_income=54_000, resident=False)
    assert r["method"] == "non_resident_flat" and r["tax"] == 8_100 and r["total_reliefs"] == 0


def test_tax_estimate_endpoint_uses_profile_and_ledger(client):
    client.put("/finance/profile", json={"monthly_income": 4500, "income_currency": "SGD", "tax_reserve": 150})
    _acct(client, name="DBS")
    salary = _cat_id(client, "Salary", parent="Income")
    reimb = _cat_id(client, "Reimbursement", parent="Income")
    y = TODAY.year
    for cat, amt in ((salary, 4500), (salary, 4500), (reimb, 200)):
        client.post("/finance/transactions", json={
            "account_id": 1, "transaction_date": f"{y}-01-25", "transaction_type": "income",
            "amount": amt, "category_id": cat})
    r = client.post("/finance/tax/estimate", json={"year": y, "rebate_pct": 0}).json()
    assert r["gross_income"] == 54_000 and r["tax"] == 1_460
    assert r["monthly_set_aside"] == round(1_460 / 12, 2) and r["year_of_assessment"] == y + 1
    assert r["recorded"] == {"total_sgd": 9_000, "months": [1]}
    r = client.post("/finance/tax/estimate", json={"year": y, "monthly_salary": 5000, "months_employed": 6,
                                                   "bonus": 5000, "rebate_pct": 0}).json()
    assert r["gross_income"] == 35_000 and r["tax"] == 200 + 4_000 * 0.035  # chargeable 34,000
    assert r["monthly_set_aside"] == round(r["tax"] / 6, 2)
