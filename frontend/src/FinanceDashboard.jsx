import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Target, TrendingUp, PiggyBank, AlertTriangle, RefreshCw, Info,
  ShieldCheck, CalendarClock, Repeat, FileUp, Wallet2, CheckCircle2, Gamepad2,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  RadialBarChart, RadialBar,
} from "recharts";
import { fmtMoney, fmtPct } from "./financeFormat";

// Palette — brand indigo family + supporting hues, readable in the light theme.
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#ec4899", "#8b5cf6", "#64748b"];

const monthLabel = (ym) => {
  const [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
};

// ── small presentational pieces ─────────────────────────────────────────────

const KpiCard = ({ icon, label, value, sub, accent = "text-indigo-600" }) => {
  const Icon = icon;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 ${accent}`} />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </div>
      <div className="text-2xl font-extrabold text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
};

const ChartCard = ({ title, hint, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
    {children}
  </div>
);

// The watched category (e.g. Gaming): how much of this month's allowance is
// still free for it after the other day-to-day categories keep what they need.
const FocusLine = ({ f, base }) => {
  const none = f.can_still_spend_base <= 0;
  const reserved = f.reserved_for.slice(0, 4).map((r) => `${r.category} ${fmtMoney(r.reserved_base, base)}`).join(", ");
  return (
    <div className={`rounded-xl border px-4 py-3 mb-3 ${none ? "bg-rose-50 border-rose-200" : "bg-indigo-50 border-indigo-200"}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 font-bold text-slate-700"><Gamepad2 className="w-4 h-4 text-indigo-600" /> {f.category}</span>
        <span className="text-sm text-slate-600">spent <span className="font-semibold">{fmtMoney(f.spent_base, base)}</span> this month</span>
        <span className={`text-sm ${none ? "text-rose-700" : "text-indigo-800"}`}>
          {none
            ? <>nothing left to spend{f.short_by_base > 0 && <> — the plan is already <span className="font-semibold">{fmtMoney(f.short_by_base, base)}</span> short</>}</>
            : <>you can still spend <span className="text-lg font-extrabold">{fmtMoney(f.can_still_spend_base, base)}</span></>}
        </span>
        {f.budget_base != null && <span className="text-xs text-slate-500">(budget {fmtMoney(f.budget_base, base)})</span>}
      </div>
      <p className="text-[11px] text-slate-500 mt-1">
        {f.reserved_for_others_base > 0
          ? <>After keeping {fmtMoney(f.reserved_for_others_base, base)} for your other budgets still to be spent this month ({reserved}{f.reserved_for.length > 4 ? ", …" : ""}).</>
          : <>No other budgets are waiting to be spent — set category budgets so they're kept aside first.</>}
      </p>
    </div>
  );
};

// What's left for day-to-day spending this month once the plan is paid.
const AllowanceCard = ({ al, base }) => {
  const allowed = al.allowed_variable_base;
  const pct = allowed > 0 ? Math.min(100, (al.spent_variable_base / allowed) * 100) : 100;
  const over = al.left_base < 0;
  const tight = !over && allowed > 0 && pct >= 75;
  const bar = over ? "bg-rose-500" : tight ? "bg-amber-500" : "bg-emerald-500";
  const StatusIcon = over || tight ? AlertTriangle : CheckCircle2;
  const status = over
    ? `Over by ${fmtMoney(-al.left_base, base)}`
    : allowed <= 0 ? "No room left in the plan" : tight ? "Getting tight" : "On track";
  const available = al.income_base - al.tax_reserve_base - al.planned_investments_base;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-slate-400">
          <Wallet2 className="w-4 h-4 text-indigo-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Allowed spending this month</span>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${over ? "text-rose-600" : tight ? "text-amber-600" : "text-emerald-600"}`}>
          <StatusIcon className="w-3.5 h-3.5" /> {status}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
        <div><div className="text-[11px] text-slate-400">Allowed (day-to-day)</div><div className="text-xl font-extrabold text-slate-800">{fmtMoney(allowed, base)}</div></div>
        <div><div className="text-[11px] text-slate-400">Spent so far</div><div className="text-xl font-extrabold text-slate-800">{fmtMoney(al.spent_variable_base, base)}</div></div>
        <div><div className="text-[11px] text-slate-400">Left</div><div className={`text-xl font-extrabold ${over ? "text-rose-600" : "text-slate-800"}`}>{fmtMoney(al.left_base, base)}</div></div>
        <div><div className="text-[11px] text-slate-400">Safe per day · {al.days_left} day{al.days_left === 1 ? "" : "s"} left</div><div className="text-xl font-extrabold text-slate-800">{fmtMoney(al.safe_daily_base, base)}</div></div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-3">
        <div className={`h-full ${bar}`} style={{ width: `${Math.max(0, pct)}%` }} />
      </div>
      {al.focus && <FocusLine f={al.focus} base={base} />}
      <p className="text-[11px] text-slate-500">
        {fmtMoney(al.income_base, base)} income − {fmtMoney(al.tax_reserve_base, base)} tax reserve
        − {fmtMoney(al.planned_investments_base, base)} planned investing − {fmtMoney(al.recurring_base, base)} recurring
        = {fmtMoney(allowed, base)} for everything else. Recurring costs paid so far: {fmtMoney(al.spent_fixed_base, base)}.
        {al.category_budgets_total_base > 0 && (
          <> Category budgets add up to {fmtMoney(al.category_budgets_total_base, base)}
            {al.category_budgets_total_base > available
              ? <span className="text-amber-700 font-semibold"> — {fmtMoney(al.category_budgets_total_base - available, base)} more than the {fmtMoney(available, base)} left after tax and investing.</span>
              : <> of the {fmtMoney(available, base)} left after tax and investing.</>}
          </>
        )}
      </p>
    </div>
  );
};

