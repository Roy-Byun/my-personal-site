import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ListChecks } from "lucide-react";

const STATUS_LABEL = { todo: "To Do", in_progress: "In Progress", done: "Done" };
const STATUS_COLOR = {
  todo: "bg-slate-100 text-slate-600",
  in_progress: "bg-indigo-100 text-indigo-700",
  done: "bg-emerald-100 text-emerald-700",
};
const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-500",
  normal: "bg-indigo-100 text-indigo-600",
  high: "bg-red-100 text-red-600",
};

const selectCls = "border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const TaskTrackingPage = ({ onBack }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    try {
      const res = await fetch(`/api/tasks?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tasks");
      setTasks(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const changeStatus = async (task, newStatus) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      await fetchTasks();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Projects
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ListChecks className="w-5 h-5 text-indigo-500" />
          <h2 className="text-xl font-bold text-slate-800">Task Tracking</h2>
        </div>
        <div className="flex gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="">All statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={selectCls}>
            <option value="">All priorities</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Task</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:table-cell">Priority</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-16 text-center text-slate-400 text-sm">Loading…</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-16 text-center text-slate-400 text-sm">No tasks match these filters.</td></tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500">{t.project_title || `Project #${t.project_id}`}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{t.title}</td>
                  <td className="px-4 py-3">
                    <select value={t.status} onChange={(e) => changeStatus(t, e.target.value)}
                      className={`text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-1 border-0 cursor-pointer ${STATUS_COLOR[t.status]}`}>
                      {Object.entries(STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.normal}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                    {t.due_date || <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TaskTrackingPage;
