import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Panel,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";
import { GitFork, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "./AuthContext";

// ── constants ──────────────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 100;

const REL_META = {
  parent_of: {
    label: "Parent of",
    style: { stroke: "#6366f1", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
    edgeType: "smoothstep",
    badge: "bg-indigo-100 text-indigo-700",
  },
  spouse_of: {
    label: "Spouse of",
    style: { stroke: "#f43f5e", strokeWidth: 2, strokeDasharray: "6 3" },
    markerEnd: undefined,
    edgeType: "straight",
    badge: "bg-rose-100 text-rose-700",
  },
  sibling_of: {
    label: "Sibling of",
    style: { stroke: "#3b82f6", strokeWidth: 2, strokeDasharray: "4 4" },
    markerEnd: undefined,
    edgeType: "simplebezier",
    badge: "bg-blue-100 text-blue-700",
  },
};

const REL_EMOJI = { parent_of: "👨‍👧", spouse_of: "💑", sibling_of: "👫" };

// ── layout ─────────────────────────────────────────────────────────────────

function computeLayout(nodes, edges) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 70, ranksep: 100, marginx: 30, marginy: 30 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));

  // Only parent_of edges drive the hierarchy
  edges.forEach((e) => {
    if (e.data?.relation === "parent_of") g.setEdge(e.source, e.target);
  });

  Dagre.layout(g);

  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
    }),
    edges,
  };
}

// ── custom node ─────────────────────────────────────────────────────────────

const calcAge = (bday) => {
  if (!bday) return null;
  const today = new Date();
  const b = new Date(bday);
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
};

