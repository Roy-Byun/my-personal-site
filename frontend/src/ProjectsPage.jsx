import React, { useCallback, useEffect, useState } from "react";
import {
  Code2, ExternalLink, Github, GraduationCap, ListChecks,
  Notebook, Pencil, Plus, RefreshCw, Star, Trash2, X,
} from "lucide-react";
import { useAuth } from "./AuthContext";

// ── shared small UI helpers (mirrors UsersPage.jsx conventions) ────────────

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

export const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export const TYPE_META = {
  github:   { label: "GitHub",   icon: Github,        color: "bg-indigo-100 text-indigo-700" },
  study:    { label: "Study",    icon: GraduationCap, color: "bg-emerald-100 text-emerald-700" },
  planning: { label: "Planning", icon: Notebook,       color: "bg-amber-100 text-amber-700" },
  other:    { label: "Other",    icon: Code2,          color: "bg-slate-100 text-slate-600" },
};

const TypeBadge = ({ type }) => {
  const meta = TYPE_META[type] || TYPE_META.other;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </span>
  );
};

const timeAgo = (dateStr) => {
  if (!dateStr) return null;
  const diffMs = Date.now() - new Date(dateStr + "Z").getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

const EMPTY_FORM = {
  title: "", description: "", project_type: "other", status: "active",
  github_repo: "", external_url: "", tags: "", is_public: true,
};

// ── Project create/edit modal ───────────────────────────────────────────────

const ProjectFormModal = ({ initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title, description: initial.description ?? "",
          project_type: initial.project_type, status: initial.status,
          github_repo: initial.github_repo ?? "", external_url: initial.external_url ?? "",
          tags: initial.tags ?? "", is_public: initial.is_public,
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    const payload = {
      ...form,
      description: form.description || null,
      github_repo: form.github_repo || null,
      external_url: form.external_url || null,
      tags: form.tags || null,
    };
    try {
      const res = await fetch(isEdit ? `/api/projects/${initial.id}` : "/api/projects", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Failed to save project");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? `Edit — ${initial.title}` : "New Project"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Title *">
          <input name="title" value={form.title} onChange={handleChange} required className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select name="project_type" value={form.project_type} onChange={handleChange} className={inputCls}>
              {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
        {form.project_type === "github" && (
          <Field label="GitHub Repo (owner/repo)">
            <input name="github_repo" value={form.github_repo} onChange={handleChange}
              placeholder="octocat/Hello-World" className={inputCls} />
          </Field>
        )}
        <Field label="External Link">
          <input name="external_url" value={form.external_url} onChange={handleChange}
            placeholder="https://..." className={inputCls} />
        </Field>
        <Field label="Tags (comma-separated)">
          <input name="tags" value={form.tags} onChange={handleChange} placeholder="react, fastapi" className={inputCls} />
        </Field>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_public" name="is_public" checked={form.is_public}
            onChange={handleChange} className="accent-indigo-600 w-4 h-4" />
          <label htmlFor="is_public" className="text-xs text-slate-600">Visible to public visitors</label>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create Project"}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ── Project card ─────────────────────────────────────────────────────────────

const ProjectCard = ({ p, isAdmin, onSelect, onEdit, onDelete, onSync }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-3 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between gap-2">
      <TypeBadge type={p.project_type} />
      <div className="flex gap-1">
        {p.project_type === "github" && isAdmin && (
          <button onClick={(e) => { e.stopPropagation(); onSync(p); }}
            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors" title="Sync GitHub data">
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
        {p.github_url && (
          <a href={p.github_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
            <Github className="w-4 h-4" />
          </a>
        )}
        {p.external_url && (
          <a href={p.external_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        {isAdmin && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onEdit(p); }}
              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(p); }}
              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
    <button onClick={() => onSelect(p.id)} className="text-left">
      <h3 className="font-bold text-slate-800 hover:text-indigo-600 transition-colors">{p.title}</h3>
      <p className="text-sm text-slate-500 mt-1 leading-relaxed line-clamp-3">
        {p.project_type === "github" ? (p.github_description || p.description || "No description yet.") : (p.description || "No description yet.")}
      </p>
    </button>
    {p.project_type === "github" && (p.github_language || p.github_stars != null || p.github_last_commit_at) && (
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {p.github_language && <span>{p.github_language}</span>}
        {p.github_stars != null && (
          <span className="flex items-center gap-0.5"><Star className="w-3 h-3" /> {p.github_stars}</span>
        )}
        {p.github_last_commit_at && <span>Last commit {timeAgo(p.github_last_commit_at)}</span>}
      </div>
    )}
    {isAdmin && p.github_sync_error && (
      <p className="text-[11px] text-red-500 bg-red-50 rounded px-2 py-1">Sync issue: {p.github_sync_error}</p>
    )}
    {p.tags && (
      <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
        {p.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
          <span key={t} className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{t}</span>
        ))}
      </div>
    )}
    {isAdmin && !p.is_public && (
      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Draft (hidden from public)</span>
    )}
  </div>
);

// ── Page ─────────────────────────────────────────────────────────────────────

const ProjectsPage = ({ onSelectProject, onViewTaskTracking }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // "create" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load projects");
      setProjects(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Failed to delete project");
      setDeleteTarget(null);
      await fetchProjects();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSync = async (p) => {
    try {
      const res = await fetch(`/api/projects/${p.id}/sync-github`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Sync failed");
      await fetchProjects();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Code2 className="w-5 h-5 text-indigo-500" />
          <h2 className="text-xl font-bold text-slate-800">Projects</h2>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={onViewTaskTracking}
              className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2 transition-colors">
              <ListChecks className="w-4 h-4" /> Task Tracking
            </button>
            <button onClick={() => { setEditTarget(null); setModal("create"); }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition-colors">
              <Plus className="w-4 h-4" /> New Project
            </button>
          </div>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {projects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400 text-sm">
          No projects yet{isAdmin ? " — create the first one." : "."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} isAdmin={isAdmin} onSelect={onSelectProject}
              onEdit={(proj) => { setEditTarget(proj); setModal("edit"); }}
              onDelete={(proj) => setDeleteTarget(proj)}
              onSync={handleSync} />
          ))}
        </div>
      )}

      {modal && (
        <ProjectFormModal
          initial={modal === "edit" ? editTarget : null}
          onClose={() => setModal(null)}
          onSaved={fetchProjects}
        />
      )}

      {deleteTarget && (
        <Modal title={`Delete — ${deleteTarget.title}`} onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600 mb-4">
            This will permanently delete the project and all of its tasks. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button onClick={() => handleDelete(deleteTarget.id)}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">
              Delete Project
            </button>
            <button onClick={() => setDeleteTarget(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ProjectsPage;
