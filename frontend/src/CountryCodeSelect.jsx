import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { COUNTRIES, flagEmoji } from "./countries";

const CountryCodeSelect = ({ value, onChange, name = "country_code" }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  const selected = COUNTRIES.find((c) => c.dial === value && !query) ?? null;

  const filtered = query.trim()
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.dial.includes(query) ||
          c.iso.toLowerCase().includes(query.toLowerCase())
      )
    : COUNTRIES;

  const pick = (c) => {
    onChange({ target: { name, value: c.dial } });
    setOpen(false);
    setQuery("");
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange({ target: { name, value: "" } });
    setQuery("");
  };

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Display text for the trigger button
  const triggerContent = value ? (
    <span className="flex items-center gap-2 text-sm text-slate-800">
      <span className="text-lg leading-none">
        {selected ? flagEmoji(selected.iso) : "🌐"}
      </span>
      <span className="font-mono font-semibold">{value}</span>
      {selected && (
        <span className="text-slate-400 text-xs truncate max-w-[120px]">
          {selected.name}
        </span>
      )}
    </span>
  ) : (
    <span className="text-sm text-slate-400">Select country code…</span>
  );

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-slate-300 transition-colors"
      >
        {triggerContent}
        <span className="flex items-center gap-1 ml-2 shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={(e) => e.key === "Enter" && clear(e)}
              className="text-slate-300 hover:text-slate-500 p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code…"
              className="flex-1 text-sm outline-none bg-transparent placeholder-slate-400"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-slate-400 text-center">No results</li>
            )}
            {filtered.map((c) => (
              <li key={c.iso}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-indigo-50 transition-colors text-left ${
                    value === c.dial && selected?.iso === c.iso
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-slate-700"
                  }`}
                >
                  <span className="text-lg leading-none w-6 text-center shrink-0">
                    {flagEmoji(c.iso)}
                  </span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-xs text-slate-500 shrink-0">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CountryCodeSelect;
