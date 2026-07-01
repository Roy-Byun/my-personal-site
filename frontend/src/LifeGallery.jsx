import React, { useCallback, useEffect, useState } from "react";
import { Images, Plus, Trash2, X } from "lucide-react";
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

const AddPhotoModal = ({ onClose, onSaved }) => {
  const [form, setForm] = useState({ photo_url: "", caption: "", taken_date: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/about/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          photo_url: form.photo_url,
          caption: form.caption || null,
          taken_date: form.taken_date || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Failed to add photo");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Add Photo" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Photo URL *</label>
          <input name="photo_url" value={form.photo_url} onChange={handleChange} required placeholder="https://..." className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Caption</label>
          <input name="caption" value={form.caption} onChange={handleChange} className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date Taken (approx.)</label>
          <input type="date" name="taken_date" value={form.taken_date} onChange={handleChange} className={inputCls} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {submitting ? "Saving…" : "Add Photo"}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const LifeGallery = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch("/api/about/gallery");
      if (!res.ok) throw new Error("Failed to load gallery");
      setPhotos(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const handleDelete = async (id) => {
    await fetch(`/api/about/gallery/${id}`, { method: "DELETE", credentials: "include" });
    setLightbox(null);
    await fetchPhotos();
  };

  if (loading) return null;
  if (photos.length === 0 && !isAdmin) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Images className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-widest">Life Gallery</h3>
        </div>
        {isAdmin && (
          <button onClick={() => setAddOpen(true)} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-slate-400">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setLightbox(p)} className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100">
              <img src={p.photo_url} alt={p.caption || ""} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              {p.caption && (
                <span className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate">{p.caption}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {addOpen && <AddPhotoModal onClose={() => setAddOpen(false)} onSaved={fetchPhotos} />}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.photo_url} alt={lightbox.caption || ""} className="max-w-full max-h-[75vh] rounded-lg object-contain" />
            <div className="flex items-center justify-between mt-3">
              <div className="text-white text-sm">
                {lightbox.caption} {lightbox.taken_date && <span className="text-white/60 ml-2">{lightbox.taken_date}</span>}
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <button onClick={() => handleDelete(lightbox.id)} className="text-white/70 hover:text-red-400 p-1.5"><Trash2 className="w-5 h-5" /></button>
                )}
                <button onClick={() => setLightbox(null)} className="text-white/70 hover:text-white p-1.5"><X className="w-5 h-5" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LifeGallery;
