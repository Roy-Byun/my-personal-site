import React, { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Info, Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthContext";
import InfoTooltip from "./InfoTooltip";

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const PriorityIcon = ({ p }) =>
  p === "important"
    ? <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
    : <Info className="w-4 h-4 text-indigo-400 shrink-0" />;

const timeStr = (iso) => {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const EMPTY = { title: "", body: "", link: "", priority: "normal", expires_at: "" };

const AnnouncementsWidget = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);   // null | "create" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    try {
      const res = await fetch("/api/announcements");
      if (res.ok) setItems(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSubmitting(true);
    const body = { ...form, body: form.body || null, link: form.link || null, expires_at: form.expires_at || null };
    const url = modal === "edit" ? `/api/announcements/${editTarget.id}` : "/api/announcements";
    const res = await fetch(url, { method: modal === "edit" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    if (res.ok) { await load(); setModal(null); }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    await fetch(`/api/announcements/${id}`, { method: "DELETE", credentials: "include" });
    setDeleteTarget(null); load();
  };

  const openEdit = (a) => { setEditTarget(a); setForm({ title: a.title, body: a.body ?? "", link: a.link ?? "", priority: a.priority, expires_at: a.expires_at ? a.expires_at.slice(0, 16) : "" }); setModal("edit"); };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-indigo-500" />
          <h3 className="font-bold text-slate-800 flex items-center">
            Announcements
            <InfoTooltip text="관리자가 게시하는 공지사항입니다. 중요 소식이나 일정을 확인하세요. (Admin announcements — important notices and updates for the family)" />
          </h3>
        </div>
        {isAdmin && (
          <button onClick={() => { setForm(EMPTY); setModal("create"); }} className="text-slate-400 hover:text-indigo-600 p-1 rounded transition-colors" title="Add announcement">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-14 bg-slate-50 rounded-xl" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No announcements.</p>
        ) : (
          items
            .sort((a, b) => (b.priority === "important" ? 1 : 0) - (a.priority === "important" ? 1 : 0))
            .map((a) => (
              <div key={a.id} className={`rounded-xl p-3 border ${a.priority === "important" ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex items-start gap-2">
                  <PriorityIcon p={a.priority} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">{a.title}</p>
                    {a.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.body}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">{timeStr(a.created_at)}</span>
                      {a.link && (
                        <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-600 flex items-center gap-0.5 hover:underline">
                          Read more <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-0.5 shrink-0">
                      {deleteTarget === a.id ? (
                        <>
                          <button onClick={() => handleDelete(a.id)} className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded font-bold">✓</button>
                          <button onClick={() => setDeleteTarget(null)} className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded border">✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEdit(a)} className="p-1 text-slate-400 hover:text-indigo-600 rounded"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => setDeleteTarget(a.id)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">{modal === "edit" ? "Edit Announcement" : "New Announcement"}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Title *</label>
                <input name="title" value={form.title} onChange={handleChange} required className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Body</label>
                <textarea name="body" value={form.body} onChange={handleChange} rows={3} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Priority</label>
                  <select name="priority" value={form.priority} onChange={handleChange} className={inputCls}>
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Expires (optional)</label>
                  <input type="datetime-local" name="expires_at" value={form.expires_at} onChange={handleChange} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Link (optional)</label>
                <input name="link" value={form.link} onChange={handleChange} type="url" placeholder="https://" className={inputCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                  {submitting ? "Saving…" : modal === "edit" ? "Save" : "Post"}
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

export default AnnouncementsWidget;
