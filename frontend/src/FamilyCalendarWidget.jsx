import React, { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import InfoTooltip from "./InfoTooltip";

const TYPE_META = {
  birthday:    { dot: "bg-pink-400"    },
  memorial:    { dot: "bg-slate-400"   },
  anniversary: { dot: "bg-rose-400"    },
  holiday_kr:  { dot: "bg-red-400"     },
  holiday_sg:  { dot: "bg-blue-400"    },
  leave:       { dot: "bg-amber-400"   },
  meeting:     { dot: "bg-cyan-400"    },
  school:      { dot: "bg-green-400"   },
  medical:     { dot: "bg-emerald-400" },
  travel:      { dot: "bg-violet-400"  },
  custom:      { dot: "bg-indigo-400"  },
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

const FamilyCalendarWidget = ({ onViewMore, title = "Upcoming" }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const start = today.toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/events?start=${start}&end=${end}`)
      .then(r => r.ok ? r.json() : [])
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  const grouped = events.reduce((acc, ev) => {
    const key = String(ev.event_date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-500" />
          <h3 className="font-bold text-slate-800 flex items-center">
            {title}
            <InfoTooltip text="다음 30일 내 가족 일정과 생일을 보여줍니다. (Shows family events and birthdays in the next 30 days)" />
          </h3>
        </div>
        {onViewMore && (
          <button
            onClick={onViewMore}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            View all →
          </button>
        )}
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-slate-50 rounded-xl" />)}
          </div>
        ) : dates.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No events in the next 30 days.</p>
        ) : (
          dates.map(d => (
            <div key={d}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{dateStr(d)}</p>
              <div className="space-y-1">
                {grouped[d].map((ev, i) => {
                  const meta = TYPE_META[ev.event_type] ?? TYPE_META.custom;
                  return (
                    <div key={`${ev.id ?? ev.event_type}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                      <span className="text-sm text-slate-700 flex-1 leading-snug">{ev.title}</span>
                      {ev.is_recurring && <span className="text-[10px] text-slate-400 shrink-0">🔁</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default FamilyCalendarWidget;
