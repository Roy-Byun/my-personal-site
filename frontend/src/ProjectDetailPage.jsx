import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Github, RefreshCw, Star } from "lucide-react";
import { useAuth } from "./AuthContext";
import { TYPE_META } from "./ProjectsPage";
import KanbanBoard from "./KanbanBoard";

const ProjectDetailPage = ({ projectId, onBack }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Project not found");
      setProject(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sync-github`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Sync failed");
      await fetchProject();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error || "Project not found"}</p>
      </div>
    );
  }

  const meta = TYPE_META[project.project_type] || TYPE_META.other;
  const Icon = meta.icon;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Projects
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>
              <Icon className="w-3 h-3" /> {meta.label}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{project.status}</span>
          </div>
          <div className="flex gap-1">
            {project.project_type === "github" && isAdmin && (
              <button onClick={handleSync} disabled={syncing}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50" title="Sync GitHub data">
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              </button>
            )}
            {project.github_url && (
              <a href={project.github_url} target="_blank" rel="noopener noreferrer"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                <Github className="w-4 h-4" />
              </a>
            )}
            {project.external_url && (
              <a href={project.external_url} target="_blank" rel="noopener noreferrer"
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-3">{project.title}</h1>

        {project.description && <p className="text-slate-600 leading-relaxed mb-4">{project.description}</p>}

        {project.project_type === "github" && (
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1">
            {project.github_description && <p>{project.github_description}</p>}
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {project.github_language && <span>{project.github_language}</span>}
              {project.github_stars != null && (
                <span className="flex items-center gap-0.5"><Star className="w-3 h-3" /> {project.github_stars}</span>
              )}
              {project.github_last_commit_at && (
                <span>Last commit {new Date(project.github_last_commit_at + "Z").toLocaleDateString()}</span>
              )}
              {project.github_synced_at && (
                <span>Synced {new Date(project.github_synced_at + "Z").toLocaleString()}</span>
              )}
            </div>
            {isAdmin && project.github_sync_error && (
              <p className="text-red-500 text-xs bg-red-50 rounded px-2 py-1 mt-2">Sync issue: {project.github_sync_error}</p>
            )}
          </div>
        )}

        {project.tags && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {project.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
              <span key={t} className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{t}</span>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="mt-8">
          <KanbanBoard projectId={project.id} />
        </div>
      )}
    </div>
  );
};

export default ProjectDetailPage;
