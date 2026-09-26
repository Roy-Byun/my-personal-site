import React, { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, Landmark, ArrowLeftRight, LineChart as LineChartIcon,
  Target, Settings2, Plus, Pencil, Trash2, X, RefreshCw, DownloadCloud, Repeat,
  FileUp, AlertTriangle, CheckCircle2, Copy, EyeOff, Sparkles, Info, ChevronRight, Calculator,
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

const CURRENCIES = ["SGD", "USD", "KRW", "JPY", "EUR", "GBP"];

// ── generic API helpers ──────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(`/api/finance${path}`, {
    credentials: "include",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    ...opts,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail;
    // FastAPI detail may be a string, {errors: [...]} (import gate) or a
    // pydantic error list.
    let message = typeof detail === "string" ? detail : `Request failed (${res.status})`;
    let errors = [];
    if (detail && Array.isArray(detail.errors)) errors = detail.errors;
    else if (Array.isArray(detail)) errors = detail.map((d) => `${(d.loc || []).join("/")}: ${d.msg}`);
    if (errors.length) message = errors[0];
    const err = new Error(message);
    err.errors = errors;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const num = (v) => (v === "" || v == null ? null : Number(v));

// Categories are a two-level tree (category › subcategory).
const topCategories = (categories) => categories.filter((c) => c.parent_id == null);
const categoryPath = (categories) => {
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
  return Object.fromEntries(categories.map((c) => [
    c.id, c.parent_id && byId[c.parent_id] ? `${byId[c.parent_id].name} › ${c.name}` : c.name,
  ]));
};
const CategoryOptions = ({ categories }) => topCategories(categories).map((top) => {
  const subs = categories.filter((c) => c.parent_id === top.id);
  return subs.length === 0
    ? <option key={top.id} value={top.id}>{top.name}</option>
    : (
      <optgroup key={top.id} label={top.name}>
        <option value={top.id}>{top.name} (general)</option>
        {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </optgroup>
    );
});

// ── Accounts tab ─────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  ["cash", "Cash / current"], ["savings", "Savings"], ["investment", "Investment"],
  ["liability", "Liability (card / loan)"], ["other_asset", "Other asset"],
];
const RISK_ROLES = [["liquid", "Liquid"], ["low_risk", "Low risk"], ["market", "Market"]];

const AccountModal = ({ initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ?? {
    name: "", institution: "", account_type: "cash", currency: "SGD",
    external_ref: "", masked_identifier: "", opening_balance: "", include_in_net_worth: true,
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
      currency: f.currency, external_ref: f.external_ref || null,
      masked_identifier: f.masked_identifier || null,
      opening_balance: num(f.opening_balance) ?? 0, include_in_net_worth: !!f.include_in_net_worth,
      risk_role: f.risk_role || null, liquidity_role: f.risk_role || null,
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
          <Field label="Opening balance">
            <input name="opening_balance" type="number" step="0.01" value={f.opening_balance ?? ""} onChange={ch}
              placeholder={f.account_type === "liability" ? "negative = owed" : "0.00"} className={inputCls} />
          </Field>
          <Field label="Import ref (slug)">
            <input name="external_ref" value={f.external_ref ?? ""} onChange={ch} placeholder="dbs_multiplier" className={inputCls} />
          </Field>
          <Field label="Masked number">
            <input name="masked_identifier" value={f.masked_identifier ?? ""} onChange={ch} placeholder="****4321" className={inputCls} />
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
        <p className="text-[11px] text-slate-400">The import ref is what statement-import JSON uses to target this account. Never store the full account number.</p>
        <Field label="Notes"><textarea name="notes" rows={2} value={f.notes ?? ""} onChange={ch} className={inputCls} /></Field>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="is_active" checked={!!f.is_active} onChange={ch} className="accent-indigo-600 w-4 h-4" /> Active
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="include_in_net_worth" checked={!!f.include_in_net_worth} onChange={ch} className="accent-indigo-600 w-4 h-4" /> Include in net worth
          </label>
        </div>
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
  const typeLabel = Object.fromEntries(ACCOUNT_TYPES);
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
              <th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Import ref</th>
              <th className="px-4 py-3">Risk</th><th className="px-4 py-3">Planned/mo</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No accounts yet.</td></tr>}
            {accounts.map((a) => (
              <tr key={a.id} className={`border-b last:border-0 ${a.is_active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 font-semibold text-slate-700">{a.name}
                  {a.institution && <span className="text-slate-400 font-normal"> · {a.institution}</span>}
                  {a.masked_identifier && <span className="text-slate-400 font-normal"> · {a.masked_identifier}</span>}
                  {!a.include_in_net_worth && <span className="ml-1 text-[10px] font-bold text-slate-400 uppercase">excluded</span>}</td>
                <td className="px-4 py-3 text-slate-600">{typeLabel[a.account_type] || a.account_type}</td>
                <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${a.balance < 0 ? "text-rose-600" : "text-slate-700"}`}>
                  {fmtMoney(a.balance, a.currency)}
                  {a.pending ? <div className="text-[10px] font-bold text-amber-600">{fmtMoney(a.pending, a.currency)} pending</div> : null}
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{a.external_ref || "—"}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{(a.risk_role || "—").replace("_", " ")}</td>
                <td className="px-4 py-3">{a.planned_monthly_contribution != null ? fmtMoney(a.planned_monthly_contribution, a.contribution_currency || a.currency) : "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal(a)} className="p-1.5 text-slate-400 hover:text-indigo-600" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setDel(a)} className="p-1.5 text-slate-400 hover:text-red-500" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Balance = opening balance + settled transactions (investments: latest valuation + contributions since).</p>
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

const TXN_TYPES = [
  ["expense", "Expense"], ["income", "Income"], ["transfer", "Transfer"],
  ["investment_contribution", "Investment contribution"], ["investment_withdrawal", "Investment withdrawal"],
  ["interest", "Interest"], ["dividend", "Dividend"], ["refund", "Refund"], ["fee", "Fee"],
  ["adjustment", "Adjustment"],
];
const TXN_LABEL = Object.fromEntries(TXN_TYPES);
const TRANSFER_TYPES = ["transfer", "investment_contribution", "investment_withdrawal"];
const INCOMING_TYPES = ["income", "interest", "dividend", "refund", "adjustment"];
const TXN_COLORS = {
  income: "bg-emerald-100 text-emerald-700", interest: "bg-sky-100 text-sky-700",
  dividend: "bg-sky-100 text-sky-700", refund: "bg-teal-100 text-teal-700",
  expense: "bg-rose-100 text-rose-700", fee: "bg-amber-100 text-amber-700",
  transfer: "bg-slate-100 text-slate-600", investment_contribution: "bg-indigo-100 text-indigo-700",
  investment_withdrawal: "bg-violet-100 text-violet-700", adjustment: "bg-slate-200 text-slate-700",
};
const SOURCE_LABEL = { import: "imported", recurring: "auto", auto_leg: "linked leg" };

const today = () => new Date().toISOString().slice(0, 10);

// The form asks for a positive amount + direction; the API stores it signed.
const TxnModal = ({ initial, accounts, categories = [], onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(() => initial
    ? { ...initial, magnitude: Math.abs(initial.amount), direction: initial.amount < 0 ? "out" : "in" }
    : {
      account_id: accounts[0]?.id ?? "", transaction_date: today(), transaction_type: "expense",
      magnitude: "", direction: "out", currency: accounts[0]?.currency ?? "SGD", status: "settled",
      category_id: "", description_raw: "", notes: "", transfer_account_id: "",
    });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => {
    const { name, value } = e.target;
    setF((s) => {
      const next = { ...s, [name]: value };
      if (name === "transaction_type") next.direction = INCOMING_TYPES.includes(value) ? "in" : "out";
      if (name === "account_id" && !isEdit) {
        const acc = accounts.find((a) => String(a.id) === String(value));
        if (acc) next.currency = acc.currency;
      }
      return next;
    });
  };
  const isTransfer = TRANSFER_TYPES.includes(f.transaction_type);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const signed = (f.direction === "out" ? -1 : 1) * Math.abs(Number(f.magnitude));
    const payload = {
      account_id: f.account_id === "" || f.account_id == null ? null : Number(f.account_id),
      transaction_date: f.transaction_date, transaction_type: f.transaction_type,
      amount: signed, currency: f.currency, status: f.status,
      category_id: f.category_id === "" || f.category_id == null ? null : Number(f.category_id),
      description_raw: f.description_raw || "", notes: f.notes || null,
    };
    if (!isEdit && isTransfer && f.transfer_account_id) payload.transfer_account_id = Number(f.transfer_account_id);
    try {
      await api(isEdit ? `/transactions/${initial.id}` : "/transactions",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isEdit ? "Edit Transaction" : "New Transaction"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Description"><input name="description_raw" value={f.description_raw ?? ""} onChange={ch} placeholder="e.g. NTUC FairPrice" className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input name="transaction_date" type="date" value={f.transaction_date} onChange={ch} className={inputCls} required /></Field>
          <Field label="Type">
            <select name="transaction_type" value={f.transaction_type} onChange={ch} className={inputCls}>
              {TXN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Account">
            <select name="account_id" value={f.account_id ?? ""} onChange={ch} className={inputCls}>
              <option value="">— none (cash flow only) —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" value={f.status} onChange={ch} className={inputCls}>
              <option value="settled">settled</option><option value="pending">pending</option>
            </select>
          </Field>
          <Field label="Amount"><input name="magnitude" type="number" step="0.01" min="0" required value={f.magnitude} onChange={ch} className={inputCls} /></Field>
          <Field label="Direction">
            <select name="direction" value={f.direction} onChange={ch} className={inputCls}>
              <option value="out">Money out (−)</option><option value="in">Money in (+)</option>
            </select>
          </Field>
          <Field label="Currency">
            <select name="currency" value={f.currency} onChange={ch} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {!isEdit && isTransfer && (
            <Field label={f.direction === "out" ? "To account" : "From account"}>
              <select name="transfer_account_id" value={f.transfer_account_id ?? ""} onChange={ch} className={inputCls}>
                <option value="">— untracked account —</option>
                {accounts.filter((a) => String(a.id) !== String(f.account_id)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        {isTransfer && !isEdit && <p className="text-[11px] text-slate-400">Picking the other account creates the matching leg there too. Transfers are never income or spending.</p>}
        {isEdit && initial.transfer_group_id && <p className="text-[11px] text-slate-400">This is one leg of a transfer — date, type, status and amount changes apply to both legs.</p>}
        <Field label="Category">
          <select name="category_id" value={f.category_id ?? ""} onChange={ch} className={inputCls}>
            <option value="">— none —</option>
            <CategoryOptions categories={categories} />
          </select>
        </Field>
        <Field label="Notes"><input name="notes" value={f.notes ?? ""} onChange={ch} className={inputCls} /></Field>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const TransferModal = ({ accounts, onClose, onSaved }) => {
  const [f, setF] = useState({
    from_account_id: accounts[0]?.id ?? "", to_account_id: accounts[1]?.id ?? "",
    amount: "", to_amount: "", transaction_date: today(), transaction_type: "transfer",
    status: "settled", description_raw: "",
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));
  const from = accounts.find((a) => String(a.id) === String(f.from_account_id));
  const to = accounts.find((a) => String(a.id) === String(f.to_account_id));
  const crossCcy = from && to && from.currency !== to.currency;
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api("/transactions/transfer", { method: "POST", body: JSON.stringify({
        from_account_id: Number(f.from_account_id), to_account_id: Number(f.to_account_id),
        amount: Number(f.amount), to_amount: crossCcy ? num(f.to_amount) : null,
        transaction_date: f.transaction_date, transaction_type: f.transaction_type,
        status: f.status, description_raw: f.description_raw || null,
      }) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Transfer between accounts" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select name="from_account_id" value={f.from_account_id} onChange={ch} className={inputCls} required>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </Field>
          <Field label="To">
            <select name="to_account_id" value={f.to_account_id} onChange={ch} className={inputCls} required>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </Field>
          <Field label={`Amount sent${from ? ` (${from.currency})` : ""}`}>
            <input name="amount" type="number" step="0.01" min="0.01" required value={f.amount} onChange={ch} className={inputCls} />
          </Field>
          {crossCcy ? (
            <Field label={`Amount received (${to.currency})`}>
              <input name="to_amount" type="number" step="0.01" min="0.01" value={f.to_amount} onChange={ch} placeholder="blank = today's FX" className={inputCls} />
            </Field>
          ) : <div />}
          <Field label="Date"><input name="transaction_date" type="date" value={f.transaction_date} onChange={ch} className={inputCls} required /></Field>
          <Field label="Kind">
            <select name="transaction_type" value={f.transaction_type} onChange={ch} className={inputCls}>
              {TRANSFER_TYPES.map((k) => <option key={k} value={k}>{TXN_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" value={f.status} onChange={ch} className={inputCls}>
              <option value="settled">settled</option><option value="pending">pending</option>
            </select>
          </Field>
        </div>
        <Field label="Description"><input name="description_raw" value={f.description_raw} onChange={ch} placeholder="optional" className={inputCls} /></Field>
        <p className="text-[11px] text-slate-400">Creates two linked legs (money out of one account, into the other). Neither counts as income or spending.</p>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy || accounts.length < 2} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Transfer"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const TransactionsTab = ({ accounts, categories = [], refreshTick, onChanged }) => {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ account_id: "", category_id: "", month: "", type: "", status: "", source: "" });
  const [modal, setModal] = useState(null);
  const [transfer, setTransfer] = useState(false);
  const [del, setDel] = useState(null);
  const [err, setErr] = useState("");
  const accName = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const catName = categoryPath(categories);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try {
      const data = await api(`/transactions${qs ? `?${qs}` : ""}`);
      setRows(data); setErr("");
    } catch (e) { setErr(e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load, refreshTick]);
  const saved = () => { load(); onChanged?.(); };

  const remove = async (id) => {
    try { await api(`/transactions/${id}`, { method: "DELETE" }); setDel(null); saved(); }
    catch (e) { setErr(e.message); }
  };
  const setF = (k, v) => setFilters((s) => ({ ...s, [k]: v }));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-slate-800">Transactions</h2>
        <div className="flex gap-2">
          <button onClick={() => setTransfer(true)} disabled={accounts.length < 2}
            className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-1 disabled:opacity-50">
            <ArrowLeftRight className="w-4 h-4" /> Transfer
          </button>
          <button onClick={() => setModal({})}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filters.account_id} onChange={(e) => setF("account_id", e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filters.category_id} onChange={(e) => setF("category_id", e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All categories</option>
          <CategoryOptions categories={categories} />
        </select>
        <input type="month" value={filters.month} onChange={(e) => setF("month", e.target.value)} className={`${inputCls} w-auto`} />
        <select value={filters.type} onChange={(e) => setF("type", e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All types</option>{TXN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setF("status", e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All statuses</option><option value="settled">settled</option><option value="pending">pending</option>
        </select>
        <select value={filters.source} onChange={(e) => setF("source", e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All sources</option><option value="manual">manual</option><option value="import">imported</option>
          <option value="recurring">recurring</option><option value="auto_leg">linked leg</option>
        </select>
      </div>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Account</th><th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Category</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No transactions.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{t.transaction_date}</td>
                <td className="px-4 py-3 text-slate-700 max-w-[16rem] truncate" title={t.description_raw}>
                  {t.merchant_normalized || t.description_raw || "—"}
                  {SOURCE_LABEL[t.source] && <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase">{SOURCE_LABEL[t.source]}</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${TXN_COLORS[t.transaction_type] || "bg-slate-100 text-slate-600"}`}>{TXN_LABEL[t.transaction_type] || t.transaction_type}</span>
                  {t.status === "pending" && <span className="ml-1 text-[10px] font-bold text-amber-600 uppercase">pending</span>}
                </td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                  {t.account_id ? accName[t.account_id] || `#${t.account_id}` : "—"}
                  {t.transfer_account_id && <span className="text-slate-400"> {t.amount < 0 ? "→" : "←"} {accName[t.transfer_account_id] || `#${t.transfer_account_id}`}</span>}
                </td>
                <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${t.amount < 0 ? "text-slate-700" : "text-emerald-600"}`}>
                  {t.amount > 0 ? "+" : ""}{fmtMoney(t.amount, t.currency)}
                </td>
                <td className="px-4 py-3 text-slate-500">{catName[t.category_id] || "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal(t)} className="p-1.5 text-slate-400 hover:text-indigo-600" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setDel(t)} className="p-1.5 text-slate-400 hover:text-red-500" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <TxnModal initial={modal.id ? modal : null} accounts={accounts} categories={categories} onClose={() => setModal(null)} onSaved={saved} />}
      {transfer && <TransferModal accounts={accounts} onClose={() => setTransfer(false)} onSaved={saved} />}
      {del && (
        <Modal title="Delete transaction" onClose={() => setDel(null)}>
          <p className="text-sm text-slate-600 mb-4">
            Delete this {TXN_LABEL[del.transaction_type] || del.transaction_type} of {fmtMoney(del.amount, del.currency)} on {del.transaction_date}?
            {del.transfer_group_id && " Both legs of the transfer are deleted."}
            {del.source === "import" && " Its import row goes back to the review queue."}
          </p>
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

const RECURRING_TYPES = [["expense", "Expense"], ["income", "Income"]];

const RecurringModal = ({ initial, accounts, categories, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ?? {
    label: "", amount: "", currency: "SGD", day_of_month: 1, type: "expense",
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
              <CategoryOptions categories={categories} />
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
  const catName = categoryPath(categories);
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
    let y = now.getFullYear(), m = now.getMonth(), dd = day;
    if (day < now.getDate()) {
      // Next month, clamped to its length (e.g. day 31 → 30 Nov).
      m += 1;
      if (m === 12) { m = 0; y += 1; }
      dd = Math.min(r.day_of_month, new Date(y, m + 1, 0).getDate());
    }
    // Format in local time — toISOString() would shift to UTC and show the day before.
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
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
  ["tax", "Tax"], ["investment", "Investment"], ["income", "Income"], ["transfer", "Transfer"],
];

const CategoryModal = ({ initial, categories, onClose, onSaved }) => {
  const isEdit = !!initial?.id;
  const [f, setF] = useState(isEdit ? initial : {
    name: "", parent_id: initial?.parent_id ?? "", kind: "variable", monthly_budget: "",
    budget_currency: "SGD", sort_order: 0, is_active: true,
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const isSub = f.parent_id !== "" && f.parent_id != null;
  const ch = (e) => {
    const { name, value, type, checked } = e.target;
    setF((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const payload = {
      name: f.name,
      monthly_budget: isSub ? null : num(f.monthly_budget),
      budget_currency: isSub || f.monthly_budget === "" || f.monthly_budget == null ? null : (f.budget_currency || "SGD"),
      sort_order: Number(f.sort_order) || 0, is_active: !!f.is_active,
    };
    if (!isSub) payload.kind = f.kind;
    if (!isEdit && isSub) payload.parent_id = Number(f.parent_id);
    try {
      await api(isEdit ? `/categories/${initial.id}` : "/categories",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isEdit ? `Edit — ${initial.name}` : isSub ? "New Subcategory" : "New Category"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name *"><input name="name" required value={f.name} onChange={ch} className={inputCls} /></Field>
        {!isEdit && (
          <Field label="Parent">
            <select name="parent_id" value={f.parent_id ?? ""} onChange={ch} className={inputCls}>
              <option value="">— none (top-level category) —</option>
              {topCategories(categories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          {!isSub && (
            <Field label="Kind">
              <select name="kind" value={f.kind} onChange={ch} className={inputCls}>
                {CATEGORY_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
          )}
          <Field label="Sort order"><input name="sort_order" type="number" value={f.sort_order ?? 0} onChange={ch} className={inputCls} /></Field>
          {!isSub && (
            <>
              <Field label="Monthly budget"><input name="monthly_budget" type="number" step="0.01" value={f.monthly_budget ?? ""} onChange={ch} placeholder="(no limit)" className={inputCls} /></Field>
              <Field label="Budget currency">
                <select name="budget_currency" value={f.budget_currency ?? "SGD"} onChange={ch} className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>
        {isSub && <p className="text-[11px] text-slate-400">Subcategories share their parent&apos;s kind and roll up into its budget.</p>}
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

const KIND_BADGE = {
  subscription: "bg-violet-100 text-violet-700", fixed: "bg-sky-100 text-sky-700",
  variable: "bg-slate-100 text-slate-600", tax: "bg-amber-100 text-amber-700",
  investment: "bg-indigo-100 text-indigo-700", income: "bg-emerald-100 text-emerald-700",
  transfer: "bg-slate-200 text-slate-600",
};

// Suggest budgets from actual spending. Months with unusually high spend
// (a trip, a one-off purchase) start unticked; tick/untick to recalculate.
const SuggestBudgetsModal = ({ onClose, onApplied }) => {
  const [data, setData] = useState(null);
  const [months, setMonths] = useState(null);           // null = server default
  const [rows, setRows] = useState({});                  // category_id -> {apply, value}
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    const qs = months ? `?months=${months.join(",")}` : "";
    api(`/budgets/suggest${qs}`).then((d) => {
      setData(d);
      setRows(Object.fromEntries(d.suggestions.map((x) => [x.category_id, { apply: true, value: x.suggested }])));
      setErr("");
    }).catch((e) => setErr(e.message));
  }, [months]);

  const selected = data ? data.months.filter((m) => m.selected).map((m) => m.month) : [];
  const toggle = (m) => {
    const next = selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m].sort();
    setMonths(next.length ? next : ["none"]);
  };
  const apply = async () => {
    setBusy(true); setErr("");
    try {
      for (const x of data.suggestions) {
        const r = rows[x.category_id];
        if (!r?.apply || r.value === "" || r.value == null) continue;
        await api(`/categories/${x.category_id}`, { method: "PUT", body: JSON.stringify({
          monthly_budget: Number(r.value), budget_currency: data.base_currency,
        }) });
      }
      onApplied(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const base = data?.base_currency || "SGD";
  const total = data ? data.suggestions.reduce((a, x) => a + (rows[x.category_id]?.apply ? Number(rows[x.category_id].value) || 0 : 0), 0) : 0;
  const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleString(undefined, { month: "short", year: "2-digit" });

  return (
    <Modal title="Suggest budgets from your spending" onClose={onClose}>
      {!data ? <p className="text-sm text-slate-400">{err || "Loading…"}</p> : (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-2">Average these months (tap to include/exclude):</p>
            <div className="flex flex-wrap gap-1.5">
              {data.months.filter((m) => m.has_data).map((m) => {
                const on = m.selected;
                return (
                  <button key={m.month} type="button" onClick={() => toggle(m.month)} aria-pressed={on}
                    className={`text-xs rounded-full border px-2.5 py-1 ${on ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-500"}`}>
                    {on ? "✓ " : ""}{monthLabel(m.month)} · {fmtMoney(m.spend_base, base)}
                    {m.unusual && <span className={on ? "" : "text-amber-700 font-semibold"}> · unusual</span>}
                    {m.sparse && " · little data"}
                    {m.partial && " · so far"}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Months marked “unusual” (well above your typical month — e.g. a trip) or “little data” start excluded. The current month is partial.</p>
          </div>
          {data.suggestions.length === 0 ? <p className="text-sm text-slate-400">No spending in the selected months.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
                  <tr><th className="py-2 pr-2"></th><th className="py-2 pr-2">Category</th><th className="py-2 px-2 text-right">Average</th>
                    <th className="py-2 px-2 text-right">Now</th><th className="py-2 pl-2 text-right">New budget</th></tr>
                </thead>
                <tbody>
                  {data.suggestions.map((x) => {
                    const r = rows[x.category_id] || { apply: false, value: x.suggested };
                    const set = (patch) => setRows((s2) => ({ ...s2, [x.category_id]: { ...r, ...patch } }));
                    return (
                      <tr key={x.category_id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2"><input type="checkbox" checked={r.apply} onChange={(e) => set({ apply: e.target.checked })} className="accent-indigo-600" aria-label={`Apply ${x.category}`} /></td>
                        <td className="py-1.5 pr-2 text-slate-700" title={Object.entries(x.per_month).map(([m, v]) => `${m}: ${v}`).join("\n")}>{x.category}</td>
                        <td className="py-1.5 px-2 text-right text-slate-500">{fmtMoney(x.average_base, base)}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{x.current_budget != null ? fmtMoney(x.current_budget, x.current_currency || base) : "—"}</td>
                        <td className="py-1.5 pl-2 text-right"><input type="number" step="10" min="0" value={r.value} onChange={(e) => set({ value: e.target.value })} className="w-24 border border-slate-200 rounded px-2 py-1 text-right text-sm" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">Total of ticked budgets: <span className="font-semibold text-slate-700">{fmtMoney(total, base)}</span>. Suggestions are the average rounded up to the next 10 — edit any before applying.</p>
          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          <div className="flex gap-3">
            <button onClick={apply} disabled={busy || data.suggestions.length === 0} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Applying…" : "Apply ticked budgets"}</button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// Budget grid: one row per top-level category with this-month spend +
// progress; subcategories expand underneath. Edits go through CategoryModal.
const CategoryBudgetGrid = ({ categories, budgets = [], base = "SGD", onChanged }) => {
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});
  const [suggest, setSuggest] = useState(false);
  const byName = Object.fromEntries(budgets.map((b) => [b.category, b]));
  const tops = topCategories(categories);

  const remove = async (id) => {
    try { await api(`/categories/${id}`, { method: "DELETE" }); setDel(null); onChanged(); }
    catch (e) { setErr(e.message); }
  };
  const seedDefaults = async () => {
    setBusy(true); setErr("");
    try { await api("/categories/seed-defaults", { method: "POST" }); onChanged(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const actions = (c) => (
    <td className="px-4 py-3 text-right whitespace-nowrap">
      {c.parent_id == null && (
        <button onClick={() => setModal({ parent_id: c.id })} className="p-1.5 text-slate-400 hover:text-indigo-600" title="Add subcategory" aria-label="Add subcategory"><Plus className="w-4 h-4" /></button>
      )}
      <button onClick={() => setModal(c)} className="p-1.5 text-slate-400 hover:text-indigo-600" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
      <button onClick={() => setDel(c)} className="p-1.5 text-slate-400 hover:text-red-500" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
    </td>
  );

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Category budgets</h2>
          <p className="text-xs text-slate-400">Spend and progress are for the current month; subcategories roll up into their parent.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSuggest(true)}
            className="border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-50 flex items-center gap-1">
            <Sparkles className="w-4 h-4" /> Suggest from spending
          </button>
          <button onClick={seedDefaults} disabled={busy}
            className="border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
            Add standard categories
          </button>
          <button onClick={() => setModal({})}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1">
            <Plus className="w-4 h-4" /> New category
          </button>
        </div>
      </div>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3 text-right">Budget</th>
              <th className="px-4 py-3 text-right">Spent</th>
              <th className="px-4 py-3 w-40">Progress</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {tops.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                No categories. Use “Add standard categories” to start.
              </td></tr>
            )}
            {tops.map((c) => {
              const b = byName[c.name];
              const pct = b?.percent ?? null;
              // Status is carried by text + icon, not colour alone.
              const state = b?.over ? "Over" : (pct ?? 0) >= 75 ? "Near" : null;
              const barColor = b?.over ? "bg-rose-500" : (pct ?? 0) >= 75 ? "bg-amber-500" : "bg-emerald-500";
              const subs = categories.filter((s) => s.parent_id === c.id);
              return (
                <React.Fragment key={c.id}>
                  <tr className={`border-b last:border-0 hover:bg-slate-50/60 ${c.is_active ? "" : "opacity-40"}`}>
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {subs.length > 0 ? (
                        <button onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} className="flex items-center gap-1 hover:text-indigo-600">
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open[c.id] ? "rotate-90" : ""}`} />
                          {c.name} <span className="text-[11px] font-normal text-slate-400">({subs.length})</span>
                        </button>
                      ) : <span className="pl-[18px]">{c.name}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${KIND_BADGE[c.kind] || "bg-slate-100 text-slate-600"}`}>{c.kind}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {c.monthly_budget != null ? fmtMoney(c.monthly_budget, c.budget_currency || base) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right ${b?.over ? "text-rose-600 font-semibold" : "text-slate-600"}`}>
                      {b ? fmtMoney(b.spent_base, base) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.monthly_budget != null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                          </div>
                          <span className="text-[11px] text-slate-500 tabular-nums w-16 text-right whitespace-nowrap">
                            {state && <AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5" />}
                            {pct != null ? `${Math.round(pct)}%` : ""}{state ? ` ${state}` : ""}
                          </span>
                        </div>
                      ) : <span className="text-slate-300 text-xs">no limit</span>}
                    </td>
                    {actions(c)}
                  </tr>
                  {open[c.id] && subs.map((s) => (
                    <tr key={s.id} className={`border-b last:border-0 bg-slate-50/40 ${s.is_active ? "" : "opacity-40"}`}>
                      <td className="pl-10 pr-4 py-2 text-slate-600">{s.name}</td>
                      <td className="px-4 py-2" colSpan={4}></td>
                      {actions(s)}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal && <CategoryModal initial={modal} categories={categories} onClose={() => setModal(null)} onSaved={onChanged} />}
      {suggest && <SuggestBudgetsModal onClose={() => setSuggest(false)} onApplied={onChanged} />}
      {del && (
        <Modal title={`Delete — ${del.name}`} onClose={() => setDel(null)}>
          <p className="text-sm text-slate-600 mb-4">
            {del.parent_id == null
              ? "Deletes the category and its subcategories. Transactions, recurring items and rules keep their history but lose the category link."
              : "Deletes the subcategory. Its transactions move to the parent category."}
          </p>
          <div className="flex gap-3">
            <button onClick={() => remove(del.id)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700">Delete</button>
            <button onClick={() => setDel(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Merchant rules (applied when staging imports) ────────────────────────────

const RuleModal = ({ initial, categories, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ?? {
    match_type: "contains", pattern: "", category_id: "", set_transaction_type: "",
    priority: 100, auto_approve: false, is_active: true,
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => {
    const { name, value, type, checked } = e.target;
    setF((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const payload = {
      match_type: f.match_type, pattern: f.pattern,
      category_id: f.category_id === "" || f.category_id == null ? null : Number(f.category_id),
      set_transaction_type: f.set_transaction_type || null,
      priority: Number(f.priority) || 100, auto_approve: !!f.auto_approve, is_active: !!f.is_active,
    };
    try {
      await api(isEdit ? `/rules/${initial.id}` : "/rules", { method: isEdit ? "PUT" : "POST", body: JSON.stringify(payload) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={isEdit ? "Edit rule" : "New merchant rule"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Match">
            <select name="match_type" value={f.match_type} onChange={ch} className={inputCls}>
              <option value="contains">contains</option><option value="exact">exact</option><option value="regex">regex</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Pattern *"><input name="pattern" required value={f.pattern} onChange={ch} placeholder="GRAB" className={inputCls} /></Field>
          </div>
        </div>
        <Field label="Category">
          <select name="category_id" value={f.category_id ?? ""} onChange={ch} className={inputCls}>
            <option value="">— leave as proposed —</option>
            <CategoryOptions categories={categories} />
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Force type">
            <select name="set_transaction_type" value={f.set_transaction_type ?? ""} onChange={ch} className={inputCls}>
              <option value="">— no change —</option>
              {TXN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Priority (lower first)"><input name="priority" type="number" value={f.priority} onChange={ch} className={inputCls} /></Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="auto_approve" checked={!!f.auto_approve} onChange={ch} className="accent-indigo-600 w-4 h-4" /> Trust it (clears low-confidence flags)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="is_active" checked={!!f.is_active} onChange={ch} className="accent-indigo-600 w-4 h-4" /> Active
          </label>
        </div>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const MerchantRules = ({ categories }) => {
  const [rules, setRules] = useState([]);
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState("");
  const catName = categoryPath(categories);
  const load = useCallback(async () => {
    try { setRules(await api("/rules")); setErr(""); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const remove = async (id) => { try { await api(`/rules/${id}`, { method: "DELETE" }); load(); } catch (e) { setErr(e.message); } };
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Merchant rules</h2>
          <p className="text-xs text-slate-400">Applied to imported statements before review — your rules beat the AI&apos;s guess.</p>
        </div>
        <button onClick={() => setModal({})} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-1"><Plus className="w-4 h-4" /> New rule</button>
      </div>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
            <tr><th className="px-4 py-3">When description</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Priority</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No rules yet — tick “remember” while reviewing an import to add one.</td></tr>}
            {rules.map((r) => (
              <tr key={r.id} className={`border-b last:border-0 ${r.is_active ? "" : "opacity-50"}`}>
                <td className="px-4 py-3 text-slate-700">{r.match_type} <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">{r.pattern}</span>
                  {r.auto_approve && <span className="ml-1 text-[10px] font-bold text-emerald-600 uppercase">trusted</span>}</td>
                <td className="px-4 py-3 text-slate-600">{catName[r.category_id] || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{TXN_LABEL[r.set_transaction_type] || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{r.priority}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal(r)} className="p-1.5 text-slate-400 hover:text-indigo-600" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(r.id)} className="p-1.5 text-slate-400 hover:text-red-500" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <RuleModal initial={modal.id ? modal : null} categories={categories} onClose={() => setModal(null)} onSaved={load} />}
    </div>
  );
};

const BudgetGoalsTab = ({ categories, reloadCategories, reloadAll }) => {
  const [profile, setProfile] = useState(null);
  const [goals, setGoals] = useState([]);
  const [budgetInfo, setBudgetInfo] = useState({ budgets: [], base: "SGD" });
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [goalModal, setGoalModal] = useState(null);
  const [showAssumptions, setShowAssumptions] = useState(false);

  // Profile + goals load once; budget bars come from the cheap /budgets endpoint.
  const loadCore = useCallback(async () => {
    try {
      const [prof, gs] = await Promise.all([api("/profile"), api("/goals")]);
      setProfile(prof); setGoals(gs); setErr("");
    } catch (e) { setErr(e.message); }
  }, []);
  const loadBudgets = useCallback(async () => {
    try {
      const b = await api("/budgets");
      setBudgetInfo({ budgets: b.budgets || [], base: b.base_currency || "SGD" });
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { loadCore(); loadBudgets(); }, [loadCore, loadBudgets]);
  // A category change only needs the category list + budget bars refreshed.
  const onCategoriesChanged = () => { reloadCategories(); loadBudgets(); };

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
        focus_category_id: profile.focus_category_id ? Number(profile.focus_category_id) : null,
      }) });
      setMsg("Saved."); loadBudgets();
    } catch (e2) { setErr(e2.message); }
  };
  const removeGoal = async (id) => { try { await api(`/goals/${id}`, { method: "DELETE" }); loadCore(); } catch (e) { setErr(e.message); } };
  const p = (k, v) => setProfile((s) => ({ ...s, [k]: v }));

  if (!profile) return <div className="py-12 text-center text-slate-400 text-sm">Loading…</div>;
  return (
    <div className="space-y-8">
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <button type="button" onClick={() => {
          // The Tax tab can change tax_reserve; refetch so Save doesn't write back a stale value.
          if (!showAssumptions) loadCore();
          setShowAssumptions((v) => !v);
        }}
          className="w-full flex items-center justify-between px-6 py-4 text-left">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Monthly assumptions</h2>
            <p className="text-xs text-slate-400">Income, tax reserve, allowance, Emergency Fund, alert email</p>
          </div>
          <span className="text-slate-400 text-sm font-semibold">{showAssumptions ? "Hide" : "Edit"}</span>
        </button>
        {showAssumptions && (
        <form onSubmit={saveProfile} className="px-6 pb-6 space-y-4 border-t border-slate-100 pt-4">
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
          <Field label="Watch category (allowed-spending card)">
            <select value={profile.focus_category_id ?? ""} onChange={(e) => p("focus_category_id", e.target.value)} className={inputCls}>
              <option value="">— none —</option>
              {topCategories(categories).filter((c) => !["income", "transfer", "investment", "tax"].includes(c.kind)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Month-end alert email"><input type="email" value={profile.alert_email ?? ""} onChange={(e) => p("alert_email", e.target.value)} placeholder="you@example.com" className={inputCls} /></Field>
        </div>
        <p className="text-[11px] text-slate-400">
          Each month, <span className="font-semibold">income − tax − investments − recurring − actual variable spend</span> flows into the Emergency Fund (unspent allowance included). The alert email needs SMTP env vars configured on the server; otherwise a reminder banner shows on this page.
        </p>
        <div className="flex items-center gap-3">
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700">Save assumptions</button>
          {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        </div>
        </form>
        )}
      </div>

      <CategoryBudgetGrid categories={categories} budgets={budgetInfo.budgets}
        base={budgetInfo.base} onChanged={onCategoriesChanged} />

      <MerchantRules categories={categories} />

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
      {goalModal && <GoalModal initial={goalModal.id ? goalModal : null} onClose={() => setGoalModal(null)} onSaved={() => { loadCore(); reloadAll(); }} />}
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
        <p className="text-sm text-slate-500 mb-4">One-click seed of the August 2026 snapshot (4 accounts with import refs and opening balances, valuations, pending contributions, standard categories, budget, and the KRW 100M goal). Only works when the tracker is empty.</p>
        <button onClick={importBaseline} disabled={busy === "baseline"} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-900 flex items-center gap-2 disabled:opacity-60">
          <DownloadCloud className="w-4 h-4" /> Import August 2026 baseline
        </button>
      </div>
    </div>
  );
};

// ── Import tab (AI statement JSON → review queue → ledger) ───────────────────

const REASON_TEXT = {
  uncategorised: "No category",
  missing_category: "No category",
  ai_flagged_needs_review: "AI unsure",
  low_confidence: "Low confidence",
  currency_differs_from_account: "Currency ≠ account",
  transfer_missing_counter_account: "Transfer: other account missing",
  transfer_to_same_account: "Transfer to same account",
  incoming_type_with_negative_amount: "Sign looks wrong",
  outgoing_type_with_positive_amount: "Sign looks wrong",
  zero_amount: "Zero amount",
  foreign_currency_without_rate: "FX rate missing",
  possible_duplicate_of_existing: "Possible duplicate",
  possible_duplicate_within_batch: "Repeated in this file",
};
const reasonText = (r) => {
  const [key, arg] = r.split(/:(.*)/s);
  if (REASON_TEXT[key]) return REASON_TEXT[key];
  if (key === "unknown_category") return `Unknown category “${arg}”`;
  if (key === "subcategory_not_in_category") return `Unknown subcategory “${arg}”`;
  if (key === "account_not_created") return `Account “${arg}” not created`;
  if (key === "unknown_transfer_account") return `Unknown account “${arg}”`;
  return r;
};
const ROW_STATUS = {
  pending: ["Ready", "bg-emerald-100 text-emerald-700", CheckCircle2],
  needs_review: ["Review", "bg-amber-100 text-amber-700", AlertTriangle],
  duplicate: ["Duplicate?", "bg-rose-100 text-rose-700", Copy],
  approved: ["Approved", "bg-indigo-100 text-indigo-700", CheckCircle2],
  ignored: ["Ignored", "bg-slate-100 text-slate-500", EyeOff],
};

const StagedRowModal = ({ row, accounts, categories, onClose, onSaved }) => {
  const [f, setF] = useState({
    transaction_date: row.transaction_date, description_raw: row.description_raw,
    merchant_normalized: row.merchant_normalized ?? "", transaction_type: row.transaction_type,
    amount: row.amount, account_ref: row.account_ref, transfer_account_ref: row.transfer_account_ref ?? "",
    category_id: row.category_id ?? "", notes: row.notes ?? "", remember_rule: false, rule_auto_approve: false,
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ch = (e) => {
    const { name, value, type, checked } = e.target;
    setF((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };
  const refs = accounts.filter((a) => a.external_ref);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api(`/imports/rows/${row.id}`, { method: "PATCH", body: JSON.stringify({
        transaction_date: f.transaction_date, description_raw: f.description_raw,
        merchant_normalized: f.merchant_normalized || null, transaction_type: f.transaction_type,
        amount: Number(f.amount), account_ref: f.account_ref,
        transfer_account_ref: TRANSFER_TYPES.includes(f.transaction_type) ? (f.transfer_account_ref || null) : null,
        category_id: f.category_id === "" ? null : Number(f.category_id), notes: f.notes || null,
        remember_rule: f.remember_rule, rule_auto_approve: f.rule_auto_approve,
      }) });
      onSaved(); onClose();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Review row ${row.line_index + 1}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {row.review_reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {row.review_reasons.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" /> {reasonText(r)}
              </span>
            ))}
          </div>
        )}
        {row.category && <p className="text-[11px] text-slate-400">AI proposed: {row.category}{row.subcategory ? ` › ${row.subcategory}` : ""}{row.confidence != null ? ` (confidence ${Math.round(row.confidence * 100)}%)` : ""}</p>}
        <Field label="Description (raw)"><input name="description_raw" value={f.description_raw} onChange={ch} className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Merchant"><input name="merchant_normalized" value={f.merchant_normalized} onChange={ch} className={inputCls} /></Field>
          <Field label="Date"><input name="transaction_date" type="date" value={f.transaction_date} onChange={ch} className={inputCls} required /></Field>
          <Field label="Type">
            <select name="transaction_type" value={f.transaction_type} onChange={ch} className={inputCls}>
              {TXN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label={`Amount (signed, ${row.currency})`}><input name="amount" type="number" step="0.01" value={f.amount} onChange={ch} className={inputCls} required /></Field>
          <Field label="Account">
            <select name="account_ref" value={f.account_ref} onChange={ch} className={inputCls}>
              {!refs.some((a) => a.external_ref === f.account_ref) && <option value={f.account_ref}>{f.account_ref} (not created)</option>}
              {refs.map((a) => <option key={a.id} value={a.external_ref}>{a.name}</option>)}
            </select>
          </Field>
          {TRANSFER_TYPES.includes(f.transaction_type) && (
            <Field label="Other account">
              <select name="transfer_account_ref" value={f.transfer_account_ref} onChange={ch} className={inputCls}>
                <option value="">— untracked —</option>
                {f.transfer_account_ref && !refs.some((a) => a.external_ref === f.transfer_account_ref) && <option value={f.transfer_account_ref}>{f.transfer_account_ref} (unknown)</option>}
                {refs.filter((a) => a.external_ref !== f.account_ref).map((a) => <option key={a.id} value={a.external_ref}>{a.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Category">
          <select name="category_id" value={f.category_id} onChange={ch} className={inputCls}>
            <option value="">— uncategorised —</option>
            <CategoryOptions categories={categories} />
          </select>
        </Field>
        <Field label="Notes"><input name="notes" value={f.notes} onChange={ch} className={inputCls} /></Field>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="remember_rule" checked={f.remember_rule} onChange={ch} className="accent-indigo-600 w-4 h-4" />
            Remember: always categorise “{(f.merchant_normalized || f.description_raw || "").slice(0, 40)}” like this
          </label>
          {f.remember_rule && (
            <label className="flex items-center gap-2 text-xs text-slate-600 pl-6">
              <input type="checkbox" name="rule_auto_approve" checked={f.rule_auto_approve} onChange={ch} className="accent-indigo-600 w-4 h-4" />
              Trust this rule (future matches skip the low-confidence check)
            </label>
          )}
        </div>
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button disabled={busy} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">{busy ? "Saving…" : "Save row"}</button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const PromptModal = ({ onClose }) => {
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api("/imports/prompt").then((r) => setPrompt(r.prompt)).catch((e) => setErr(e.message));
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <Modal title="AI extraction prompt" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">Paste this into an AI together with your statement (PDF text or screenshot). It includes your current accounts and categories, so the output matches this tracker. A local model keeps statements on your own machines.</p>
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      <textarea readOnly value={prompt} rows={14} className={`${inputCls} font-mono text-xs`} />
      <div className="flex gap-3 pt-3">
        <button onClick={copy} disabled={!prompt} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
          <Copy className="w-4 h-4" /> {copied ? "Copied" : "Copy prompt"}
        </button>
        <button onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Close</button>
      </div>
    </Modal>
  );
};

const ImportTab = ({ accounts, categories, reloadAll }) => {
  const [raw, setRaw] = useState("");
  const [errors, setErrors] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [imports, setImports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [rows, setRows] = useState([]);
  const [checked, setChecked] = useState({});
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const catName = categoryPath(categories);
  const accByRef = Object.fromEntries(accounts.filter((a) => a.external_ref).map((a) => [a.external_ref, a]));

  const loadImports = useCallback(async () => {
    try { setImports(await api("/imports")); } catch (e) { setErrors([e.message]); }
  }, []);
  const loadBatch = useCallback(async (id) => {
    if (!id) { setDetail(null); setRows([]); return; }
    try {
      const [d, q] = await Promise.all([api(`/imports/${id}`), api(`/imports/${id}/queue`)]);
      setDetail(d); setRows(q); setChecked({});
    } catch (e) { setErrors([e.message]); }
  }, []);
  useEffect(() => { loadImports(); }, [loadImports]);
  useEffect(() => { loadBatch(selected); }, [selected, loadBatch]);

  const refresh = async () => { await Promise.all([loadImports(), loadBatch(selected)]); };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setRaw);
    e.target.value = "";
  };
  const upload = async () => {
    setErrors([]); setMsg(""); setBusy("upload");
    try {
      JSON.parse(raw);
    } catch (e) { setErrors([`Not valid JSON: ${e.message}`]); setBusy(""); return; }
    try {
      const imp = await api("/imports", { method: "POST", body: raw });
      setRaw(""); setMsg(`Staged ${imp.counts.total} rows — ${imp.counts.pending} ready, ${imp.counts.needs_review} to review, ${imp.counts.duplicate} possible duplicates.`);
      await loadImports(); setSelected(imp.id);
    } catch (e) { setErrors(e.errors?.length ? e.errors : [e.message]); } finally { setBusy(""); }
  };
  const act = async (label, fn) => {
    setErrors([]); setMsg(""); setBusy(label);
    try { const m = await fn(); if (m) setMsg(m); await refresh(); } catch (e) { setErrors(e.errors?.length ? e.errors : [e.message]); } finally { setBusy(""); }
  };
  const ids = Object.keys(checked).filter((k) => checked[k]).map(Number);
  const approve = (rowIds) => act("approve", async () => {
    const r = await api(`/imports/${selected}/approve`, { method: "POST", body: JSON.stringify({ row_ids: rowIds }) });
    reloadAll();
    return `Approved ${r.promoted} row(s) into the ledger.${r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped[0].reason}.` : ""}`;
  });
  const ignore = () => act("ignore", async () => {
    const r = await api(`/imports/${selected}/ignore`, { method: "POST", body: JSON.stringify({ row_ids: ids }) });
    return `Ignored ${r.ignored} row(s).`;
  });
  const createAccounts = () => act("accounts", async () => {
    const r = await api(`/imports/${selected}/accounts`, { method: "POST" });
    reloadAll();
    return r.created.length ? `Created ${r.created.join(", ")}. Set their opening balances in Accounts.` : "Nothing to create.";
  });
  const deleteBatch = () => act("delete", async () => {
    if (!confirm("Delete this import and all its unapproved rows?")) return null;
    await api(`/imports/${selected}`, { method: "DELETE" });
    setSelected(null);
    return "Import deleted.";
  });

  const visible = onlyOpen ? rows.filter((r) => ["pending", "needs_review", "duplicate"].includes(r.status)) : rows;
  const counts = detail?.import.counts;
  const missingAccounts = (detail?.accounts || []).filter((a) => !a.exists);
  const allChecked = visible.length > 0 && visible.every((r) => r.status === "approved" || checked[r.id]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Import a statement</h2>
            <p className="text-xs text-slate-400">Paste the AI&apos;s JSON (schema v1.1). Rows are staged for review — nothing touches your ledger until you approve.</p>
          </div>
          <button onClick={() => setShowPrompt(true)} className="border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-50 flex items-center gap-1">
            <Sparkles className="w-4 h-4" /> Get AI prompt
          </button>
        </div>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={7} spellCheck={false}
          placeholder='{"schema_version": "1.1", "statement": {...}, "accounts": [...], "transactions": [...], "warnings": []}'
          className={`${inputCls} font-mono text-xs`} />
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button onClick={upload} disabled={!raw.trim() || busy === "upload"}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5">
            <FileUp className="w-4 h-4" /> {busy === "upload" ? "Validating…" : "Validate & stage"}
          </button>
          <label className="text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer">
            Load .json file<input type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
          </label>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Rejected</p>
          <ul className="list-disc pl-5 space-y-0.5 font-mono text-xs">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="lg:col-span-1">
          <h3 className="text-sm font-bold text-slate-700 mb-2">Imports</h3>
          <div className="space-y-2">
            {imports.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
            {imports.map((imp) => (
              <button key={imp.id} onClick={() => setSelected(imp.id)}
                className={`w-full text-left bg-white rounded-xl border px-3 py-2.5 hover:border-indigo-300 ${selected === imp.id ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200"}`}>
                <div className="text-sm font-semibold text-slate-700">{imp.institution || "Statement"} <span className="text-slate-400 font-normal">#{imp.id}</span></div>
                <div className="text-[11px] text-slate-400">{imp.period_start || "?"} → {imp.period_end || "?"}</div>
                <div className="text-[11px] mt-1 flex flex-wrap gap-x-2">
                  <span className="text-slate-500 capitalize">{imp.status.replace("_", " ")}</span>
                  {imp.counts.needs_review + imp.counts.duplicate > 0 && <span className="text-amber-700 font-semibold">{imp.counts.needs_review + imp.counts.duplicate} to review</span>}
                  {imp.counts.pending > 0 && <span className="text-emerald-700">{imp.counts.pending} ready</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          {!detail ? (
            <div className="h-40 flex items-center justify-center text-sm text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">Select an import to review it.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-700 mr-auto">
                  {detail.import.institution || "Statement"} · {counts.total} rows
                  <span className="font-normal text-slate-500"> — {counts.approved} approved, {counts.pending} ready, {counts.needs_review} review, {counts.duplicate} duplicate?, {counts.ignored} ignored</span>
                </h3>
                <button onClick={refresh} className="text-slate-400 hover:text-indigo-600 p-1.5" aria-label="Refresh"><RefreshCw className="w-4 h-4" /></button>
                {counts.approved === 0 && (
                  <button onClick={deleteBatch} disabled={!!busy} className="text-sm text-slate-500 border rounded-lg px-3 py-1.5 hover:bg-slate-50 flex items-center gap-1"><Trash2 className="w-4 h-4" /> Delete</button>
                )}
              </div>

              {missingAccounts.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                  <Landmark className="w-4 h-4" />
                  <span className="flex-1">New accounts in this statement: {missingAccounts.map((a) => `${a.account_name} (${a.external_account_ref})`).join(", ")}</span>
                  <button onClick={createAccounts} disabled={!!busy} className="bg-sky-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-sky-700">Create accounts</button>
                </div>
              )}
              {detail.warnings.length > 0 && (
                <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                  {detail.warnings.map((w) => (
                    <li key={w.id} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span><span className="font-semibold">{w.type.replace(/_/g, " ")}</span>{w.transaction_index != null && ` (row ${w.transaction_index + 1})`}: {(w.message || "").replace(/^\[check\] /, "")}</span></li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => approve(null)} disabled={!!busy || counts.pending === 0}
                  className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Approve all ready ({counts.pending})
                </button>
                <button onClick={() => approve(ids)} disabled={!!busy || ids.length === 0}
                  className="border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-50 disabled:opacity-50">
                  Approve selected ({ids.length})
                </button>
                <button onClick={ignore} disabled={!!busy || ids.length === 0}
                  className="border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
                  Ignore selected
                </button>
                <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="accent-indigo-600" /> Open rows only
                </label>
              </div>
              <p className="text-[11px] text-slate-400">“Approve selected” promotes exactly the ticked rows, even flagged ones — use it when you&apos;ve checked them. Transfers become two linked legs.</p>

              <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
                    <tr>
                      <th className="pl-4 py-3 w-8"><input type="checkbox" aria-label="Select all" checked={allChecked}
                        onChange={(e) => setChecked(Object.fromEntries(visible.filter((r) => r.status !== "approved").map((r) => [r.id, e.target.checked])))} className="accent-indigo-600" /></th>
                      <th className="px-3 py-3">Status</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Description</th>
                      <th className="px-3 py-3">Type</th><th className="px-3 py-3 text-right">Amount</th>
                      <th className="px-3 py-3">Category</th><th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nothing left to review.</td></tr>}
                    {visible.map((r) => {
                      const [label, cls, Icon] = ROW_STATUS[r.status] || [r.status, "bg-slate-100 text-slate-600", Info];
                      return (
                        <tr key={r.id} className="border-b last:border-0 align-top">
                          <td className="pl-4 py-3">{r.status !== "approved" && (
                            <input type="checkbox" aria-label={`Select row ${r.line_index + 1}`} checked={!!checked[r.id]}
                              onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))} className="accent-indigo-600" />)}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cls}`}><Icon className="w-3 h-3" />{label}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-600">{r.transaction_date}</td>
                          <td className="px-3 py-3 text-slate-700 max-w-[18rem]">
                            <div className="truncate" title={r.description_raw}>{r.merchant_normalized || r.description_raw}</div>
                            <div className="text-[11px] text-slate-400">{accByRef[r.account_ref]?.name || r.account_ref}
                              {r.transfer_account_ref && ` ${r.amount < 0 ? "→" : "←"} ${accByRef[r.transfer_account_ref]?.name || r.transfer_account_ref}`}</div>
                            {r.review_reasons.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {r.review_reasons.map((x) => <span key={x} className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-1.5">{reasonText(x)}</span>)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{TXN_LABEL[r.transaction_type] || r.transaction_type}</td>
                          <td className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${r.amount < 0 ? "text-slate-700" : "text-emerald-600"}`}>
                            {r.amount > 0 ? "+" : ""}{fmtMoney(r.amount, r.currency)}
                          </td>
                          <td className="px-3 py-3 text-slate-500 text-xs">{catName[r.category_id] || <span className="text-amber-700">{r.category || "—"}</span>}
                            {r.rule_id && <div className="text-[10px] text-indigo-600 font-semibold">by rule</div>}</td>
                          <td className="px-3 py-3 text-right">
                            {r.status !== "approved" && <button onClick={() => setEditRow(r)} className="p-1.5 text-slate-400 hover:text-indigo-600" aria-label="Review row"><Pencil className="w-4 h-4" /></button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
      {editRow && <StagedRowModal row={editRow} accounts={accounts} categories={categories}
        onClose={() => setEditRow(null)} onSaved={refresh} />}
      {showPrompt && <PromptModal onClose={() => setShowPrompt(false)} />}
    </div>
  );
};

// ── Tax (Singapore income tax estimate) ──────────────────────────────────────

const pct = (r) => `${Math.round(r * 1000) / 10}%`;

const TaxTab = ({ reloadAll }) => {
  const thisYear = new Date().getFullYear();
  const [f, setF] = useState({
    year: thisYear, monthly_salary: "", months_employed: 12, bonus: "", other_employment_income: "",
    resident: true, age_band: "under_55", cpf_relief: "", other_reliefs: "", donations: "", rebate_pct: "", rebate_cap: "",
  });
  const [r, setR] = useState(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const body = {
          year: Number(f.year) || thisYear, months_employed: Number(f.months_employed) || 12,
          monthly_salary: num(f.monthly_salary), bonus: num(f.bonus) || 0,
          other_employment_income: num(f.other_employment_income) || 0, resident: f.resident,
          age_band: f.age_band, cpf_relief: num(f.cpf_relief) || 0, other_reliefs: num(f.other_reliefs) || 0,
          donations: num(f.donations) || 0,
          rebate_pct: f.rebate_pct === "" ? null : Number(f.rebate_pct) / 100,
          rebate_cap: num(f.rebate_cap),
        };
        setR(await api("/tax/estimate", { method: "POST", body: JSON.stringify(body) })); setErr("");
      } catch (e) { setErr(e.message); }
    }, 300);
    return () => clearTimeout(t);
  }, [f, thisYear]);

  const useAsReserve = async () => {
    setMsg("");
    try {
      await api("/profile", { method: "PUT", body: JSON.stringify({ tax_reserve: r.monthly_set_aside_base }) });
      setMsg("Saved as your monthly tax reserve."); reloadAll();
      setR((s) => ({ ...s, current_tax_reserve: s.monthly_set_aside_base }));
    } catch (e) { setErr(e.message); }
  };

  const S = (v) => fmtMoney(v, "SGD");
  const numField = (k, label, placeholder) => (
    <Field label={label}><input type="number" step="0.01" min="0" value={f[k]} placeholder={placeholder}
      onChange={(e) => set(k, e.target.value)} className={inputCls} /></Field>
  );
  const recorded = r?.recorded;
  const reserveDiff = r && r.current_tax_reserve != null ? r.current_tax_reserve - r.monthly_set_aside_base : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Singapore income tax</h2>
          <p className="text-xs text-slate-400">Employment income for one calendar year. Resident rates from YA2024.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Income year">
            <input type="number" value={f.year} onChange={(e) => set("year", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tax residency">
            <select value={f.resident ? "yes" : "no"} onChange={(e) => set("resident", e.target.value === "yes")} className={inputCls}>
              <option value="yes">Resident (183+ days)</option><option value="no">Non-resident</option>
            </select>
          </Field>
          {numField("monthly_salary", "Monthly gross salary (SGD)", r ? String(r.monthly_salary) : "from profile")}
          <Field label="Months employed">
            <input type="number" min="1" max="12" value={f.months_employed} onChange={(e) => set("months_employed", e.target.value)} className={inputCls} />
          </Field>
          {numField("bonus", "Bonus / AWS (SGD)", "0")}
          {numField("other_employment_income", "Other employment income", "0")}
          <Field label="Age">
            <select value={f.age_band} onChange={(e) => set("age_band", e.target.value)} className={inputCls}>
              <option value="under_55">Under 55</option><option value="55_59">55–59</option><option value="60_plus">60+</option>
            </select>
          </Field>
          {numField("cpf_relief", "CPF contributions", "0 (EP: none)")}
          {numField("other_reliefs", "Other reliefs", "0")}
          {numField("donations", "Approved donations", "0")}
          {numField("rebate_pct", "Rebate % (if announced)", "auto")}
          {numField("rebate_cap", "Rebate cap (SGD)", "auto")}
        </div>
        <p className="text-[11px] text-slate-400">
          Tax on {f.year || thisYear} income is billed in {(Number(f.year) || thisYear) + 1} (YA {(Number(f.year) || thisYear) + 1}).
          Employment Pass holders don&apos;t pay CPF, so leave CPF at 0. Estimate only.
        </p>
      </div>

      <div className="lg:col-span-3 space-y-4">
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        {r && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estimated tax / year</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{S(r.tax)}</p>
                <p className="text-xs text-slate-400">Effective rate {pct(r.effective_rate)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Set aside / month</p>
                <p className="text-2xl font-bold text-indigo-600 mt-1">{S(r.monthly_set_aside)}</p>
                <p className="text-xs text-slate-400">over {r.months_employed} month{r.months_employed > 1 ? "s" : ""}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current tax reserve</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{r.current_tax_reserve != null ? fmtMoney(r.current_tax_reserve, r.base_currency) : "—"}</p>
                {reserveDiff != null && Math.abs(reserveDiff) >= 1 && (
                  <p className={`text-xs ${reserveDiff > 0 ? "text-amber-600" : "text-red-600"}`}>
                    {reserveDiff > 0 ? `${fmtMoney(reserveDiff, r.base_currency)} more than needed` : `${fmtMoney(-reserveDiff, r.base_currency)} short`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={useAsReserve} disabled={Math.abs(reserveDiff ?? 1) < 0.01}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-40">
                Use {fmtMoney(r.monthly_set_aside_base, r.base_currency)} as my monthly tax reserve
              </button>
              {msg && <span className="text-sm text-emerald-600">{msg}</span>}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-700 mb-3">How it&apos;s calculated</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="py-1.5 text-slate-600">Employment income ({S(r.monthly_salary)} × {r.months_employed}{r.gross_income > r.monthly_salary * r.months_employed + 0.005 ? " + bonus/other" : ""})</td><td className="text-right">{S(r.gross_income)}</td></tr>
                  {r.donation_deduction > 0 && <tr><td className="py-1.5 text-slate-600">Donations (250% deduction)</td><td className="text-right">−{S(r.donation_deduction)}</td></tr>}
                  {r.method === "resident" && <tr><td className="py-1.5 text-slate-600">Reliefs (incl. {S(r.earned_income_relief)} earned income relief)</td><td className="text-right">−{S(r.total_reliefs)}</td></tr>}
                  <tr className="font-semibold"><td className="py-1.5">Chargeable income</td><td className="text-right">{S(r.chargeable_income)}</td></tr>
                </tbody>
              </table>
              <table className="w-full text-sm mt-4">
                <thead><tr className="text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="text-left py-1">Band</th><th className="text-right pl-2">Amount</th><th className="text-right pl-2">Rate</th><th className="text-right pl-2">Tax</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {r.bands.map((b) => (
                    <tr key={b.from}>
                      <td className="py-1.5 text-slate-600">{r.method === "non_resident_flat" ? "Flat on employment income" : `${S(b.from)} – ${b.to != null ? S(b.to) : "…"}`}</td>
                      <td className="text-right pl-2">{S(b.amount)}</td><td className="text-right pl-2">{pct(b.rate)}</td><td className="text-right pl-2">{S(b.tax)}</td>
                    </tr>
                  ))}
                  {r.rebate > 0 && <tr><td className="py-1.5 text-slate-600" colSpan={3}>Tax rebate (YA {r.year_of_assessment})</td><td className="text-right">−{S(r.rebate)}</td></tr>}
                  <tr className="font-bold"><td className="py-1.5" colSpan={3}>Estimated tax</td><td className="text-right">{S(r.tax)}</td></tr>
                </tbody>
              </table>
              {r.notes.map((n) => <p key={n} className="text-xs text-slate-500 mt-2">{n}</p>)}
            </div>

            {recorded && (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 text-sm text-slate-600">
                <span className="font-semibold">Recorded in your ledger for {r.year}:</span> {S(recorded.total_sgd)} salary + bonus
                {recorded.months.length > 0 && <> across {recorded.months.length} month{recorded.months.length > 1 ? "s" : ""}</>}.
                {" "}Only rows categorised <span className="font-mono text-xs">Income › Salary</span> or <span className="font-mono text-xs">Income › Bonus</span> count; reimbursements don&apos;t.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Page shell ───────────────────────────────────────────────────────────────

const TABS = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["accounts", "Accounts", Landmark],
  ["transactions", "Transactions", ArrowLeftRight],
  ["import", "Import", FileUp],
  ["recurring", "Recurring", Repeat],
  ["investments", "Investments", LineChartIcon],
  ["budget", "Budget & Categories", Target],
  ["tax", "Tax", Calculator],
  ["settings", "Settings", Settings2],
];

const FinancePage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState("dashboard");
  // Once a tab has been opened, keep it mounted (just hidden) so coming back to
  // it is instant — no refetch of /profile, /goals, /budgets, etc. over a slow
  // link. Only the first visit pays the load cost.
  const [seen, setSeen] = useState({ dashboard: true });
  const openTab = (key) => {
    setTab(key);
    setSeen((s) => (s[key] ? s : { ...s, [key]: true }));
  };
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadAccounts = useCallback(async () => {
    try {
      const r = await fetch("/api/finance/accounts", { credentials: "include" });
      if (r.ok) setAccounts(await r.json());
    } catch { /* ignore */ }
  }, []);
  const loadCategories = useCallback(async () => {
    try {
      const r = await fetch("/api/finance/categories", { credentials: "include" });
      if (r.ok) setCategories(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadAccounts(); loadCategories(); }, [loadAccounts, loadCategories]);

  // Fine-grained reload signals — a category rename shouldn't refetch accounts,
  // and neither should trigger a page-wide cascade.
  const reloadCategories = useCallback(() => {
    setRefreshTick((k) => k + 1);
    loadCategories();
  }, [loadCategories]);
  const reloadAll = useCallback(() => {
    setRefreshTick((k) => k + 1);
    loadAccounts();
    loadCategories();
  }, [loadAccounts, loadCategories]);

  if (user?.role !== "admin") {
    return <div className="max-w-3xl mx-auto px-6 py-20 text-center text-slate-500">This page is private.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(([key, label, icon]) => {
          const Icon = icon;
          return (
            <button key={key} onClick={() => openTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          );
        })}
      </div>

      <div hidden={tab !== "dashboard"}>
        {seen.dashboard && <FinanceDashboard refreshTick={refreshTick} onOpenImport={() => openTab("import")} />}
      </div>
      <div hidden={tab !== "accounts"}>
        {seen.accounts && <AccountsTab accounts={accounts} reload={reloadAll} />}
      </div>
      <div hidden={tab !== "transactions"}>
        {seen.transactions && <TransactionsTab accounts={accounts} categories={categories} refreshTick={refreshTick} onChanged={reloadAll} />}
      </div>
      <div hidden={tab !== "import"}>
        {seen.import && <ImportTab accounts={accounts} categories={categories} reloadAll={reloadAll} />}
      </div>
      <div hidden={tab !== "recurring"}>
        {seen.recurring && <RecurringTab accounts={accounts} categories={categories} reloadAll={reloadAll} />}
      </div>
      <div hidden={tab !== "investments"}>
        {seen.investments && <InvestmentsTab accounts={accounts} />}
      </div>
      <div hidden={tab !== "budget"}>
        {seen.budget && <BudgetGoalsTab categories={categories} reloadCategories={reloadCategories} reloadAll={reloadAll} />}
      </div>
      <div hidden={tab !== "tax"}>
        {seen.tax && <TaxTab reloadAll={reloadAll} />}
      </div>
      <div hidden={tab !== "settings"}>
        {seen.settings && <SettingsTab reloadAll={reloadAll} />}
      </div>
    </div>
  );
};

export default FinancePage;
