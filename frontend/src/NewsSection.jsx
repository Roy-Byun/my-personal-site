import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import NewsCard from "./NewsCard";

const ALL_CATEGORIES = [
  "All", "Politics", "Finance", "Technology", "Science",
  "Health", "Sports", "Entertainment", "Social", "General",
];

const NewsSection = () => {
  const [articles, setArticles] = useState([]);
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [catCounts, setCatCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const tabsRef = useRef(null);

  const fetchPage = useCallback(async (cat, pg, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: pg });
      if (cat !== "All") params.set("category", cat);
      const res = await fetch(`/api/news?${params}`);
      if (!res.ok) throw new Error("Failed to load news");
      const data = await res.json();
      setArticles((prev) => append ? [...prev, ...data.articles] : data.articles);
      setHasMore(data.has_more);
      setTotal(data.total);
      setCatCounts(data.category_counts ?? {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    fetchPage(category, 1, false);
  }, [category, fetchPage]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(category, next, true);
  };

  const totalInCat = category === "All" ? total : (catCounts[category] ?? 0);

  return (
    <section className="max-w-7xl mx-auto px-6 py-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Latest News</h2>
          {!loading && (
            <p className="text-xs text-slate-400 mt-0.5">
              {totalInCat > 0 ? `${totalInCat} article${totalInCat !== 1 ? "s" : ""}` : "No articles"}
              {category !== "All" && ` in ${category}`}
            </p>
          )}
        </div>
        <button
          onClick={() => fetchPage(category, 1, false)}
          disabled={loading}
          className="text-slate-400 hover:text-indigo-600 transition-colors p-2 rounded-lg hover:bg-indigo-50 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Category tabs */}
      <div
        ref={tabsRef}
        className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {ALL_CATEGORIES.map((cat) => {
          const count = cat === "All"
            ? Object.values(catCounts).reduce((s, n) => s + n, 0)
            : (catCounts[cat] ?? 0);
          const active = cat === category;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                active
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
              }`}
            >
              {cat}
              {count > 0 && (
                <span className={`ml-1.5 text-[10px] ${active ? "opacity-75" : "text-slate-400"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse">
              <div className="h-44 bg-slate-100" />
              <div className="p-4 space-y-2">
                <div className="h-3 w-16 bg-slate-100 rounded-full" />
                <div className="h-4 bg-slate-100 rounded" />
                <div className="h-4 w-3/4 bg-slate-100 rounded" />
                <div className="h-3 w-1/2 bg-slate-100 rounded mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-lg font-semibold">No news yet</p>
          <p className="text-sm mt-1">Add a news source in Admin → News Management to start fetching articles.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {articles.map((a) => (
              <NewsCard key={a.id} article={a} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-white border border-slate-200 rounded-full text-sm font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default NewsSection;
