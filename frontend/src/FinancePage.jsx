import React, { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, Landmark, ArrowLeftRight, LineChart as LineChartIcon,
  Target, Settings2, Plus, Pencil, Trash2, X, RefreshCw, DownloadCloud, Repeat,
} from "lucide-react";
import { useAuth } from "./AuthContext";
import FinanceDashboard from "./FinanceDashboard";
import { fmtMoney } from "./financeFormat";

// ── shared UI helpers (mirror ProjectsPage.jsx conventions) ──────────────────

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h3 className="font-bold text-slate-800">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-6 py-5 overflow-y-auto">{children}</div>
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</label>
    {children}
  </div>
);

const CURRENCIES = ["SGD", "USD", "KRW", "EUR", "GBP"];

// ── generic API helpers ──────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(`/api/finance${path}`, {
    credentials: "include",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    ...opts,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

const num = (v) => (v === "" || v == null ? null : Number(v));

// ── Accounts tab ─────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [["cash", "Cash"], ["investment", "Investment"]];
const RISK_ROLES = [["liquid", "Liquid"], ["low_risk", "Low risk"], ["market", "Market"]];

const AccountModal = ({ initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ?? {
    name: "", institution: "", account_type: "cash", currency: "SGD",
    risk_role: "liquid", planned_monthly_contribution: "", contribution_currency: "",
    is_active: true, sort_order: 0, notes: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ch = (e) => {
    const { name, value, type, checked } = e.target;
    setF((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const payload = {
      name: f.name, institution: f.institution || null, account_type: f.account_type,
      currency: f.currency, risk_role: f.risk_role || null, liquidity_role: f.risk_role || null,
      planned_monthly_contribution: num(f.planned_monthly_contribution),
      contribution_currency: f.contribution_currency || f.currency,
      is_active: f.is_active, sort_order: Number(f.sort_order) || 0, notes: f.notes || null,
    };
    try {
      await api(isEdit ? `/accounts/${initial.id}` : "/accounts",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isEdit ? `Edit — ${initial.name}` : "New Account"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name *"><input name="name" required value={f.name} onChange={ch} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Institution"><input name="institution" value={f.institution ?? ""} onChange={ch} className={inputCls} /></Field>
          <Field label="Type">
            <select name="account_type" value={f.account_type} onChange={ch} className={inputCls}>
              {ACCOUNT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Currency">
            <select name="currency" value={f.currency} onChange={ch} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Risk role">
            <select name="risk_role" value={f.risk_role ?? ""} onChange={ch} className={inputCls}>
              {RISK_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Planned monthly contribution">
            <input name="planned_monthly_contribution" type="number" step="0.01"
              value={f.planned_monthly_contribution ?? ""} onChange={ch} className={inputCls} />
          </Field>
          <Field label="Sort order"><input name="sort_order" type="number" value={f.sort_order ?? 0} onChange={ch} className={inputCls} /></Field>
        </div>
        <Field label="Notes"><textarea name="notes" rows={2} value={f.notes ?? ""} onChange={ch} className={inputCls} /></Field>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="is_active" checked={!!f.is_active} onChange={ch} className="accent-indigo-600 w-4 h-4" /> Active
        </label>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">
            {busy ? "Saving…" : isEdit ? "Save Changes" : "Create Account"}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const AccountsTab = ({ accounts, reload }) => {
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [err, setErr] = useState("");
  const remove = async (id) => {
    try { await api(`/accounts/${id}`, { method: "DELETE" }); setDel(null); reload(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Accounts</h2>
        <button onClick={() => setModal({})} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
            <tr>
              <th className="px-4 py-3">Account</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Ccy</th><th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Planned/mo</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No accounts yet.</td></tr>}
            {accounts.map((a) => (
              <tr key={a.id} className={`border-b last:border-0 ${a.is_active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 font-semibold text-slate-700">{a.name}
                  {a.institution && <span className="text-slate-400 font-normal"> · {a.institution}</span>}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{a.account_type}</td>
                <td className="px-4 py-3">{a.currency}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{(a.risk_role || "—").replace("_", " ")}</td>
                <td className="px-4 py-3">{a.planned_monthly_contribution != null ? fmtMoney(a.planned_monthly_contribution, a.contribution_currency || a.currency) : "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal(a)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setDel(a)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <AccountModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={reload} />}
      {del && (
        <Modal title={`Delete — ${del.name}`} onClose={() => setDel(null)}>
          <p className="text-sm text-slate-600 mb-4">Deletes the account, its valuations and allocations. Transactions are kept (detached). This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => remove(del.id)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700">Delete</button>
            <button onClick={() => setDel(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Transactions tab ─────────────────────────────────────────────────────────

const TXN_TYPES = ["deposit", "invest", "withdraw", "payout", "income", "spend", "tax", "transfer"];
const TXN_COLORS = {
  deposit: "bg-emerald-100 text-emerald-700", invest: "bg-indigo-100 text-indigo-700",
  payout: "bg-sky-100 text-sky-700", income: "bg-emerald-100 text-emerald-700",
  withdraw: "bg-amber-100 text-amber-700", spend: "bg-rose-100 text-rose-700",
  tax: "bg-slate-200 text-slate-700", transfer: "bg-slate-100 text-slate-600",
};

const today = () => new Date().toISOString().slice(0, 10);

const TxnModal = ({ initial, accounts, categories = [], onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ?? {
    account_id: accounts[0]?.id ?? "", date: today(), type: "spend",
    amount: "", currency: accounts[0]?.currency ?? "SGD", status: "settled",
    category_id: "", note: "",
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const payload = {
      account_id: f.account_id === "" ? null : Number(f.account_id),
      date: f.date, type: f.type, amount: Number(f.amount), currency: f.currency,
      status: f.status,
      category_id: f.category_id === "" || f.category_id == null ? null : Number(f.category_id),
      note: f.note || null,
    };
    try {
      await api(isEdit ? `/transactions/${initial.id}` : "/transactions",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isEdit ? "Edit Transaction" : "New Transaction"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input name="date" type="date" value={f.date} onChange={ch} className={inputCls} required /></Field>
          <Field label="Type">
            <select name="type" value={f.type} onChange={ch} className={inputCls}>
              {TXN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Account">
            <select name="account_id" value={f.account_id ?? ""} onChange={ch} className={inputCls}>
              <option value="">— none (cash flow) —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" value={f.status} onChange={ch} className={inputCls}>
              <option value="settled">settled</option><option value="pending">pending</option>
            </select>
          </Field>
          <Field label="Amount"><input name="amount" type="number" step="0.01" required value={f.amount} onChange={ch} className={inputCls} /></Field>
          <Field label="Currency">
            <select name="currency" value={f.currency} onChange={ch} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Category">
          <select name="category_id" value={f.category_id ?? ""} onChange={ch} className={inputCls}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Note"><input name="note" value={f.note ?? ""} onChange={ch} className={inputCls} /></Field>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const TransactionsTab = ({ accounts, categories = [] }) => {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ account_id: "", month: "", type: "", status: "" });
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [err, setErr] = useState("");
  const accName = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try {
      const data = await api(`/transactions${qs ? `?${qs}` : ""}`);
      setRows(data); setErr("");
    } catch (e) { setErr(e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try { await api(`/transactions/${id}`, { method: "DELETE" }); setDel(null); load(); }
    catch (e) { setErr(e.message); }
  };
  const setF = (k, v) => setFilters((s) => ({ ...s, [k]: v }));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Transactions</h2>
        <button onClick={() => setModal({})} disabled={accounts.length === 0}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1 disabled:opacity-50">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filters.account_id} onChange={(e) => setF("account_id", e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="month" value={filters.month} onChange={(e) => setF("month", e.target.value)} className={`${inputCls} w-auto`} />
        <select value={filters.type} onChange={(e) => setF("type", e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All types</option>{TXN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setF("status", e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All</option><option value="settled">settled</option><option value="pending">pending</option>
        </select>
      </div>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Category</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No transactions.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{t.date}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${TXN_COLORS[t.type] || "bg-slate-100 text-slate-600"}`}>{t.type}</span>
                  {t.status === "pending" && <span className="ml-1 text-[10px] font-bold text-amber-600 uppercase">pending</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.account_id ? accName[t.account_id] || `#${t.account_id}` : "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-700">{fmtMoney(t.amount, t.currency)}</td>
                <td className="px-4 py-3 text-slate-500">{catName[t.category_id] || t.category || "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal(t)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setDel(t)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <TxnModal initial={modal.id ? modal : null} accounts={accounts} categories={categories} onClose={() => setModal(null)} onSaved={load} />}
      {del && (
        <Modal title="Delete transaction" onClose={() => setDel(null)}>
          <p className="text-sm text-slate-600 mb-4">Delete this {del.type} of {fmtMoney(del.amount, del.currency)} on {del.date}?</p>
          <div className="flex gap-3">
            <button onClick={() => remove(del.id)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700">Delete</button>
            <button onClick={() => setDel(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Investments tab (valuations + allocations) ───────────────────────────────

const ValuationModal = ({ accounts, onClose, onSaved }) => {
  const inv = accounts.filter((a) => a.account_type === "investment");
  const [f, setF] = useState({
    account_id: inv[0]?.id ?? "", as_of: today(), market_value: "",
    currency: inv[0]?.currency ?? "SGD", total_return: "", return_percent: "", note: "",
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api("/valuations", { method: "POST", body: JSON.stringify({
        account_id: Number(f.account_id), as_of: f.as_of, market_value: Number(f.market_value),
        currency: f.currency, total_return: num(f.total_return), return_percent: num(f.return_percent), note: f.note || null,
      }) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="New Valuation" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account">
            <select name="account_id" value={f.account_id} onChange={ch} className={inputCls} required>
              {inv.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="As of"><input name="as_of" type="date" value={f.as_of} onChange={ch} className={inputCls} required /></Field>
          <Field label="Market value"><input name="market_value" type="number" step="0.01" required value={f.market_value} onChange={ch} className={inputCls} /></Field>
          <Field label="Currency">
            <select name="currency" value={f.currency} onChange={ch} className={inputCls}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </Field>
          <Field label="Total return (platform)"><input name="total_return" type="number" step="0.01" value={f.total_return} onChange={ch} className={inputCls} /></Field>
          <Field label="Return %"><input name="return_percent" type="number" step="0.01" value={f.return_percent} onChange={ch} className={inputCls} /></Field>
        </div>
        <Field label="Note"><input name="note" value={f.note} onChange={ch} className={inputCls} /></Field>
        <p className="text-[11px] text-slate-400">Enter the platform&apos;s reported Total Return as-is — do not add payouts on top of it.</p>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy || inv.length === 0} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const InvestmentsTab = ({ accounts }) => {
  const [vals, setVals] = useState([]);
  const [allocs, setAllocs] = useState([]);
  const [modal, setModal] = useState(false);
  const [err, setErr] = useState("");
  const accName = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const load = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([api("/valuations"), api("/allocations")]);
      setVals(v); setAllocs(a); setErr("");
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const removeVal = async (id) => { try { await api(`/valuations/${id}`, { method: "DELETE" }); load(); } catch (e) { setErr(e.message); } };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Investments</h2>
        <button onClick={() => setModal(true)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1">
          <Plus className="w-4 h-4" /> New Valuation
        </button>
      </div>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
            <tr><th className="px-4 py-3">As of</th><th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Market value</th><th className="px-4 py-3 text-right">Total return</th>
              <th className="px-4 py-3 text-right">Return %</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {vals.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No valuations yet.</td></tr>}
            {vals.map((v) => (
              <tr key={v.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-slate-600">{v.as_of}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{accName[v.account_id] || `#${v.account_id}`}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(v.market_value, v.currency)}</td>
                <td className={`px-4 py-3 text-right ${v.total_return < 0 ? "text-rose-600" : "text-emerald-600"}`}>{v.total_return != null ? fmtMoney(v.total_return, v.currency) : "—"}</td>
                <td className="px-4 py-3 text-right text-slate-600">{v.return_percent != null ? `${v.return_percent}%` : "—"}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => removeVal(v.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allocs.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-700 mb-2">Latest allocations</h3>
          <div className="flex flex-wrap gap-2">
            {allocs.map((a) => (
              <span key={a.id} className="text-xs bg-white border border-slate-200 rounded-full px-3 py-1 text-slate-600">
                {accName[a.account_id]}: <span className="font-semibold capitalize">{a.asset_class.replace("_", " ")}</span> {a.percentage}%
              </span>
            ))}
          </div>
        </div>
      )}
      {modal && <ValuationModal accounts={accounts} onClose={() => setModal(false)} onSaved={load} />}
    </div>
  );
};

// ── Recurring tab (subscriptions / fixed costs) ──────────────────────────────

const RECURRING_TYPES = [["spend", "Spend"], ["income", "Income"]];

const RecurringModal = ({ initial, accounts, categories, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ?? {
    label: "", amount: "", currency: "SGD", day_of_month: 1, type: "spend",
    category_id: "", account_id: "", start_date: "", end_date: "", note: "", is_active: true,
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => {
    const { name, value, type, checked } = e.target;
    setF((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const payload = {
      label: f.label, amount: Number(f.amount), currency: f.currency,
      day_of_month: Number(f.day_of_month) || 1, type: f.type,
      category_id: f.category_id === "" ? null : Number(f.category_id),
      account_id: f.account_id === "" ? null : Number(f.account_id),
      start_date: f.start_date || null, end_date: f.end_date || null,
      note: f.note || null, is_active: !!f.is_active,
    };
    try {
      await api(isEdit ? `/recurring/${initial.id}` : "/recurring",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isEdit ? `Edit — ${initial.label}` : "New Recurring Item"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Label *"><input name="label" required value={f.label} onChange={ch} placeholder="Spotify, Rent…" className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><input name="amount" type="number" step="0.01" required value={f.amount} onChange={ch} className={inputCls} /></Field>
          <Field label="Currency">
            <select name="currency" value={f.currency} onChange={ch} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Day of month"><input name="day_of_month" type="number" min="1" max="31" value={f.day_of_month} onChange={ch} className={inputCls} /></Field>
          <Field label="Type">
            <select name="type" value={f.type} onChange={ch} className={inputCls}>
              {RECURRING_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select name="category_id" value={f.category_id ?? ""} onChange={ch} className={inputCls}>
              <option value="">— none —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Account">
            <select name="account_id" value={f.account_id ?? ""} onChange={ch} className={inputCls}>
              <option value="">— none —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Start date"><input name="start_date" type="date" value={f.start_date ?? ""} onChange={ch} className={inputCls} /></Field>
          <Field label="End date"><input name="end_date" type="date" value={f.end_date ?? ""} onChange={ch} className={inputCls} /></Field>
        </div>
        <Field label="Note"><input name="note" value={f.note ?? ""} onChange={ch} className={inputCls} /></Field>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="is_active" checked={!!f.is_active} onChange={ch} className="accent-indigo-600 w-4 h-4" /> Active
        </label>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const RecurringTab = ({ accounts, categories, reloadAll }) => {
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const accName = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const load = useCallback(async () => {
    try { setRows(await api("/recurring")); setErr(""); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try { await api(`/recurring/${id}`, { method: "DELETE" }); setDel(null); load(); reloadAll(); }
    catch (e) { setErr(e.message); }
  };
  const runNow = async () => {
    setBusy(true); setErr(""); setMsg("");
    try { const r = await api("/recurring/run", { method: "POST" }); setMsg(`Added ${r.created} transaction(s).`); reloadAll(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const nextCharge = (r) => {
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const day = Math.min(r.day_of_month, dim);
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Recurring subscriptions &amp; fixed costs</h2>
        <div className="flex gap-2">
          <button onClick={runNow} disabled={busy}
            className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-1 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Run now
          </button>
          <button onClick={() => setModal({})} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">Each active item auto-creates a settled transaction on its day of the month. Running is also automatic; &ldquo;Run now&rdquo; catches up items due today.</p>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      {msg && <p className="mb-3 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
      <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
            <tr>
              <th className="px-4 py-3">Label</th><th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Day</th><th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Account</th><th className="px-4 py-3">Next charge</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No recurring items yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={`border-b last:border-0 ${r.is_active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 font-semibold text-slate-700">{r.label}
                  {r.type === "income" && <span className="ml-1 text-[10px] font-bold text-emerald-600 uppercase">income</span>}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(r.amount, r.currency)}</td>
                <td className="px-4 py-3 text-slate-600">{r.day_of_month}</td>
                <td className="px-4 py-3 text-slate-500">{catName[r.category_id] || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{accName[r.account_id] || "—"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.is_active ? nextCharge(r) : "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal(r)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setDel(r)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <RecurringModal initial={modal.id ? modal : null} accounts={accounts} categories={categories}
        onClose={() => setModal(null)} onSaved={() => { load(); reloadAll(); }} />}
      {del && (
        <Modal title={`Delete — ${del.label}`} onClose={() => setDel(null)}>
          <p className="text-sm text-slate-600 mb-4">Deletes the recurring rule. Transactions already generated are kept.</p>
          <div className="flex gap-3">
            <button onClick={() => remove(del.id)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700">Delete</button>
            <button onClick={() => setDel(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Budget & Categories tab ──────────────────────────────────────────────────

const CATEGORY_KINDS = [
  ["subscription", "Subscription"], ["fixed", "Fixed cost"], ["variable", "Variable"],
  ["tax", "Tax"], ["investment", "Investment"], ["income", "Income"],
];

const CategoryModal = ({ initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ?? {
    name: "", kind: "variable", monthly_budget: "", budget_currency: "SGD",
    sort_order: 0, is_active: true,
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => {
    const { name, value, type, checked } = e.target;
    setF((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const payload = {
      name: f.name, kind: f.kind,
      monthly_budget: num(f.monthly_budget),
      budget_currency: f.monthly_budget === "" ? null : (f.budget_currency || "SGD"),
      sort_order: Number(f.sort_order) || 0, is_active: !!f.is_active,
    };
    try {
      await api(isEdit ? `/categories/${initial.id}` : "/categories",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isEdit ? `Edit — ${initial.name}` : "New Category"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name *"><input name="name" required value={f.name} onChange={ch} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <select name="kind" value={f.kind} onChange={ch} className={inputCls}>
              {CATEGORY_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Sort order"><input name="sort_order" type="number" value={f.sort_order ?? 0} onChange={ch} className={inputCls} /></Field>
          <Field label="Monthly budget"><input name="monthly_budget" type="number" step="0.01" value={f.monthly_budget ?? ""} onChange={ch} placeholder="(no limit)" className={inputCls} /></Field>
          <Field label="Budget currency">
            <select name="budget_currency" value={f.budget_currency ?? "SGD"} onChange={ch} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="is_active" checked={!!f.is_active} onChange={ch} className="accent-indigo-600 w-4 h-4" /> Active
        </label>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const CategoriesSection = ({ categories, reloadAll }) => {
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [err, setErr] = useState("");
  const remove = async (id) => {
    try { await api(`/categories/${id}`, { method: "DELETE" }); setDel(null); reloadAll(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Categories &amp; budgets</h2>
        <button onClick={() => setModal({})} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3 text-right">Monthly budget</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {categories.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No categories yet.</td></tr>}
            {categories.map((c) => (
              <tr key={c.id} className={`border-b last:border-0 ${c.is_active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 font-semibold text-slate-700">{c.name}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{c.kind}</td>
                <td className="px-4 py-3 text-right">{c.monthly_budget != null ? fmtMoney(c.monthly_budget, c.budget_currency || "SGD") : "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal(c)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setDel(c)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <CategoryModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={reloadAll} />}
      {del && (
        <Modal title={`Delete — ${del.name}`} onClose={() => setDel(null)}>
          <p className="text-sm text-slate-600 mb-4">Deletes the category. Transactions and recurring items keep their history but lose the category link.</p>
          <div className="flex gap-3">
            <button onClick={() => remove(del.id)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700">Delete</button>
            <button onClick={() => setDel(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const BudgetGoalsTab = ({ categories, reloadAll }) => {
  const [profile, setProfile] = useState(null);
  const [goals, setGoals] = useState([]);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [goalModal, setGoalModal] = useState(null);
  const load = useCallback(async () => {
    try {
      const [prof, gs] = await Promise.all([api("/profile"), api("/goals")]);
      setProfile(prof); setGoals(gs); setErr("");
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveProfile = async (e) => {
    e.preventDefault(); setMsg("");
    try {
      await api("/profile", { method: "PUT", body: JSON.stringify({
        base_currency: profile.base_currency, goal_currency: profile.goal_currency,
        tax_resident: profile.tax_resident || null, income_currency: profile.income_currency,
        monthly_income: num(profile.monthly_income), tax_reserve: num(profile.tax_reserve),
        personal_allowance_min: num(profile.personal_allowance_min),
        personal_allowance_max: num(profile.personal_allowance_max),
        emergency_fund_opening: num(profile.emergency_fund_opening),
        alert_email: profile.alert_email || null,
      }) });
      setMsg("Saved."); reloadAll();
    } catch (e2) { setErr(e2.message); }
  };
  const removeGoal = async (id) => { try { await api(`/goals/${id}`, { method: "DELETE" }); load(); reloadAll(); } catch (e) { setErr(e.message); } };
  const p = (k, v) => setProfile((s) => ({ ...s, [k]: v }));

  if (!profile) return <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>;
  return (
    <div className="space-y-8">
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <form onSubmit={saveProfile} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-800">Monthly budget</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Base currency">
            <select value={profile.base_currency} onChange={(e) => p("base_currency", e.target.value)} className={inputCls}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Goal currency">
            <select value={profile.goal_currency} onChange={(e) => p("goal_currency", e.target.value)} className={inputCls}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Tax residency"><input value={profile.tax_resident ?? ""} onChange={(e) => p("tax_resident", e.target.value)} className={inputCls} /></Field>
          <Field label="Monthly income"><input type="number" step="0.01" value={profile.monthly_income ?? ""} onChange={(e) => p("monthly_income", e.target.value)} className={inputCls} /></Field>
          <Field label="Income currency">
            <select value={profile.income_currency ?? "SGD"} onChange={(e) => p("income_currency", e.target.value)} className={inputCls}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Tax reserve /mo"><input type="number" step="0.01" value={profile.tax_reserve ?? ""} onChange={(e) => p("tax_reserve", e.target.value)} className={inputCls} /></Field>
          <Field label="Allowance min"><input type="number" step="0.01" value={profile.personal_allowance_min ?? ""} onChange={(e) => p("personal_allowance_min", e.target.value)} className={inputCls} /></Field>
          <Field label="Allowance max"><input type="number" step="0.01" value={profile.personal_allowance_max ?? ""} onChange={(e) => p("personal_allowance_max", e.target.value)} className={inputCls} /></Field>
          <Field label="Emergency fund opening"><input type="number" step="0.01" value={profile.emergency_fund_opening ?? ""} onChange={(e) => p("emergency_fund_opening", e.target.value)} className={inputCls} /></Field>
          <Field label="Month-end alert email"><input type="email" value={profile.alert_email ?? ""} onChange={(e) => p("alert_email", e.target.value)} placeholder="you@example.com" className={inputCls} /></Field>
        </div>
        <p className="text-[11px] text-slate-400">
          Each month, <span className="font-semibold">income − tax − investments − recurring − actual variable spend</span> flows into the Emergency Fund (unspent allowance included). The alert email needs SMTP env vars configured on the server; otherwise a reminder banner shows on this page.
        </p>
        <div className="flex items-center gap-3">
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">Save budget</button>
          {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        </div>
      </form>

      <CategoriesSection categories={categories} reloadAll={reloadAll} />

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800">Goals</h2>
          <button onClick={() => setGoalModal({})} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1"><Plus className="w-4 h-4" /> New Goal</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {goals.length === 0 && <p className="text-sm text-slate-400">No goals yet.</p>}
          {goals.map((g) => (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-800">{g.label} {g.is_primary && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase font-bold">Primary</span>}</h3>
                  <p className="text-sm text-slate-500 mt-1">{fmtMoney(g.target_amount, g.target_currency)} {g.target_date && `by ${g.target_date}`}</p>
                  {g.note && <p className="text-xs text-slate-400 mt-2">{g.note}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setGoalModal(g)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => removeGoal(g.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {goalModal && <GoalModal initial={goalModal.id ? goalModal : null} onClose={() => setGoalModal(null)} onSaved={() => { load(); reloadAll(); }} />}
    </div>
  );
};

const GoalModal = ({ initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ?? { label: "", target_amount: "", target_currency: "KRW", target_date: "", note: "", is_primary: false });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => { const { name, value, type, checked } = e.target; setF((s) => ({ ...s, [name]: type === "checkbox" ? checked : value })); };
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api(isEdit ? `/goals/${initial.id}` : "/goals", { method: isEdit ? "PUT" : "POST", body: JSON.stringify({
        label: f.label, target_amount: Number(f.target_amount), target_currency: f.target_currency,
        target_date: f.target_date || null, note: f.note || null, is_primary: !!f.is_primary,
      }) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isEdit ? "Edit Goal" : "New Goal"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Label *"><input name="label" required value={f.label} onChange={ch} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount"><input name="target_amount" type="number" step="1" required value={f.target_amount} onChange={ch} className={inputCls} /></Field>
          <Field label="Currency"><select name="target_currency" value={f.target_currency} onChange={ch} className={inputCls}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Target date"><input name="target_date" type="date" value={f.target_date ?? ""} onChange={ch} className={inputCls} /></Field>
        </div>
        <Field label="Note"><textarea name="note" rows={2} value={f.note ?? ""} onChange={ch} className={inputCls} /></Field>
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="is_primary" checked={!!f.is_primary} onChange={ch} className="accent-indigo-600 w-4 h-4" /> Primary goal (shown on dashboard)</label>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

// ── Settings tab (FX + baseline) ─────────────────────────────────────────────

const SettingsTab = ({ reloadAll }) => {
  const [fx, setFx] = useState([]);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [manual, setManual] = useState({ base: "USD", quote: "SGD", rate: "" });
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => { try { setFx(await api("/fx")); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy("sync"); setErr(""); setMsg("");
    try { const r = await api("/fx/sync", { method: "POST" }); setMsg(`Synced ${r.stored} rates.`); load(); reloadAll(); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  };
  const saveManual = async (e) => {
    e.preventDefault(); setBusy("manual"); setErr(""); setMsg("");
    try {
      await api("/fx", { method: "PUT", body: JSON.stringify({ base: manual.base, quote: manual.quote, rate: Number(manual.rate) }) });
      setMsg("Manual rate saved."); setManual((s) => ({ ...s, rate: "" })); load(); reloadAll();
    } catch (e2) { setErr(e2.message); } finally { setBusy(""); }
  };
  const importBaseline = async () => {
    if (!confirm("Import the August 2026 baseline? This only works on an empty tracker.")) return;
    setBusy("baseline"); setErr(""); setMsg("");
    try { const r = await api("/baseline", { method: "POST" }); setMsg(`Seeded ${r.accounts} accounts.`); reloadAll(); }
    catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  return (
    <div className="space-y-8">
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800">FX rates</h2>
          <button onClick={sync} disabled={busy === "sync"} className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-1 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${busy === "sync" ? "animate-spin" : ""}`} /> Sync live rates
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-5">
            <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
              <tr><th className="px-3 py-2">Pair</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">As of</th></tr>
            </thead>
            <tbody>
              {fx.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">No rates yet — sync or add one.</td></tr>}
              {fx.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-semibold text-slate-700">{r.base}/{r.quote}</td>
                  <td className="px-3 py-2 text-right">{r.rate}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${r.source === "manual" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{r.source}</span></td>
                  <td className="px-3 py-2 text-slate-500">{new Date(r.as_of + "Z").toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={saveManual} className="flex flex-wrap items-end gap-3 border-t pt-4">
          <Field label="Base"><select value={manual.base} onChange={(e) => setManual((s) => ({ ...s, base: e.target.value }))} className={`${inputCls} w-24`}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Quote"><select value={manual.quote} onChange={(e) => setManual((s) => ({ ...s, quote: e.target.value }))} className={`${inputCls} w-24`}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Rate (1 base = ? quote)"><input type="number" step="any" required value={manual.rate} onChange={(e) => setManual((s) => ({ ...s, rate: e.target.value }))} className={`${inputCls} w-40`} /></Field>
          <button disabled={busy === "manual"} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">Set manual rate</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-2">Import baseline</h2>
        <p className="text-sm text-slate-500 mb-4">One-click seed of the August 2026 snapshot (4 accounts, opening balances/valuations, pending contributions, budget, and the KRW 100M goal). Only works when the tracker is empty.</p>
        <button onClick={importBaseline} disabled={busy === "baseline"} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-900 flex items-center gap-2 disabled:opacity-60">
          <DownloadCloud className="w-4 h-4" /> Import August 2026 baseline
        </button>
      </div>
    </div>
  );
};

// ── Page shell ───────────────────────────────────────────────────────────────

const TABS = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["accounts", "Accounts", Landmark],
  ["transactions", "Transactions", ArrowLeftRight],
  ["recurring", "Recurring", Repeat],
  ["investments", "Investments", LineChartIcon],
  ["budget", "Budget & Categories", Target],
  ["settings", "Settings", Settings2],
];

const FinancePage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  const loadShared = useCallback(async () => {
    try {
      const [ar, cr] = await Promise.all([
        fetch("/api/finance/accounts", { credentials: "include" }),
        fetch("/api/finance/categories", { credentials: "include" }),
      ]);
      if (ar.ok) setAccounts(await ar.json());
      if (cr.ok) setCategories(await cr.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadShared(); }, [loadShared, reloadKey]);
  const reloadAll = () => { setReloadKey((k) => k + 1); loadShared(); };

  if (user?.role !== "admin") {
    return <div className="max-w-3xl mx-auto px-6 py-20 text-center text-slate-500">This page is private.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(([key, label, icon]) => {
          const Icon = icon;
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" && <FinanceDashboard key={reloadKey} />}
      {tab === "accounts" && <AccountsTab accounts={accounts} reload={reloadAll} />}
      {tab === "transactions" && <TransactionsTab accounts={accounts} categories={categories} />}
      {tab === "recurring" && <RecurringTab accounts={accounts} categories={categories} reloadAll={reloadAll} />}
      {tab === "investments" && <InvestmentsTab accounts={accounts} />}
      {tab === "budget" && <BudgetGoalsTab categories={categories} reloadAll={reloadAll} />}
      {tab === "settings" && <SettingsTab reloadAll={reloadAll} />}
    </div>
  );
};

export default FinancePage;
