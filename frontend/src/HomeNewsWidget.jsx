import React, { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { timeAgo } from "./NewsCard";

const CATEGORY_COLORS = {
  Politics:      "bg-red-100 text-red-700",
  Finance:       "bg-emerald-100 text-emerald-700",
  Technology:    "bg-blue-100 text-blue-700",
  Science:       "bg-purple-100 text-purple-700",
  Health:        "bg-pink-100 text-pink-700",
  Sports:        "bg-orange-100 text-orange-700",
  Entertainment: "bg-yellow-100 text-yellow-800",
  Social:        "bg-teal-100 text-teal-700",
  General:       "bg-slate-100 text-slate-600",
};

const TABS = ["All", "Politics", "Finance", "Technology", "Sports", "Entertainment"];

const MiniCard = ({ article }) => {
  const colorCls = CATEGORY_COLORS[article.category] ?? CATEGORY_COLORS.General;
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200"
    >
      {article.image_url && (
        <img
          src={article.image_url}
          alt=""
          className="w-16 h-16 rounded-lg object-cover shrink-0 bg-slate-100"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      <div className="flex-1 min-w-0">
        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${colorCls}`}>
          {article.category}
        </span>
        <p className="text-sm font-semibold text-slate-800 line-clamp-2 mt-0.5 group-hover:text-indigo-700 transition-colors leading-snug">
          {article.title}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {article.source_name} · {timeAgo(article.published_at || article.fetched_at)}
        </p>
      </div>
    </a>
  );
};

const HomeNewsWidget = ({ onViewAll }) => {
  const [articles, setArticles] = useState([]);
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (cat) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: 1 });
      if (cat !== "All") params.set("category", cat);
      const res = await fetch(`/api/news?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setArticles(data.articles.slice(0, 6));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(category); }, [category, fetch_]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <h3 className="font-bold text-slate-800">Latest News</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetch_(category)}
            disabled={loading}
            className="text-slate-400 hover:text-indigo-600 p-1 rounded transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onViewAll}
            className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto px-5 pb-3 shrink-0" style={{ scrollbarWidth: "none" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setCategory(t)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
              category === t
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Article list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-2 px-3 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 animate-pulse">
                <div className="w-16 h-16 bg-slate-100 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2 w-12 bg-slate-100 rounded-full" />
                  <div className="h-3 bg-slate-100 rounded" />
                  <div className="h-3 w-3/4 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-10">No news yet.</p>
        ) : (
          articles.map((a) => <MiniCard key={a.id} article={a} />)
        )}
      </div>
    </div>
  );
};

export default HomeNewsWidget;
