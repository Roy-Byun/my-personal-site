import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import InfoTooltip from "./InfoTooltip";
import { useT } from "./i18n";

const TYPE_META = {
  achievement: { label: "🏆", bg: "bg-yellow-100 text-yellow-800" },
  milestone:   { label: "🎯", bg: "bg-indigo-100 text-indigo-700" },
  memorial:    { label: "🕊️", bg: "bg-slate-100 text-slate-600" },
  update:      { label: "📝", bg: "bg-emerald-100 text-emerald-700" },
};

const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function FamilyPostsPreview({ onViewAll }) {
  const { t } = useT();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/posts?page=1", { credentials: "include" })
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(data => setPosts((data.posts || []).slice(0, 5)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
        <h3 className="font-bold text-slate-800 flex items-center">
          {t("Family News")}
          <InfoTooltip text="가족 소식을 공유하는 공간입니다. 모든 가족이 볼 수 있어요. (Family News — where members share updates, visible to everyone)" />
        </h3>
        <button
          onClick={onViewAll}
          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {t("View all")} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-14 bg-slate-50 rounded-xl" />)}
          </div>
        ) : posts.length === 0 ? (
          <p className="text-center py-6 text-slate-400 text-sm">{t("No posts yet")}</p>
        ) : (
          posts.map(p => {
            const meta = TYPE_META[p.post_type] ?? TYPE_META.update;
            return (
              <div key={p.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${meta.bg}`}>
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  {p.title && <p className="text-xs font-semibold text-slate-800 truncate">{p.title}</p>}
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{p.content}</p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(p.created_at)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
