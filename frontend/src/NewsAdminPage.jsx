import React, { useCallback, useEffect, useState } from "react";
import {
  Archive, BookMarked, ExternalLink, Pencil, Plus,
  RefreshCw, Rss, Trash2, X, Zap,
} from "lucide-react";
import { timeAgo } from "./NewsCard";

const CATEGORIES = [
  "All", "Politics", "Finance", "Technology", "Science",
  "Health", "Sports", "Entertainment", "Social", "General",
];

const SOURCE_TYPES = [
  { value: "newsapi", label: "NewsAPI.org", needsKey: true },
  { value: "gnews",   label: "GNews.io",   needsKey: true },
  { value: "rss",     label: "RSS Feed",   needsKey: false },
];

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const btnPrimary = "bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition-colors disabled:opacity-50";
const btnGhost = "px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors";

// ── shared helpers ─────────────────────────────────────────────────────────

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h3 className="font-bold text-slate-800">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="px-6 py-5 overflow-y-auto">{children}</div>
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</label>
    {children}
  </div>
);

const EmptyState = ({ message, sub }) => (
  <div className="py-16 text-center text-slate-400">
    <p className="font-semibold">{message}</p>
    {sub && <p className="text-sm mt-1">{sub}</p>}
  </div>
);

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Sources tab ────────────────────────────────────────────────────────────

const EMPTY_SOURCE = { name: "", source_type: "rss", api_key: "", rss_url: "", query: "", country: "us", language: "en", category_override: "", enabled: true };

