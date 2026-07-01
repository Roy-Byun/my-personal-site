import React, { useCallback, useEffect, useState } from "react";
import { Pencil, User, X } from "lucide-react";
import { useAuth } from "./AuthContext";
import LifeMilestoneCountdown from "./LifeMilestoneCountdown";
import ExperienceTimeline from "./ExperienceTimeline";
import LifeGallery from "./LifeGallery";

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

const ProfileEditModal = ({ profile, onClose, onSaved }) => {
  const [form, setForm] = useState({
    headline: profile.headline ?? "", bio: profile.bio ?? "", photo_url: profile.photo_url ?? "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/about/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          headline: form.headline || null, bio: form.bio || null, photo_url: form.photo_url || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Failed to save profile");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Edit About Me" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Headline</label>
          <input name="headline" value={form.headline} onChange={handleChange} placeholder="Short tagline" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Bio</label>
          <textarea name="bio" value={form.bio} onChange={handleChange} rows={5} className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Photo URL</label>
          <input name="photo_url" value={form.photo_url} onChange={handleChange} placeholder="https://..." className={inputCls} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {submitting ? "Saving…" : "Save Changes"}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const AboutMePage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/about/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      setProfile(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-start gap-5">
          {profile?.photo_url ? (
            <img src={profile.photo_url} alt="Profile" className="w-24 h-24 rounded-full object-cover border border-slate-200 shrink-0" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
              <User className="w-10 h-10 text-indigo-300" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                {profile?.headline && <p className="text-sm font-semibold text-indigo-600">{profile.headline}</p>}
                <h1 className="text-2xl font-bold text-slate-800">About Me</h1>
              </div>
              {isAdmin && (
                <button onClick={() => setEditOpen(true)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors shrink-0" title="Edit">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
            {profile?.bio ? (
              <p className="text-slate-600 leading-relaxed mt-3 whitespace-pre-line">{profile.bio}</p>
            ) : (
              <p className="text-slate-400 mt-3 text-sm">{isAdmin ? "Add a bio to introduce yourself." : ""}</p>
            )}
          </div>
        </div>
      </div>

      <LifeMilestoneCountdown />
      <ExperienceTimeline />
      <LifeGallery />

      {editOpen && profile && (
        <ProfileEditModal profile={profile} onClose={() => setEditOpen(false)} onSaved={fetchProfile} />
      )}
    </div>
  );
};

export default AboutMePage;
