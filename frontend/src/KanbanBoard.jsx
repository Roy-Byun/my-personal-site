import React, { useCallback, useEffect, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";

const COLUMNS = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-500",
  normal: "bg-indigo-100 text-indigo-600",
  high: "bg-red-100 text-red-600",
};

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h3 className="font-bold text-slate-800">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-6 py-5 overflow-y-auto">{children}</div>
    </div>
  </div>
);

const EMPTY_TASK_FORM = { title: "", description: "", status: "todo", priority: "normal", due_date: "" };

const TaskFormModal = ({ projectId, initial, onClose, onSaved }) => {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial
      ? { title: initial.title, description: initial.description ?? "", status: initial.status, priority: initial.priority, due_date: initial.due_date ?? "" }
      : EMPTY_TASK_FORM
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    const payload = { ...form, description: form.description || null, due_date: form.due_date || null };
    try {
      const res = await fetch(
        isEdit ? `/api/tasks/${initial.id}` : "/api/tasks",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(isEdit ? payload : { ...payload, project_id: projectId }),
        }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Failed to save task");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? "Edit Task" : "New Task"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Title *</label>
          <input name="title" value={form.title} onChange={handleChange} required className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</label>
            <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
              {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Priority</label>
            <select name="priority" value={form.priority} onChange={handleChange} className={inputCls}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Due Date</label>
          <input type="date" name="due_date" value={form.due_date} onChange={handleChange} className={inputCls} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Task"}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
        </div>
      </form>
    </Modal>
  );
};

const TaskCard = ({ task, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style}
      className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-2 group">
      <div className="flex items-start justify-between gap-2">
        <button type="button" {...attributes} {...listeners}
          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 mt-0.5">
          <GripVertical className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-slate-800 flex-1">{task.title}</p>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(task)} className="p-1 text-slate-400 hover:text-indigo-600 rounded"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(task)} className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {task.description && <p className="text-xs text-slate-500 line-clamp-2">{task.description}</p>}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.normal}`}>
          {task.priority}
        </span>
        {task.due_date && (
          <span className="text-[11px] text-slate-400 flex items-center gap-0.5"><Calendar className="w-3 h-3" /> {task.due_date}</span>
        )}
      </div>
    </div>
  );
};

const Column = ({ column, tasks, onEdit, onDelete }) => {
  const { setNodeRef } = useDroppable({ id: column.key });
  return (
    <div className="flex-1 min-w-[240px] bg-slate-50 rounded-2xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 mb-1">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{column.label}</h4>
        <span className="text-[10px] font-bold text-slate-400 bg-white rounded-full px-2 py-0.5">{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className="flex flex-col gap-2 min-h-[60px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} />)}
        </SortableContext>
      </div>
    </div>
  );
};

const KanbanBoard = ({ projectId }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // "create" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeTask, setActiveTask] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?project_id=${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tasks");
      setTasks(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const byColumn = (key) => tasks.filter((t) => t.status === key).sort((a, b) => a.position - b.position);

  const findTask = (id) => tasks.find((t) => t.id === id);
  const findColumnOf = (id) => {
    if (COLUMNS.some((c) => c.key === id)) return id;
    const t = findTask(id);
    return t ? t.status : null;
  };

  const handleDragStart = (event) => setActiveTask(findTask(event.active.id));

  const handleDragEnd = async (event) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const sourceCol = findColumnOf(active.id);
    const destCol = findColumnOf(over.id);
    if (!sourceCol || !destCol) return;

    const destTasks = byColumn(destCol).filter((t) => t.id !== active.id);
    let destIndex = destTasks.findIndex((t) => t.id === over.id);
    if (destIndex === -1) destIndex = destTasks.length;

    if (sourceCol === destCol && findTask(active.id).position === destIndex) return;

    // optimistic local update so the board feels responsive before the server confirms
    setTasks((prev) => {
      const moved = prev.find((t) => t.id === active.id);
      const rest = prev.filter((t) => t.id !== active.id);
      const updated = { ...moved, status: destCol };
      const destArr = rest.filter((t) => t.status === destCol).sort((a, b) => a.position - b.position);
      destArr.splice(destIndex, 0, updated);
      const others = rest.filter((t) => t.status !== destCol);
      const reindexedDest = destArr.map((t, i) => ({ ...t, position: i }));
      return [...others, ...reindexedDest];
    });

    try {
      const res = await fetch(`/api/tasks/${active.id}/move`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ new_status: destCol, new_position: destIndex }),
      });
      if (!res.ok) throw new Error("Move failed");
      await fetchTasks();
    } catch (e) {
      setError(e.message);
      await fetchTasks();
    }
  };

  const handleDelete = async (task) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete task");
      setDeleteTarget(null);
      await fetchTasks();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800">Kanban Board</h3>
        <button onClick={() => { setEditTarget(null); setModal("create"); }}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1.5 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Task
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <Column key={col.key} column={col} tasks={byColumn(col.key)}
              onEdit={(t) => { setEditTarget(t); setModal("edit"); }}
              onDelete={(t) => setDeleteTarget(t)} />
          ))}
        </div>
        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} onEdit={() => {}} onDelete={() => {}} />}
        </DragOverlay>
      </DndContext>

      {modal && (
        <TaskFormModal projectId={projectId} initial={modal === "edit" ? editTarget : null}
          onClose={() => setModal(null)} onSaved={fetchTasks} />
      )}

      {deleteTarget && (
        <Modal title={`Delete — ${deleteTarget.title}`} onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600 mb-4">This will permanently delete the task.</p>
          <div className="flex gap-3">
            <button onClick={() => handleDelete(deleteTarget)}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">Delete Task</button>
            <button onClick={() => setDeleteTarget(null)} className="px-4 text-sm text-slate-500 border rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default KanbanBoard;
