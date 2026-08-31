import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, Target, TrendingUp, PiggyBank, AlertTriangle, RefreshCw, Info,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  RadialBarChart, RadialBar,
} from "recharts";
import { fmtMoney, fmtPct } from "./financeFormat";

// Palette — brand indigo family + supporting hues, readable in the light theme.
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#ec4899", "#8b5cf6", "#64748b"];
const RISK_COLORS = { liquid: "#0ea5e9", low_risk: "#10b981", market: "#6366f1", unclassified: "#94a3b8" };

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

// ── dashboard ────────────────────────────────────────────────────────────────

const FinanceDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [valuations, setValuations] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, v, a] = await Promise.all([
        fetch("/api/finance/summary", { credentials: "include" }),
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
  }, []);

  useEffect(() => { load(); }, [load]);

  const accName = useMemo(() => {
    const m = {};
    accounts.forEach((a) => { m[a.id] = a.name; });
    return m;
  }, [accounts]);

  // Net-worth-by-account bar data (in base currency)
  const byAccount = useMemo(
    () => (summary?.accounts ?? [])
      .filter((a) => a.after_pending_base != null)
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

  // Risk split pie
  const riskData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.risk_split_base || {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: k.replace("_", " "), key: k, value: v }));
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
  const goalProgress = goal?.completion_percent != null
    ? [{ name: "progress", value: Math.min(100, goal.completion_percent), fill: "#6366f1" }]
    : [];

  const fxMissing = summary.accounts.some((a) => a.after_pending_base == null)
    || (goal && goal.fx_available === false);

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

      {fxMissing && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Some conversions are unavailable — sync or set FX rates in the Settings tab so KRW/base totals are complete.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Wallet} label={`Net Worth (${base})`}
          value={fmtMoney(nw.after_pending_base, base)}
          sub={`Settled ${fmtMoney(nw.settled_base, base)} · incl. pending`} />
        <KpiCard icon={Target} label="Goal Progress" accent="text-emerald-600"
          value={goal ? fmtPct(goal.completion_percent) : "—"}
          sub={goal ? `${fmtMoney(goal.current_value, goal.target_currency)} / ${fmtMoney(goal.target_amount, goal.target_currency)}` : "No goal set"} />
        <KpiCard icon={PiggyBank} label="This-Month Savings Rate" accent="text-amber-600"
          value={fmtPct(tm.savings_rate_percent)}
          sub={tm.income_base ? `${fmtMoney(tm.saved_base, base)} saved of ${fmtMoney(tm.income_base, base)}` : "Set income in Budget"} />
        <KpiCard icon={TrendingUp} label="Deadline" accent="text-sky-600"
          value={goal?.months_remaining != null ? `${goal.months_remaining} mo` : "—"}
          sub={goal?.required_monthly_saving_goal_ccy != null
            ? `Need ~${fmtMoney(goal.required_monthly_saving_goal_ccy, goal.target_currency)}/mo`
            : (goal?.target_date ? `by ${goal.target_date}` : "")} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
              Add a primary goal in the Budget &amp; Goals tab.
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

        <ChartCard title="Liquid vs market-risk split" hint={`in ${base}`}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}
                paddingAngle={2}>
                {riskData.map((d, i) => (
                  <Cell key={i} fill={RISK_COLORS[d.key] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip formatter={(v) => fmtMoney(v, base)} />
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
        Investment values use each platform&apos;s reported Total Return; payouts are not added on top. Displayed returns are observations, not guarantees.
      </p>
    </div>
  );
};

export default FinanceDashboard;
