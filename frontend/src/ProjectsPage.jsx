import React from "react";
import { Code2, ExternalLink, Github } from "lucide-react";

const PROJECTS = [
  {
    title: "HeptaHog Hub",
    desc: "This family website — React + FastAPI + PostgreSQL, self-hosted on a Roika Mini PC via Tailscale Funnel.",
    tags: ["React", "FastAPI", "PostgreSQL", "Docker"],
    url: null,
    repo: null,
  },
];

const ProjectCard = ({ p }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-3 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between gap-2">
      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
        <Code2 className="w-5 h-5 text-indigo-500" />
      </div>
      <div className="flex gap-1">
        {p.repo && (
          <a href={p.repo} target="_blank" rel="noopener noreferrer"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
            <Github className="w-4 h-4" />
          </a>
        )}
        {p.url && (
          <a href={p.url} target="_blank" rel="noopener noreferrer"
            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-50 transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
    <div>
      <h3 className="font-bold text-slate-800">{p.title}</h3>
      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{p.desc}</p>
    </div>
    <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
      {p.tags.map((t) => (
        <span key={t} className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{t}</span>
      ))}
    </div>
  </div>
);

const ProjectsPage = () => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
    <div className="flex items-center gap-3 mb-6">
      <Code2 className="w-5 h-5 text-indigo-500" />
      <h2 className="text-xl font-bold text-slate-800">Projects</h2>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {PROJECTS.map((p) => <ProjectCard key={p.title} p={p} />)}
    </div>
  </div>
);

export default ProjectsPage;