const SourcesTab = () => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // "create" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_SOURCE);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fetching, setFetching] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/news/sources", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sources");
      setSources(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_SOURCE); setFormError(""); setModal("create"); };
  const openEdit = (s) => {
    setEditTarget(s);
    setForm({ ...EMPTY_SOURCE, name: s.name, source_type: s.source_type, rss_url: s.rss_url ?? "", query: s.query ?? "", country: s.country ?? "us", language: s.language ?? "en", category_override: s.category_override ?? "", enabled: s.enabled });
    setFormError(""); setModal("edit");
  };
  const closeModal = () => { setModal(null); setEditTarget(null); setFormError(""); };
  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormError(""); setSubmitting(true);
    const body = { name: form.name, source_type: form.source_type, enabled: form.enabled, category_override: form.category_override || null };
    if (form.source_type === "rss") body.rss_url = form.rss_url;
    else { if (form.api_key) body.api_key = form.api_key; body.query = form.query || null; body.country = form.country; body.language = form.language; }
    try {
      const url = modal === "edit" ? `/api/news/sources/${editTarget.id}` : "/api/news/sources";
      const res = await fetch(url, { method: modal === "edit" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Failed"); }
      await load(); closeModal();
    } catch (e) { setFormError(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    const res = await fetch(`/api/news/sources/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) setError("Failed to delete source");
    else { setDeleteTarget(null); await load(); }
  };

  const triggerFetch = async () => {
    setFetching(true);
    try {
      await fetch("/api/news/fetch", { method: "POST", credentials: "include" });
      await load();
    } finally { setFetching(false); }
  };

  const typeLabel = (t) => SOURCE_TYPES.find((x) => x.value === t)?.label ?? t;

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">{sources.length} source{sources.length !== 1 ? "s" : ""} configured</p>
        <div className="flex gap-2">
          <button onClick={triggerFetch} disabled={fetching} className={btnPrimary}>
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} /> Fetch All Now
          </button>
          <button onClick={openCreate} className={btnPrimary}>
            <Plus className="w-4 h-4" /> Add Source
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b text-left">
              {["Name", "Type", "Query / URL", "Category Override", "Enabled", "Last Fetched", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sources.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-800">{s.name}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    {s.source_type === "rss" ? <Rss className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                    {typeLabel(s.source_type)}
                    {s.has_api_key && <span className="ml-1 text-emerald-600 text-[10px]">●key</span>}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate">
                  {s.source_type === "rss" ? s.rss_url : (s.query || <span className="italic">top headlines</span>)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{s.category_override || <span className="text-slate-300">auto</span>}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {s.enabled ? "on" : "off"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {s.last_fetched_at ? timeAgo(s.last_fetched_at) : <span className="text-slate-300">never</span>}
                </td>
                <td className="px-4 py-3">
                  {deleteTarget === s.id ? (
                    <span className="flex items-center gap-1">
                      <button onClick={() => handleDelete(s.id)} className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded font-bold">Yes</button>
                      <button onClick={() => setDeleteTarget(null)} className="text-xs text-slate-500 px-2 py-1 rounded border">No</button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget(s.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr><td colSpan={7}><EmptyState message="No sources yet" sub="Add a NewsAPI, GNews, or RSS source to start fetching." /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(modal === "create" || modal === "edit") && (
        <Modal title={modal === "edit" ? `Edit — ${editTarget.name}` : "Add Source"} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Source Name *">
              <input name="name" value={form.name} onChange={handleChange} required className={inputCls} />
            </Field>
            <Field label="Type *">
              <select name="source_type" value={form.source_type} onChange={handleChange} className={inputCls}>
                {SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>

            {form.source_type === "rss" ? (
              <Field label="RSS Feed URL *">
                <input name="rss_url" value={form.rss_url} onChange={handleChange} required placeholder="https://feeds.example.com/rss" className={inputCls} />
              </Field>
            ) : (
              <>
                <Field label={modal === "edit" ? "API Key (leave blank to keep existing)" : "API Key *"}>
                  <input name="api_key" value={form.api_key} onChange={handleChange} required={modal !== "edit"} type="password" autoComplete="off" className={inputCls} />
                </Field>
                <Field label="Search Query (blank = top headlines)">
                  <input name="query" value={form.query} onChange={handleChange} placeholder="e.g. Korea technology" className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Country">
                    <input name="country" value={form.country} onChange={handleChange} placeholder="us" className={inputCls} />
                  </Field>
                  <Field label="Language">
                    <input name="language" value={form.language} onChange={handleChange} placeholder="en" className={inputCls} />
                  </Field>
                </div>
              </>
            )}

            <Field label="Category Override (blank = auto-detect)">
              <select name="category_override" value={form.category_override} onChange={handleChange} className={inputCls}>
                <option value="">Auto-detect</option>
                {CATEGORIES.filter((c) => c !== "All").map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="enabled" checked={form.enabled} onChange={handleChange} className="accent-indigo-600 w-4 h-4" />
              Enabled (include in scheduled fetch)
            </label>

            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={submitting} className={`flex-1 justify-center ${btnPrimary}`}>
                <Plus className="w-4 h-4" />{submitting ? "Saving…" : modal === "edit" ? "Save Changes" : "Add Source"}
              </button>
              <button type="button" onClick={closeModal} className={btnGhost}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

// ── Articles tab ───────────────────────────────────────────────────────────

const EMPTY_ARTICLE = { title: "", url: "", source_name: "", category: "General", summary: "", image_url: "", author: "", published_at: "" };

const ArticlesTab = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveNote, setArchiveNote] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_ARTICLE);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fetching, setFetching] = useState(false);

  const load = useCallback(async (cat, pg, append = false) => {
    if (!append) setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg });
      if (cat !== "All") params.set("category", cat);
      const res = await fetch(`/api/news?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load articles");
      const data = await res.json();
      setArticles((prev) => append ? [...prev, ...data.articles] : data.articles);
      setHasMore(data.has_more);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setPage(1); load(catFilter, 1, false); }, [catFilter, load]);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault(); setFormError(""); setSubmitting(true);
    try {
      const body = { ...form, summary: form.summary || null, image_url: form.image_url || null, author: form.author || null, source_name: form.source_name || null, published_at: form.published_at || null };
      const res = await fetch("/api/news", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? "Failed"); }
      setModal(false); setForm(EMPTY_ARTICLE); load(catFilter, 1, false);
    } catch (e) { setFormError(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    const res = await fetch(`/api/news/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { setDeleteTarget(null); load(catFilter, 1, false); }
    else setError("Failed to delete");
  };

  const handleArchive = async () => {
    const res = await fetch(`/api/news/${archiveTarget}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ note: archiveNote || null }) });
    if (res.ok) { setArchiveTarget(null); setArchiveNote(""); load(catFilter, 1, false); }
    else setError("Failed to archive");
  };

  const triggerFetch = async () => {
    setFetching(true);
    try { await fetch("/api/news/fetch", { method: "POST", credentials: "include" }); load(catFilter, 1, false); }
    finally { setFetching(false); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={triggerFetch} disabled={fetching} className={btnPrimary}>
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} /> Fetch Now
          </button>
          <button onClick={() => { setForm(EMPTY_ARTICLE); setFormError(""); setModal(true); }} className={btnPrimary}>
            <Plus className="w-4 h-4" /> Create Article
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {loading ? <Spinner /> : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-left">
                  {["", "Title", "Source", "Category", "Published", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {articles.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 w-10">
                      {a.image_url
                        ? <img src={a.image_url} alt="" className="w-8 h-8 rounded object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        : <div className="w-8 h-8 rounded bg-slate-100" />}
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-800 hover:text-indigo-700 line-clamp-2 flex items-start gap-1">
                        {a.title}
                        <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-40" />
                      </a>
                      {a.is_manual && <span className="text-[10px] text-indigo-600 font-bold">manual</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.source_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.category}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(a.published_at || a.fetched_at)}</td>
                    <td className="px-4 py-3">
                      {deleteTarget === a.id ? (
                        <span className="flex gap-1">
                          <button onClick={() => handleDelete(a.id)} className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded font-bold">Yes</button>
                          <button onClick={() => setDeleteTarget(null)} className="text-xs border px-2 py-1 rounded">No</button>
                        </span>
                      ) : (
                        <span className="flex gap-1">
                          <button onClick={() => setArchiveTarget(a.id)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded" title="Archive"><Archive className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteTarget(a.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {articles.length === 0 && (
                  <tr><td colSpan={6}><EmptyState message="No articles" sub="Fetch from sources or create one manually." /></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <button onClick={() => { const next = page + 1; setPage(next); load(catFilter, next, true); }} className={btnGhost}>Load more</button>
            </div>
          )}
        </>
      )}

      {/* Archive note modal */}
      {archiveTarget && (
        <Modal title="Archive Article" onClose={() => { setArchiveTarget(null); setArchiveNote(""); }}>
          <div className="space-y-4">
            <Field label="Note (optional)">
              <input value={archiveNote} onChange={(e) => setArchiveNote(e.target.value)} placeholder="Why archiving…" className={inputCls} />
            </Field>
            <div className="flex gap-3">
              <button onClick={handleArchive} className={`flex-1 justify-center ${btnPrimary}`}><Archive className="w-4 h-4" /> Archive</button>
              <button onClick={() => { setArchiveTarget(null); setArchiveNote(""); }} className={btnGhost}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create article modal */}
      {modal && (
        <Modal title="Create Article" onClose={() => setModal(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <Field label="Title *"><input name="title" value={form.title} onChange={handleChange} required className={inputCls} /></Field>
            <Field label="URL *"><input name="url" value={form.url} onChange={handleChange} required type="url" placeholder="https://" className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source Name"><input name="source_name" value={form.source_name} onChange={handleChange} className={inputCls} /></Field>
              <Field label="Author"><input name="author" value={form.author} onChange={handleChange} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select name="category" value={form.category} onChange={handleChange} className={inputCls}>
                  {CATEGORIES.filter((c) => c !== "All").map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Published At">
                <input name="published_at" value={form.published_at} onChange={handleChange} type="datetime-local" className={inputCls} />
              </Field>
            </div>
            <Field label="Summary"><textarea name="summary" value={form.summary} onChange={handleChange} rows={2} className={inputCls} /></Field>
            <Field label="Image URL"><input name="image_url" value={form.image_url} onChange={handleChange} type="url" placeholder="https://" className={inputCls} /></Field>
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={submitting} className={`flex-1 justify-center ${btnPrimary}`}><Plus className="w-4 h-4" />{submitting ? "Creating…" : "Create"}</button>
              <button type="button" onClick={() => setModal(false)} className={btnGhost}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

// ── Archive tab ────────────────────────────────────────────────────────────

const ArchiveTab = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async (cat, pg, append = false) => {
    if (!append) setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg });
      if (cat !== "All") params.set("category", cat);
      const res = await fetch(`/api/news/archive?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load archive");
      const data = await res.json();
      setArticles((prev) => append ? [...prev, ...data.articles] : data.articles);
      setHasMore(data.has_more);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setPage(1); load(catFilter, 1, false); }, [catFilter, load]);

  const handleDelete = async (id) => {
    const res = await fetch(`/api/news/archive/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { setDeleteTarget(null); load(catFilter, 1, false); }
    else setError("Failed to delete");
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {loading ? <Spinner /> : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-left">
                  {["#", "Title", "Source", "Category", "Published", "Archived", "Note", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {articles.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">{a.category[0]}{a.archive_index}</td>
                    <td className="px-4 py-3 max-w-[240px]">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-800 hover:text-indigo-700 line-clamp-2 flex items-start gap-1">
                        {a.title}<ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-40" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.source_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.category}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{a.published_at ? timeAgo(a.published_at) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(a.archived_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 italic">{a.archive_note || "—"}</td>
                    <td className="px-4 py-3">
                      {deleteTarget === a.id ? (
                        <span className="flex gap-1">
                          <button onClick={() => handleDelete(a.id)} className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded font-bold">Yes</button>
                          <button onClick={() => setDeleteTarget(null)} className="text-xs border px-2 py-1 rounded">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setDeleteTarget(a.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded" title="Delete permanently">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {articles.length === 0 && (
                  <tr><td colSpan={8}><EmptyState message="No archived articles" sub="Archive articles from the Articles tab to keep them long-term." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="mt-4 text-center">
              <button onClick={() => { const next = page + 1; setPage(next); load(catFilter, next, true); }} className={btnGhost}>Load more</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────

const TABS = [
  { key: "sources",  label: "Sources",  Icon: Rss },
  { key: "articles", label: "Articles", Icon: Zap },
  { key: "archive",  label: "Archive",  Icon: BookMarked },
];

const NewsAdminPage = () => {
  const [tab, setTab] = useState("sources");

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">News Management</h2>
        <p className="text-sm text-slate-400 mt-1">Manage sources, articles, and archive</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "sources"  && <SourcesTab />}
      {tab === "articles" && <ArticlesTab />}
      {tab === "archive"  && <ArchiveTab />}
    </div>
  );
};

export default NewsAdminPage;
