import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

const TYPE_META = {
  birthday:    { emoji: "🎂", dot: "bg-pink-400",    text: "text-pink-700",    bg: "bg-pink-50",    border: "border-pink-200"    },
  memorial:    { emoji: "🕊️",  dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-100",  border: "border-slate-200"   },
  anniversary: { emoji: "💍",  dot: "bg-rose-400",    text: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200"    },
  holiday_kr:  { emoji: "🇰🇷", dot: "bg-red-400",     text: "text-red-700",     bg: "bg-red-50",     border: "border-red-200"     },
  holiday_sg:  { emoji: "🇸🇬", dot: "bg-blue-400",    text: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200"    },
  leave:       { emoji: "🏖️", dot: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"   },
  meeting:     { emoji: "📅",  dot: "bg-cyan-400",    text: "text-cyan-700",    bg: "bg-cyan-50",    border: "border-cyan-200"    },
  school:      { emoji: "📚",  dot: "bg-green-400",   text: "text-green-700",   bg: "bg-green-50",   border: "border-green-200"   },
  medical:     { emoji: "🏥",  dot: "bg-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  travel:      { emoji: "✈️",  dot: "bg-violet-400",  text: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200"  },
  custom:      { emoji: "📌",  dot: "bg-indigo-400",  text: "text-indigo-700",  bg: "bg-indigo-50",  border: "border-indigo-200"  },
};

const fmt = (y, m) =>
  `${y}-${String(m + 1).padStart(2, "0")}-01`;

const toISO = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function FamilyCalendarFull() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());   // 0-indexed
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // { dateStr, events[] }

  // Fetch entire month + a few surrounding days
  useEffect(() => {
    setLoading(true);
    const startDate = fmt(year, month);
    // end = first day of next month
    const endY = month === 11 ? year + 1 : year;
    const endM = (month + 1) % 12;
    const endDate = fmt(endY, endM);
    fetch(`/api/events?start=${startDate}&end=${endDate}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => setEvents(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  // Build event map: "YYYY-MM-DD" → events[]
  const eventMap = useMemo(() => {
    const map = {};
    events.forEach(ev => {
      const key = ev.event_date;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  // Build calendar grid
  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Pad to full weeks
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const todayStr = toISO(now.getFullYear(), now.getMonth(), now.getDate());

  const openDay = (d) => {
    if (!d) return;
    const key = toISO(year, month, d);
    setSelected({ dateStr: key, events: eventMap[key] || [] });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-slate-800 text-lg">
            {MONTH_NAMES[month]} {year}
          </h3>
          {loading && (
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday}
            className="text-xs font-semibold text-indigo-600 border border-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
            Today
          </button>
          <button onClick={prevMonth}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={nextMonth}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

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
              className={`min-h-[80px] border-b border-r border-slate-100 p-1.5 relative
                ${day ? "cursor-pointer hover:bg-slate-50" : "bg-slate-50/50"}
                ${idx % 7 === 6 ? "border-r-0" : ""}
              `}
            >
              {day && (
                <>
                  <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold mb-1
                    ${isToday
                      ? "bg-indigo-600 text-white"
                      : isSun ? "text-red-500"
                      : isSat ? "text-blue-500"
                      : "text-slate-700"}
                  `}>
                    {day}
                  </span>

                  {/* Event pills — show up to 3, then "+N more" */}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev, i) => {
                      const meta = TYPE_META[ev.event_type] ?? TYPE_META.custom;
                      return (
                        <div key={i}
                          className={`text-[10px] font-medium px-1 py-0.5 rounded truncate leading-tight ${meta.bg} ${meta.text}`}>
                          {meta.emoji} {ev.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-slate-400 font-medium px-1">
                        +{dayEvents.length - 3} more
                      </div>
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
            {meta.emoji}
          </span>
        ))}
      </div>

      {/* Day detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <p className="font-bold text-slate-800">
                  {new Date(selected.dateStr + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "long", year: "numeric", month: "long", day: "numeric",
                  })}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selected.events.length === 0 ? "No events" : `${selected.events.length} event${selected.events.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
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
                      <div>
                        <p className={`font-semibold text-sm ${meta.text}`}>{ev.title}</p>
                        {ev.end_date && ev.end_date !== ev.event_date && (
                          <p className="text-[11px] text-slate-400 mt-0.5">Until {ev.end_date}</p>
                        )}
                        {ev.description && (
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{ev.description}</p>
                        )}
                        {ev.is_recurring && (
                          <span className="inline-block mt-1 text-[10px] font-bold text-indigo-500">🔁 Recurring</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
