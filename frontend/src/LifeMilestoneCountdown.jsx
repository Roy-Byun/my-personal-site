import React, { useCallback, useEffect, useState } from "react";
import { Hourglass, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthContext";

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

const remaining = (targetDate) => {
  const diff = new Date(targetDate + "Z").getTime() - Date.now();
  const isPast = diff < 0;
  const abs = Math.abs(diff);
  return {
    isPast,
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
    seconds: Math.floor((abs % 60000) / 1000),
  };
};

const CountdownUnit = ({ value, label }) => (
  <div className="flex flex-col items-center">
    <span className="text-3xl sm:text-5xl font-extrabold text-slate-800 tabular-nums">{String(value).padStart(2, "0")}</span>
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{label}</span>
  </div>
);

const EMPTY_FORM = { label: "", target_date: "", note: "", is_featured: false };

const MilestoneFormModal = ({ initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial
      ? { label: initial.label, target_date: initial.target_date.slice(0, 16), note: initial.note ?? "", is_featured: initial.is_featured }
      : EMPTY_FORM
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/about/milestones/${initial.id}` : "/api/about/milestones", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, note: form.note || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Failed to save milestone");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? "Edit Milestone" : "New Milestone"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Label *</label>
          <input name="label" value={form.label} onChange={handleChange} required placeholder="PhD Completion" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Target Date *</label>
          <input type="datetime-local" name="target_date" value={form.target_date} onChange={handleChange} required className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Note</label>
          <textarea name="note" value={form.note} onChange={handleChange} rows={2} className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_featured" name="is_featured" checked={form.is_featured}
            onChange={handleChange} className="accent-indigo-600 w-4 h-4" />
          <label htmlFor="is_featured" className="text-xs text-slate-600">Featured (shown as the big countdown)</label>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Milestone"}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const LifeMilestoneCountdown = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [milestones, setMilestones] = useState([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [manageOpen, setManageOpen] = useState(false);

  const fetchMilestones = useCallback(async () => {
    try {
      const res = await fetch("/api/about/milestones");
      if (!res.ok) throw new Error("Failed to load milestones");
      setMilestones(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { fetchMilestones(); }, [fetchMilestones]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleDelete = async (id) => {
    await fetch(`/api/about/milestones/${id}`, { method: "DELETE", credentials: "include" });
    await fetchMilestones();
  };

  if (milestones.length === 0 && !isAdmin) return null;

  const featured = milestones.find((m) => m.is_featured)
    || [...milestones].sort((a, b) => new Date(a.target_date) - new Date(b.target_date))[0];
  const others = milestones.filter((m) => m.id !== featured?.id);
  const r = featured ? remaining(featured.target_date) : null;
  void tick; // re-render every second so the countdown stays live

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-500">
          <Hourglass className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-widest">Life Milestone</h3>
        </div>
        {isAdmin && (
          <button onClick={() => setManageOpen(true)} className="text-xs font-bold text-indigo-600 hover:text-indigo-700">
            Manage
          </button>
        )}
      </div>

      {featured ? (
        <>
          <p className="text-lg font-bold text-slate-800 mb-1">{featured.label}</p>
          {featured.note && <p className="text-sm text-slate-500 mb-4">{featured.note}</p>}
          <div className="flex items-center justify-center gap-4 sm:gap-8 py-4">
            {r.isPast ? (
              <p className="text-xl font-bold text-emerald-600">Reached! 🎉</p>
            ) : (
              <>
                <CountdownUnit value={r.days} label="Days" />
                <CountdownUnit value={r.hours} label="Hours" />
                <CountdownUnit value={r.minutes} label="Min" />
                <CountdownUnit value={r.seconds} label="Sec" />
              </>
            )}
          </div>
          <p className="text-center text-xs text-slate-400">
            Target: {new Date(featured.target_date + "Z").toLocaleString()}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-400">No milestones yet.</p>
      )}

      {others.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
          {others.map((m) => {
            const rr = remaining(m.target_date);
            return (
              <span key={m.id} className="text-xs bg-slate-50 text-slate-600 rounded-full px-3 py-1">
                {m.label}: {rr.isPast ? "reached" : `${rr.days}d`}
              </span>
            );
          })}
        </div>
      )}

      {manageOpen && (
        <Modal title="Manage Milestones" onClose={() => setManageOpen(false)}>
          <div className="space-y-2 mb-4">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {m.is_featured && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{m.label}</p>
                    <p className="text-[11px] text-slate-400">{new Date(m.target_date + "Z").toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditTarget(m); setModal("edit"); }} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            {milestones.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No milestones yet.</p>}
          </div>
          <button onClick={() => { setEditTarget(null); setModal("create"); }}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center justify-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Add Milestone
          </button>
        </Modal>
      )}

      {modal && (
        <MilestoneFormModal
          initial={modal === "edit" ? editTarget : null}
          onClose={() => setModal(null)}
          onSaved={fetchMilestones}
        />
      )}
    </div>
  );
};

export default LifeMilestoneCountdown;
