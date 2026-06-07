import React from "react";
import { Clock, ExternalLink } from "lucide-react";

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

export const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const ts = dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const NewsCard = ({ article }) => {
  const colorCls = CATEGORY_COLORS[article.category] ?? CATEGORY_COLORS.General;

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-indigo-200 transition-all flex flex-col"
    >
      {/* Thumbnail */}
      {article.image_url ? (
        <div className="relative h-44 overflow-hidden bg-slate-100 shrink-0">
          <img
            src={article.image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
          />
        </div>
      ) : (
        <div className="h-2 bg-gradient-to-r from-indigo-500 to-purple-500 shrink-0" />
      )}

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        {/* Category badge */}
        <span className={`self-start text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2 ${colorCls}`}>
          {article.category}
        </span>

        {/* Title */}
        <h3 className="font-bold text-slate-800 text-sm leading-snug line-clamp-3 group-hover:text-indigo-700 transition-colors flex-1">
          {article.title}
        </h3>

        {/* Summary */}
        {article.summary && (
          <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 mt-1.5">
            {article.summary}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 truncate max-w-[55%]">
            {article.source_name || "Unknown"}
          </span>
          <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
            <Clock className="w-3 h-3" />
            {timeAgo(article.published_at || article.fetched_at)}
            <ExternalLink className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </a>
  );
};

export default NewsCard;