const initials = (name) =>
  name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const MemberNode = memo(({ data, selected }) => {
  const age = calcAge(data.birthday);
  return (
    <div
      style={{ width: NODE_W }}
      className={`bg-white rounded-2xl shadow-md border-2 p-3 flex flex-col items-center gap-1.5 transition-all
        ${selected ? "border-indigo-500 shadow-indigo-100" : "border-slate-200"}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-400 !w-2 !h-2" />

      {data.profilePic ? (
        <img src={data.profilePic} alt={data.name}
          className="w-10 h-10 rounded-full object-cover border border-slate-200" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
          {initials(data.name)}
        </div>
      )}

      <div className="text-center">
        <p className="font-bold text-slate-800 text-xs leading-tight">{data.name}</p>
        {data.westernName && data.westernName !== data.name && (
          <p className="text-[10px] text-slate-400 leading-tight">{data.westernName}</p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap justify-center">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
          data.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
        }`}>
          {data.role === "admin" ? "Admin" : "Member"}
        </span>
        {age !== null && (
          <span className="text-[9px] text-slate-400 font-medium">{age}세</span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Left}  id="left"  className="!bg-rose-400 !w-2 !h-2" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-rose-400 !w-2 !h-2" />
    </div>
  );
});

const nodeTypes = { memberNode: MemberNode };

// ── build nodes / edges from API data ──────────────────────────────────────

function buildGraph(members, relationships) {
  const nodes = members.map((m) => ({
    id: String(m.id),
    type: "memberNode",
    position: { x: 0, y: 0 },
    data: {
      name: m.name,
      westernName: m.western_name,
      role: m.role,
      birthday: m.birthday,
      profilePic: m.profile_picture_url,
    },
  }));

  const edges = relationships.map((r) => {
    const meta = REL_META[r.relation_type] ?? REL_META.parent_of;
    return {
      id: `rel-${r.id}`,
      source: String(r.from_user_id),
      target: String(r.to_user_id),
      type: meta.edgeType,
      style: meta.style,
      markerEnd: meta.markerEnd,
      label: REL_EMOJI[r.relation_type] ?? "",
      labelStyle: { fontSize: 14 },
      labelBgStyle: { fill: "transparent" },
      data: { relation: r.relation_type, relId: r.id },
    };
  });

  return computeLayout(nodes, edges);
}

// ── admin panel ─────────────────────────────────────────────────────────────

function AdminPanel({ members, relationships, onAdd, onDelete }) {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const [type, setType] = useState("parent_of");
  const [err, setErr]   = useState("");
  const [adding, setAdding] = useState(false);

  const memberName = (id) =>
    members.find((m) => m.id === Number(id))?.name ?? `#${id}`;

  async function handleAdd(e) {
    e.preventDefault();
    if (!from || !to) { setErr("Select both members"); return; }
    if (from === to)  { setErr("Cannot relate a member to themselves"); return; }
    setErr(""); setAdding(true);
    try { await onAdd({ from_user_id: Number(from), to_user_id: Number(to), relation_type: type }); }
    catch (ex) { setErr(ex.message); }
    finally { setAdding(false); }
  }

  const sel = "w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <div className="space-y-4">
      {/* Add form */}
      <form onSubmit={handleAdd} className="space-y-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Add Relationship</p>
        <select value={from} onChange={e => setFrom(e.target.value)} className={sel}>
          <option value="">From…</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className={sel}>
          <option value="parent_of">👨‍👧 is parent of</option>
          <option value="spouse_of">💑 is spouse of</option>
          <option value="sibling_of">👫 is sibling of</option>
        </select>
        <select value={to} onChange={e => setTo(e.target.value)} className={sel}>
          <option value="">To…</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <button type="submit" disabled={adding}
          className="w-full bg-indigo-600 text-white py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </form>

      {/* Existing relationships */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
          Relationships ({relationships.length})
        </p>
        {relationships.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-3">None yet</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {relationships.map(r => {
              const meta = REL_META[r.relation_type];
              return (
                <div key={r.id}
                  className="flex items-center justify-between bg-slate-50 rounded-lg px-2 py-1.5 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${meta.badge}`}>
                      {REL_EMOJI[r.relation_type]}
                    </span>
                    <span className="text-xs text-slate-700 truncate">
                      {memberName(r.from_user_id)} → {memberName(r.to_user_id)}
                    </span>
                  </div>
                  <button onClick={() => onDelete(r.id)}
                    className="text-slate-400 hover:text-red-500 shrink-0 p-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── main page ───────────────────────────────────────────────────────────────

export default function FamilyTreePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [members, setMembers]           = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [panelOpen, setPanelOpen]       = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/family/tree", { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json();
      setMembers(data.members);
      setRelationships(data.relationships);
      const { nodes: n, edges: e } = buildGraph(data.members, data.relationships);
      setNodes(n);
      setEdges(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  async function handleAdd(body) {
    const r = await fetch("/api/family/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.detail ?? "Failed to add relationship");
    }
    await fetchTree();
  }

  async function handleDelete(relId) {
    await fetch(`/api/family/relationships/${relId}`, { method: "DELETE", credentials: "include" });
    await fetchTree();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitFork className="w-5 h-5 text-indigo-500" />
          <h2 className="text-xl font-bold text-slate-800">Family Tree</h2>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {members.length} members · {relationships.length} connections
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
              panelOpen
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-700 border-slate-200 hover:border-indigo-400"
            }`}
          >
            <Plus className="w-4 h-4" /> Manage
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {/* React Flow canvas */}
        <div
          className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          style={{ height: "70vh" }}
        >
          {members.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              No family members yet.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              minZoom={0.2}
              maxZoom={2}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
            >
              <Background color="#e2e8f0" gap={20} />
              <Controls />
              <MiniMap
                nodeColor={() => "#6366f1"}
                maskColor="rgba(241,245,249,0.7)"
                style={{ borderRadius: 8 }}
              />

              {/* Legend */}
              <Panel position="top-left">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 text-xs space-y-1">
                  {Object.entries(REL_META).map(([type, meta]) => (
                    <div key={type} className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${meta.badge}`}>
                        {REL_EMOJI[type]}
                      </span>
                      <span className="text-slate-500">{meta.label}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>

        {/* Admin panel */}
        {isAdmin && panelOpen && (
          <div className="w-64 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 shrink-0 self-start">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-slate-800 text-sm">Relationships</p>
              <button onClick={() => setPanelOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <AdminPanel
              members={members}
              relationships={relationships}
              onAdd={handleAdd}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
