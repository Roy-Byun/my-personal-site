import React, { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthContext";

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const TYPE_META = {
  birthday:   { label: "Birthday",    bg: "bg-pink-100",   text: "text-pink-700",   dot: "bg-pink-400"   },
  holiday_kr: { label: "한국 공휴일",  bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-400"    },
  holiday_sg: { label: "SG Holiday",  bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-400"   },
  leave:      { label: "Leave",       bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-400"  },
  custom:     { label: "Event",       bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-400" },
};

const today = new Date();
const dateStr = (d) => {
  const dt = new Date(d + "T00:00:00");
  const diff = Math.round((dt - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return dt.toLocaleDateString(undefined, { weekday: "short" });
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const EMPTY_FORM = { title: "", event_date: "", end_date: "", event_type: "custom", description: "", is_public: true };

const FamilyCalendarWidget = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const end = new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10);
      const start = today.toISOString().slice(0, 10);
      const res = await fetch(`/api/events?start=${start}&end=${end}`);
      if (res.ok) setEvents(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSubmitting(true);
    const body = { ...form, end_date: form.end_date || null, description: form.description || null };
    const res = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    if (res.ok) { await load(); setModal(false); setForm(EMPTY_FORM); }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    await fetch(`/api/events/${id}`, { method: "DELETE", credentials: "include" });
    setDeleteTarget(null); load();
  };

  // Group by date
  const grouped = events.reduce((acc, ev) => {
    const key = String(ev.event_date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort().slice(0, 10);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-500" />
          <h3 className="font-bold text-slate-800">Upcoming</h3>
        </div>
        {user && (
          <button onClick={() => { setForm(EMPTY_FORM); setModal(true); }} className="text-slate-400 hover:text-indigo-600 p-1 rounded transition-colors" title="Add event">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {loading ? (
          <div className="space-y-2 animate-pulse">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-50 rounded-xl" />)}</div>
        ) : dates.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No events in the next 60 days.</p>
        ) : (
          dates.map((d) => (
            <div key={d}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                {dateStr(d)}
              </p>
              <div className="space-y-1">
                {grouped[d].map((ev, i) => {
                  const meta = TYPE_META[ev.event_type] ?? TYPE_META.custom;
                  return (
                    <div key={`${ev.id ?? ev.event_type}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 group">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                      <span className="text-sm text-slate-700 flex-1 leading-snug">{ev.title}</span>
                      {ev.id && user && (
                        deleteTarget === ev.id ? (
                          <span className="flex gap-1 opacity-100">
                            <button onClick={() => handleDelete(ev.id)} className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded font-bold">✓</button>
                            <button onClick={() => setDeleteTarget(null)} className="text-[10px] border px-1.5 py-0.5 rounded">✕</button>
                          </span>
                        ) : (
                          <button onClick={() => setDeleteTarget(ev.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add event modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">Add Event</h3>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Title *</label>
                <input name="title" value={form.title} onChange={handleChange} required className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date *</label>
                  <input type="date" name="event_date" value={form.event_date} onChange={handleChange} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">End Date</label>
                  <input type="date" name="end_date" value={form.end_date} onChange={handleChange} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
                <select name="event_type" value={form.event_type} onChange={handleChange} className={inputCls}>
                  <option value="custom">Custom Event</option>
                  <option value="leave">Leave / Vacation</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={2} className={inputCls} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="is_public" checked={form.is_public} onChange={handleChange} className="accent-indigo-600" />
                Visible to all family members
              </label>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {submitting ? "Adding…" : "Add Event"}
                </button>
                <button type="button" onClick={() => setModal(false)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyCalendarWidget;