// ── dashboard ────────────────────────────────────────────────────────────────

const FinanceDashboard = ({ refreshTick = 0, onOpenImport }) => {
  const [summary, setSummary] = useState(null);
  const [valuations, setValuations] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [asOf, setAsOf] = useState("");
  const [reminderHidden, setReminderHidden] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = asOf ? `?as_of=${asOf}` : "";
      const [s, v, a] = await Promise.all([
        fetch(`/api/finance/summary${qs}`, { credentials: "include" }),
        fetch("/api/finance/valuations", { credentials: "include" }),
        fetch("/api/finance/accounts", { credentials: "include" }),
      ]);
      if (!s.ok) throw new Error("Failed to load summary");
      setSummary(await s.json());
      setValuations(v.ok ? await v.json() : []);
      setAccounts(a.ok ? await a.json() : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  // Refetch in place on mount, when the projection date changes, and when the
  // parent signals a data change — without remounting (no chart flash).
  useEffect(() => { load(); }, [load, refreshTick]);

  const accName = useMemo(() => {
    const m = {};
    accounts.forEach((a) => { m[a.id] = a.name; });
    return m;
  }, [accounts]);

  // Net-worth-by-account bar data (in base currency)
  const byAccount = useMemo(
    () => (summary?.accounts ?? [])
      .filter((a) => a.after_pending_base != null && a.include_in_net_worth !== false)
      .map((a) => ({ name: a.name, value: a.after_pending_base })),
    [summary]
  );

  // Currency exposure pie (settled + pending, native)
  const currencyData = useMemo(() => {
    if (!summary) return [];
    const s = summary.net_worth.by_currency_settled || {};
    const p = summary.net_worth.by_currency_pending || {};
    const keys = new Set([...Object.keys(s), ...Object.keys(p)]);
    return [...keys].map((k) => ({ name: k, value: (s[k] || 0) + (p[k] || 0) }));
  }, [summary]);

  // Valuation trend per investment account (line chart, grouped by as_of)
  const trendData = useMemo(() => {
    const byDate = {};
    valuations.forEach((v) => {
      byDate[v.as_of] = byDate[v.as_of] || { as_of: v.as_of };
      byDate[v.as_of][accName[v.account_id] || `#${v.account_id}`] = v.market_value;
    });
    return Object.values(byDate).sort((a, b) => a.as_of.localeCompare(b.as_of));
  }, [valuations, accName]);

  const trendSeries = useMemo(() => {
    const s = new Set();
    valuations.forEach((v) => s.add(accName[v.account_id] || `#${v.account_id}`));
    return [...s];
  }, [valuations, accName]);

  const recentData = useMemo(
    () => (summary?.recent_months ?? []).map((m) => ({
      name: monthLabel(m.month), Income: m.income_base, Spending: m.spend_base,
    })),
    [summary]
  );

  const projectionData = useMemo(
    () => (summary?.projection?.points ?? []).map((p) => ({
      name: monthLabel(p.month), value: p.value,
    })),
    [summary]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>;
  }

  const base = summary.base_currency;
  const nw = summary.net_worth;
  const goal = summary.goal;
  const tm = summary.this_month;
  const ef = summary.emergency_fund || {};
  const proj = summary.projection || {};
  const rec = summary.recurring || { items: [], recurring_total_base: 0 };
  const budgets = summary.budgets || [];
  const reminder = summary.reminder || { active: false };
  const goalProgress = goal?.completion_percent != null
    ? [{ name: "progress", value: Math.min(100, goal.completion_percent), fill: "#6366f1" }]
    : [];

  const al = summary.allowance;
  const investments = summary.accounts.filter((a) => a.account_type === "investment");
  const reviewCount = summary.review_queue_count || 0;
  const fxMissing = summary.accounts.some((a) => a.after_pending_base == null)
    || (goal && goal.fx_available === false);

  const reminderKey = `financeReminderDismissed:${reminder.month}`;
  const showReminder = reminder.active && !reminderHidden
    && (typeof localStorage === "undefined" || localStorage.getItem(reminderKey) !== "1");
  const dismissReminder = () => {
    try { localStorage.setItem(reminderKey, "1"); } catch { /* ignore */ }
    setReminderHidden(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          As of {new Date(summary.generated_at + "Z").toLocaleString()}
        </p>
        <button onClick={load}
          className="text-slate-400 hover:text-indigo-600 flex items-center gap-1 text-xs font-semibold">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {showReminder && (
        <div className="flex items-start gap-2 text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5">
          <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Month-end check-in.</span>{" "}
            Log every transaction for {monthLabel(reminder.month)} so the Emergency Fund and budgets are accurate.
          </div>
          <button onClick={dismissReminder} className="text-indigo-500 hover:text-indigo-700 text-xs font-bold uppercase">Dismiss</button>
        </div>
      )}

      {reviewCount > 0 && (
        <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <FileUp className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">{reviewCount} imported row{reviewCount === 1 ? "" : "s"} need review.</span>{" "}
            They don&apos;t count until you approve them.
          </div>
          {onOpenImport && (
            <button onClick={onOpenImport} className="text-amber-700 hover:text-amber-900 text-xs font-bold uppercase">Review</button>
          )}
        </div>
      )}

      {fxMissing && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Some conversions are unavailable — sync or set FX rates in the Settings tab so KRW/base totals (and the Emergency Fund) are complete.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={Wallet} label={`Net Worth (${base})`}
          value={fmtMoney(nw.after_pending_base, base)}
          sub={`Settled ${fmtMoney(nw.settled_base, base)} · incl. pending${
            nw.liabilities_base ? ` · after ${fmtMoney(nw.liabilities_base, base)} owed` : ""}`} />
        <KpiCard icon={ShieldCheck} label="Emergency Fund" accent="text-emerald-600"
          value={fmtMoney(ef.balance_base, base)}
          sub={ef.monthly_target_base != null
            ? `Target ~${fmtMoney(ef.monthly_target_base, base)}/mo · this month ${fmtMoney(ef.this_month_projected_base, base)}`
            : ""} />
        <KpiCard icon={TrendingUp} label="Projected Net Worth" accent="text-sky-600"
          value={fmtMoney(proj.projected_net_worth_base, base)}
          sub={proj.as_of ? `by ${proj.as_of} · ${fmtMoney(proj.monthly_delta_base, base)}/mo` : ""} />
        <KpiCard icon={Target} label="Goal Progress" accent="text-indigo-600"
          value={goal ? fmtPct(goal.completion_percent) : "—"}
          sub={goal ? `${fmtMoney(goal.current_value, goal.target_currency)} / ${fmtMoney(goal.target_amount, goal.target_currency)}` : "No goal set"} />
        <KpiCard icon={PiggyBank} label="This-Month Savings Rate" accent="text-amber-600"
          value={fmtPct(tm.savings_rate_percent)}
          sub={tm.income_base ? `${fmtMoney(tm.saved_base, base)} saved of ${fmtMoney(tm.income_base, base)}` : "Set income in Budget"} />
        <KpiCard icon={Repeat} label="Recurring / month" accent="text-slate-600"
          value={fmtMoney(rec.recurring_total_base, base)}
          sub={`${rec.items.length} active item${rec.items.length === 1 ? "" : "s"}`} />
      </div>

      {al && <AllowanceCard al={al} base={base} />}

      {/* Recent months + projection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Last 3 months — income vs spending" hint={`in ${base}`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={recentData} margin={{ left: 4, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={64}
                tickFormatter={(v) => v.toLocaleString()} />
              <Tooltip formatter={(v) => fmtMoney(v, base)} />
              <Legend />
              <Bar dataKey="Income" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Spending" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Net-worth projection"
          hint={<label className="flex items-center gap-1">to
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
              className="border border-slate-200 rounded px-1.5 py-0.5 text-[11px]" />
          </label>}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={projectionData} margin={{ left: 4, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }}
                interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={64}
                tickFormatter={(v) => v.toLocaleString()} />
              <Tooltip formatter={(v) => fmtMoney(v, base)} />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-slate-400 mt-1">
            Assumes {fmtMoney(proj.monthly_delta_base, base)}/mo added (income − tax − recurring − allowance). Investment growth not projected.
          </p>
        </ChartCard>
      </div>

      {/* Budgets + top spending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Budgets this month" hint={`in ${base}`}>
          {budgets.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-slate-400 text-center px-6">
              Set a monthly budget on a category in the Budget &amp; Categories tab.
            </div>
          ) : (
            <div className="space-y-3">
              {budgets.map((b) => {
                const pct = b.percent ?? 0;
                const barColor = b.over ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
                return (
                  <div key={b.category}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700">{b.category}</span>
                      <span className={b.over ? "text-rose-600 font-semibold" : "text-slate-500"}>
                        {fmtMoney(b.spent_base, base)} / {fmtMoney(b.limit_base, base)}
                        {b.percent != null && ` · ${b.percent}%`}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Top spending this month" hint={`in ${base}`}>
          {(summary.top_spending || []).length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">No spending logged yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={summary.top_spending} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(v) => v.toLocaleString()} />
                <YAxis type="category" dataKey="category" width={110}
                  tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip formatter={(v) => fmtMoney(v, base)} />
                <Bar dataKey="amount_base" radius={[0, 6, 6, 0]}>
                  {summary.top_spending.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Top income + recurring list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Top income this month" hint={`in ${base}`}>
          {(summary.top_income || []).length === 0 ? (
            <div className="h-[120px] flex items-center justify-center text-sm text-slate-400">No income logged yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.top_income.map((r) => (
                <li key={r.category} className="flex justify-between py-2 text-sm">
                  <span className="text-slate-600">{r.category}</span>
                  <span className="font-semibold text-slate-800">{fmtMoney(r.amount_base, base)}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Recurring subscriptions & fixed costs"
          hint={`${fmtMoney(rec.recurring_total_base, base)}/mo`}>
          {rec.items.length === 0 ? (
            <div className="h-[120px] flex items-center justify-center text-sm text-slate-400">None yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rec.items.map((r) => (
                <li key={r.id} className="flex justify-between py-2 text-sm">
                  <span className="text-slate-600">{r.label}
                    <span className="text-slate-400"> · day {r.day_of_month} · next {r.next_charge_date}</span></span>
                  <span className={`font-semibold ${r.type === "income" ? "text-emerald-600" : "text-slate-800"}`}>
                    {fmtMoney(r.amount, r.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* Net worth by account (full width — one bar per account) */}
      <ChartCard title="Net worth by account" hint={`in ${base}`}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byAccount} margin={{ left: 4, right: 8, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0}
              angle={-12} textAnchor="end" height={54} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={64}
              tickFormatter={(v) => v.toLocaleString()} />
            <Tooltip formatter={(v) => fmtMoney(v, base)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {byAccount.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {investments.length > 0 && (
        <ChartCard title="Investment performance" hint="value − net contributions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b">
                <tr>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 px-3 text-right">Value</th>
                  <th className="py-2 px-3 text-right">Net contributed</th>
                  <th className="py-2 pl-3 text-right">Unrealised gain</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-semibold text-slate-700">{a.name}</td>
                    <td className="py-2 px-3 text-right">{fmtMoney(a.settled, a.currency)}</td>
                    <td className="py-2 px-3 text-right text-slate-500">{fmtMoney(a.net_contributions, a.currency)}</td>
                    <td className={`py-2 pl-3 text-right font-semibold ${a.investment_gain < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {a.investment_gain > 0 ? "+" : ""}{fmtMoney(a.investment_gain, a.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Net contributed = opening balance + transfers in − withdrawals. Dividends and interest are income, not gain
            {tm.investment_income_base ? ` (${fmtMoney(tm.investment_income_base, base)} this month)` : ""}.
          </p>
        </ChartCard>
      )}

      {/* Goal progress + currency exposure */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Goal progress" hint={goal ? goal.label : ""}>
          {goal ? (
            <ResponsiveContainer width="100%" height={260}>
              <RadialBarChart innerRadius="60%" outerRadius="100%" data={goalProgress}
                startAngle={90} endAngle={-270}>
                <RadialBar background dataKey="value" cornerRadius={12} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                  className="fill-slate-800" style={{ fontSize: 26, fontWeight: 800 }}>
                  {fmtPct(goal.completion_percent)}
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-slate-400">
              Add a primary goal in the Budget &amp; Categories tab.
            </div>
          )}
        </ChartCard>

        <ChartCard title="Currency exposure" hint="native, incl. pending">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={currencyData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}
                paddingAngle={2}>
                {currencyData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend />
              <Tooltip formatter={(v, n) => fmtMoney(v, n)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {trendData.length > 1 && (
        <ChartCard title="Investment value over time" hint="market valuations (native)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData} margin={{ left: 4, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="as_of" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={64}
                tickFormatter={(v) => v.toLocaleString()} />
              <Tooltip />
              <Legend />
              {trendSeries.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5" />
        Investment values are the latest valuation plus contributions since. Transfers between your own accounts are never counted as income or spending. Displayed returns are observations, not guarantees.
      </p>
    </div>
  );
};

export default FinanceDashboard;
