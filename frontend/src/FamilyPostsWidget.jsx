import React, { useCallback, useEffect, useState } from "react";
import { Image, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthContext";

const EMOJIS = ["❤️", "🎉", "😢", "💪", "🙏", "😊"];

const TYPE_META = {
  achievement: { label: "🏆 Achievement", bg: "bg-yellow-100 text-yellow-800" },
  milestone:   { label: "🎯 Milestone",   bg: "bg-indigo-100 text-indigo-700" },
  memorial:    { label: "🕊️ In Memory",   bg: "bg-slate-100 text-slate-600"   },
  update:      { label: "📝 Update",      bg: "bg-emerald-100 text-emerald-700" },
};

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const timeAgoPost = (iso) => {
  const diff = Date.now() - new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const EMPTY_FORM = { title: "", content: "", image_url: "", post_type: "update" };

const FamilyPostsWidget = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);   // null | "create" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async (pg, append = false) => {
    if (!append) setLoading(true);
    try {
      const res = await fetch(`/api/posts?page=${pg}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setPosts((prev) => append ? [...prev, ...data.posts] : data.posts);
      setHasMore(data.has_more);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1, false); }, [load]);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSubmitting(true);
    const body = { ...form, title: form.title || null, image_url: form.image_url || null };
    const url = modal === "edit" ? `/api/posts/${editTarget.id}` : "/api/posts";
    const res = await fetch(url, { method: modal === "edit" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    if (res.ok) { setModal(null); setForm(EMPTY_FORM); load(1, false); }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    await fetch(`/api/posts/${id}`, { method: "DELETE", credentials: "include" });
    setDeleteTarget(null); load(1, false);
  };

  const handleReact = async (postId, emoji) => {
    if (!user) return;
    const res = await fetch(`/api/posts/${postId}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ emoji }) });
    if (res.ok) {
      const data = await res.json();
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, reactions: data.reactions } : p));
    }
  };

  const openCreate = () => { setForm(EMPTY_FORM); setModal("create"); };
  const openEdit = (p) => { setEditTarget(p); setForm({ title: p.title ?? "", content: p.content, image_url: p.image_url ?? "", post_type: p.post_type }); setModal("edit"); };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
        <h3 className="font-bold text-slate-800">Family News</h3>
        {user && (
          <button onClick={openCreate} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Share
          </button>
        )}
      </div>

      {/* Post feed */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1,2].map(i => <div key={i} className="h-28 bg-slate-50 rounded-xl" />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <p className="font-semibold text-sm">No posts yet</p>
            {user && <p className="text-xs mt-1">Be the first to share a family update!</p>}
          </div>
        ) : (
          posts.map((p) => {
            const meta = TYPE_META[p.post_type] ?? TYPE_META.update;
            const isOwn = user?.id === p.author_id;
            const isAdmin = user?.role === "admin";
            return (
              <div key={p.id} className={`rounded-xl border p-4 ${p.is_pinned ? "border-indigo-200 bg-indigo-50/40" : "border-slate-100"}`}>
                {/* Post header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {(p.author_name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 leading-none">{p.author_name || "Member"}</p>
                      <p className="text-[10px] text-slate-400">{timeAgoPost(p.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${meta.bg}`}>{meta.label}</span>
                    {p.is_pinned && <span className="text-[9px] text-indigo-600 font-bold">📌</span>}
                    {(isOwn || isAdmin) && (
                      deleteTarget === p.id ? (
                        <span className="flex gap-0.5">
                          <button onClick={() => handleDelete(p.id)} className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded font-bold">✓</button>
                          <button onClick={() => setDeleteTarget(null)} className="text-[10px] border px-1.5 py-0.5 rounded">✕</button>
                        </span>
                      ) : (
                        <span className="flex gap-0.5">
                          {isOwn && <button onClick={() => openEdit(p)} className="p-1 text-slate-400 hover:text-indigo-600 rounded"><Pencil className="w-3 h-3" /></button>}
                          <button onClick={() => setDeleteTarget(p.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Content */}
                {p.title && <p className="text-sm font-bold text-slate-800 mb-1">{p.title}</p>}
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{p.content}</p>
                {p.image_url && (
                  <img src={p.image_url} alt="" className="mt-2 rounded-lg max-h-48 w-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                )}

                {/* Reactions */}
                <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-slate-100">
                  {EMOJIS.map((emoji) => {
                    const r = p.reactions?.find((x) => x.emoji === emoji);
                    const count = r?.count ?? 0;
                    const reacted = r?.reacted ?? false;
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReact(p.id, emoji)}
                        disabled={!user}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border ${
                          reacted
                            ? "bg-indigo-100 border-indigo-200 text-indigo-700"
                            : count > 0
                            ? "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                            : "border-transparent text-slate-400 hover:border-slate-200 hover:text-slate-600"
                        } ${!user ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <span>{emoji}</span>
                        {count > 0 && <span className="font-semibold">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {hasMore && (
          <button onClick={() => { const next = page + 1; setPage(next); load(next, true); }}
            className="w-full py-2 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Load more
          </button>
        )}
      </div>

      {/* Create/Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">{modal === "edit" ? "Edit Post" : "Share Family News"}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
                <select name="post_type" value={form.post_type} onChange={handleChange} className={inputCls}>
                  <option value="update">📝 Update</option>
                  <option value="achievement">🏆 Achievement</option>
                  <option value="milestone">🎯 Milestone</option>
                  <option value="memorial">🕊️ In Memory</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Title (optional)</label>
                <input name="title" value={form.title} onChange={handleChange} className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Content *</label>
                <textarea name="content" value={form.content} onChange={handleChange} required rows={4} placeholder="Share what's happening…" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Image className="w-3 h-3" /> Image URL (optional)
                </label>
                <input name="image_url" value={form.image_url} onChange={handleChange} type="url" placeholder="https://" className={inputCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {submitting ? "Posting…" : modal === "edit" ? "Save" : "Post"}
                </button>
                <button type="button" onClick={() => setModal(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyPostsWidget;
