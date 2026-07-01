import React, { useCallback, useEffect, useState } from "react";
import { Briefcase, GraduationCap, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthContext";

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h3 className="font-bold text-slate-800">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-6 py-5 overflow-y-auto">{children}</div>
    </div>
  </div>
);

const EMPTY_FORM = { entry_type: "work", title: "", organization: "", location: "", start_date: "", end_date: "", description: "" };

const ExperienceFormModal = ({ initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial
      ? {
          entry_type: initial.entry_type, title: initial.title, organization: initial.organization,
          location: initial.location ?? "", start_date: initial.start_date ?? "", end_date: initial.end_date ?? "",
          description: initial.description ?? "",
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    const payload = {
      ...form,
      location: form.location || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      description: form.description || null,
    };
    try {
      const res = await fetch(isEdit ? `/api/about/experience/${initial.id}` : "/api/about/experience", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Failed to save entry");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? "Edit Experience" : "New Experience Entry"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
            <select name="entry_type" value={form.entry_type} onChange={handleChange} className={inputCls}>
              <option value="work">Work</option>
              <option value="education">Education</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Location</label>
            <input name="location" value={form.location} onChange={handleChange} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Title / Role *</label>
          <input name="title" value={form.title} onChange={handleChange} required className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Organization *</label>
          <input name="organization" value={form.organization} onChange={handleChange} required className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Start Date</label>
            <input type="date" name="start_date" value={form.start_date} onChange={handleChange} className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">End Date (blank = present)</label>
            <input type="date" name="end_date" value={form.end_date} onChange={handleChange} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} className={inputCls} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Entry"}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const ExperienceTimeline = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/about/experience");
      if (!res.ok) throw new Error("Failed to load experience");
      setEntries(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleDelete = async (id) => {
    await fetch(`/api/about/experience/${id}`, { method: "DELETE", credentials: "include" });
    setDeleteTarget(null);
    await fetchEntries();
  };

  if (loading) return null;
  if (entries.length === 0 && !isAdmin) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Experience</h3>
        {isAdmin && (
          <button onClick={() => { setEditTarget(null); setModal("create"); }}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">No experience entries yet.</p>
      ) : (
        <div className="space-y-6">
          {entries.map((entry) => {
            const Icon = entry.entry_type === "education" ? GraduationCap : Briefcase;
            return (
              <div key={entry.id} className="flex gap-4 group">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0 pb-1 border-b border-slate-100 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{entry.title}</p>
                      <p className="text-sm text-slate-500">
                        {entry.organization}{entry.location ? ` · ${entry.location}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {entry.start_date || "—"} – {entry.end_date || "Present"}
                      </span>
                      {isAdmin && (
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditTarget(entry); setModal("edit"); }} className="p-1 text-slate-400 hover:text-indigo-600 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteTarget(entry)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                  {entry.description && <p className="text-sm text-slate-600 mt-1 leading-relaxed">{entry.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ExperienceFormModal initial={modal === "edit" ? editTarget : null} onClose={() => setModal(null)} onSaved={fetchEntries} />
      )}

      {deleteTarget && (
        <Modal title={`Delete — ${deleteTarget.title}`} onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600 mb-4">This will permanently delete this experience entry.</p>
          <div className="flex gap-3">
            <button onClick={() => handleDelete(deleteTarget.id)}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">Delete</button>
            <button onClick={() => setDeleteTarget(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ExperienceTimeline;
