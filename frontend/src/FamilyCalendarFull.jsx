import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { useAuth } from "./AuthContext";

const TYPE_META = {
  birthday:    { label: "Birthday",    emoji: "🎂", dot: "bg-pink-400",    text: "text-pink-700",    bg: "bg-pink-50",    border: "border-pink-200"    },
  memorial:    { label: "Memorial",    emoji: "🕊️",  dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-100",  border: "border-slate-200"   },
  anniversary: { label: "Anniversary", emoji: "💍",  dot: "bg-rose-400",    text: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200"    },
  holiday_kr:  { label: "한국 공휴일", emoji: "🇰🇷", dot: "bg-red-400",     text: "text-red-700",     bg: "bg-red-50",     border: "border-red-200"     },
  holiday_sg:  { label: "SG Holiday",  emoji: "🇸🇬", dot: "bg-blue-400",    text: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200"    },
  leave:       { label: "Leave",       emoji: "🏖️", dot: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"   },
  meeting:     { label: "Meeting",     emoji: "📅",  dot: "bg-cyan-400",    text: "text-cyan-700",    bg: "bg-cyan-50",    border: "border-cyan-200"    },
  school:      { label: "School",      emoji: "📚",  dot: "bg-green-400",   text: "text-green-700",   bg: "bg-green-50",   border: "border-green-200"   },
  medical:     { label: "Medical",     emoji: "🏥",  dot: "bg-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  travel:      { label: "Travel",      emoji: "✈️",  dot: "bg-violet-400",  text: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200"  },
  custom:      { label: "Other",       emoji: "📌",  dot: "bg-indigo-400",  text: "text-indigo-700",  bg: "bg-indigo-50",  border: "border-indigo-200"  },
};

const USER_EVENT_TYPES = [
  "memorial", "anniversary", "leave",
  "meeting", "school", "medical", "travel", "custom",
];

const RECURRENCE_LABELS = {
  daily: "day(s)", weekly: "week(s)", monthly: "month(s)", yearly: "year(s)",
};

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const EMPTY_FORM = {
  title: "", event_date: "", end_date: "", event_type: "custom",
  description: "", is_public: true, recurrence_type: "",
  recurrence_interval: 1, recurrence_end: "",
};

const fmt    = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}-01`;
const toISO  = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function FamilyCalendarFull() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  // Add-event modal
  const [addModal, setAddModal]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ICS import
  const fileInputRef = useRef(null);
  const [importing, setImporting]   = useState(false);
  const [importMsg, setImportMsg]   = useState(null);

  const load = () => {
    setLoading(true);
    const startDate = fmt(year, month);
    const endY = month === 11 ? year + 1 : year;
    const endDate = fmt(endY, (month + 1) % 12);
    fetch(`/api/events?start=${startDate}&end=${endDate}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setEvents)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventMap = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      const key = ev.event_date;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const goToday   = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };
  const todayStr  = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  const openDay = (d) => {
    if (!d) return;
    const key = toISO(year, month, d);
    setSelected({ dateStr: key, events: eventMap[key] || [] });
  };

  // Pre-fill event_date when user opens add modal from a day cell
  const openAddFromDay = (d) => {
    const key = toISO(year, month, d);
    setForm({ ...EMPTY_FORM, event_date: key });
    setAddModal(true);
  };

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const body = {
      ...form,
      end_date: form.end_date || null,
      description: form.description || null,
      recurrence_type: form.recurrence_type || null,
      recurrence_interval: form.recurrence_type ? Number(form.recurrence_interval) : 1,
      recurrence_end: form.recurrence_end || null,
    };
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.ok) { setAddModal(false); setForm(EMPTY_FORM); load(); }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    await fetch(`/api/events/${id}`, { method: "DELETE", credentials: "include" });
    setDeleteTarget(null);
    setSelected(null);
    load();
  };

  const handleIcsChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/events/import-ics", {
        method: "POST", credentials: "include", body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        setImportMsg(`Imported ${data.imported} event${data.imported !== 1 ? "s" : ""}${data.skipped ? ` (${data.skipped} skipped)` : ""}.`);
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        setImportMsg(`Import failed: ${err.detail || res.statusText}`);
      }
    } catch {
      setImportMsg("Import failed: network error.");
    } finally {
      setImporting(false);
      setTimeout(() => setImportMsg(null), 5000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-slate-800 text-lg">{MONTH_NAMES[month]} {year}</h3>
          {loading && <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />}
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <>
              <input ref={fileInputRef} type="file" accept=".ics" className="hidden" onChange={handleIcsChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg transition-colors"
                title="Import .ics file"
              >
                {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { setForm(EMPTY_FORM); setAddModal(true); }}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
                title="Add event"
              >
                <Plus className="w-3.5 h-3.5" /> Add Event
              </button>
            </>
          )}
          <button onClick={goToday} className="text-xs font-semibold text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">Today</button>
          <button onClick={prevMonth} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Import status */}
      {importMsg && (
        <div className={`mx-4 mt-2 px-3 py-2 rounded-lg text-xs font-medium ${importMsg.startsWith("Import failed") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {importMsg}
        </div>
      )}

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {DOW.map(d => (
          <div key={d} className={`py-2 text-center text-[11px] font-bold uppercase tracking-widest
            ${d === "Sun" ? "text-red-400" : d === "Sat" ? "text-blue-400" : "text-slate-400"}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {grid.map((day, idx) => {
          const key = day ? toISO(year, month, day) : null;
          const dayEvents = key ? (eventMap[key] || []) : [];
          const isToday = key === todayStr;
          const isSun = idx % 7 === 0;
          const isSat = idx % 7 === 6;

          return (
            <div
              key={idx}
              onClick={() => openDay(day)}
              onDoubleClick={() => user && day && openAddFromDay(day)}
              className={`min-h-[80px] border-b border-r border-slate-100 p-1.5 relative
                ${day ? "cursor-pointer hover:bg-slate-50" : "bg-slate-50/50"}
                ${isSat ? "border-r-0" : ""}
              `}
            >
              {day && (
                <>
                  <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold mb-1
                    ${isToday ? "bg-indigo-600 text-white" : isSun ? "text-red-500" : isSat ? "text-blue-500" : "text-slate-700"}
                  `}>
                    {day}
                  </span>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev, i) => {
                      const meta = TYPE_META[ev.event_type] ?? TYPE_META.custom;
                      return (
                        <div key={i} className={`text-[10px] font-medium px-1 py-0.5 rounded truncate leading-tight ${meta.bg} ${meta.text}`}>
                          {meta.emoji} {ev.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-slate-400 font-medium px-1">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(TYPE_META).map(([type, meta]) => (
          <span key={type} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        ))}
        {user && <span className="text-[10px] text-slate-400 ml-2">Double-click a day to add an event</span>}
      </div>

      {/* Day detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => { setSelected(null); setDeleteTarget(null); }}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <p className="font-bold text-slate-800">
                  {new Date(selected.dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selected.events.length === 0 ? "No events" : `${selected.events.length} event${selected.events.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {user && (
                  <button
                    onClick={() => { setSelected(null); setForm({ ...EMPTY_FORM, event_date: selected.dateStr }); setAddModal(true); }}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 border border-indigo-200 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                )}
                <button onClick={() => { setSelected(null); setDeleteTarget(null); }} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
              {selected.events.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Nothing scheduled.</p>
              ) : selected.events.map((ev, i) => {
                const meta = TYPE_META[ev.event_type] ?? TYPE_META.custom;
                return (
                  <div key={i} className={`rounded-xl border p-3 ${meta.bg} ${meta.border}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none mt-0.5">{meta.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm ${meta.text}`}>{ev.title}</p>
                        {ev.end_date && ev.end_date !== ev.event_date && (
                          <p className="text-[11px] text-slate-400 mt-0.5">Until {ev.end_date}</p>
                        )}
                        {ev.description && (
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{ev.description}</p>
                        )}
                        {ev.is_recurring && <span className="inline-block mt-1 text-[10px] font-bold text-indigo-500">🔁 Recurring</span>}
                      </div>
                      {ev.id && user && (
                        deleteTarget === ev.id ? (
                          <span className="flex gap-1 shrink-0">
                            <button onClick={() => handleDelete(ev.id)} className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded font-bold">✓</button>
                            <button onClick={() => setDeleteTarget(null)} className="text-[10px] border px-1.5 py-0.5 rounded bg-white">✕</button>
                          </span>
                        ) : (
                          <button onClick={() => setDeleteTarget(ev.id)} className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add event modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <h3 className="font-bold text-slate-800">Add Event</h3>
              <button onClick={() => setAddModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Title *</label>
                <input name="title" value={form.title} onChange={handleChange} required className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
                <select name="event_type" value={form.event_type} onChange={handleChange} className={inputCls}>
                  {USER_EVENT_TYPES.map(t => (
                    <option key={t} value={t}>{TYPE_META[t]?.emoji} {TYPE_META[t]?.label ?? t}</option>
                  ))}
                </select>
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Repeats</label>
                <select name="recurrence_type" value={form.recurrence_type} onChange={handleChange} className={inputCls}>
                  <option value="">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              {form.recurrence_type && (
                <div className="grid grid-cols-2 gap-3 pl-3 border-l-2 border-indigo-100">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Every (n {RECURRENCE_LABELS[form.recurrence_type]})
                    </label>
                    <input type="number" name="recurrence_interval" value={form.recurrence_interval} onChange={handleChange} min="1" max="99" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Until (optional)</label>
                    <input type="date" name="recurrence_end" value={form.recurrence_end} onChange={handleChange} className={inputCls} />
                  </div>
                </div>
              )}
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
                <button type="button" onClick={() => setAddModal(false)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
