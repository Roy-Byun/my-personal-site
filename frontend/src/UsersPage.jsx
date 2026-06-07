import React, { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Shield, Trash2, User, UserPlus, X } from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────

const RoleBadge = ({ role }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
      role === "admin"
        ? "bg-indigo-100 text-indigo-700"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    {role === "admin" ? (
      <Shield className="w-3 h-3" />
    ) : (
      <User className="w-3 h-3" />
    )}
    {role}
  </span>
);

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h3 className="font-bold text-slate-800">{title}</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="px-6 py-5 overflow-y-auto">{children}</div>
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
      {label}
    </label>
    {children}
  </div>
);

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const EMPTY_FORM = {
  username: "",
  password: "",
  full_name: "",
  email: "",
  role: "user",
  birthday: "",
};

// ── main component ─────────────────────────────────────────────────────────

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [modal, setModal] = useState(null); // "create" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── data fetching ──────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      setUsers(await res.json());
    } catch (e) {
      setPageError(e.message);
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── modal helpers ──────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setModal("create");
  };

  const openEdit = (u) => {
    setEditTarget(u);
    setForm({
      username: u.username,
      password: "",
      full_name: u.full_name ?? "",
      email: u.email ?? "",
      role: u.role,
      birthday: u.birthday ?? "",
    });
    setFormError("");
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditTarget(null);
    setFormError("");
  };

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // ── CRUD ───────────────────────────────────────────────────────────────

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          full_name: form.full_name || null,
          email: form.email || null,
          role: form.role,
          birthday: form.birthday || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to create user");
      }
      await fetchUsers();
      closeModal();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const body = {
        full_name: form.full_name || null,
        email: form.email || null,
        role: form.role,
        birthday: form.birthday || null,
      };
      if (form.password) body.password = form.password;

      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to update user");
      }
      await fetchUsers();
      closeModal();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userId) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to delete user");
      }
      setDeleteTarget(null);
      await fetchUsers();
    } catch (e) {
      setPageError(e.message);
    }
  };

  // ── shared form body ───────────────────────────────────────────────────

  const formBody = (isCreate) => (
    <div className="space-y-4">
      {isCreate && (
        <Field label="Username *">
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            required
            autoComplete="off"
            className={inputCls}
          />
        </Field>
      )}

      <Field label={isCreate ? "Password *" : "New Password (blank = no change)"}>
        <input
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          required={isCreate}
          autoComplete="new-password"
          className={inputCls}
        />
      </Field>

      <Field label="Full Name">
        <input
          name="full_name"
          value={form.full_name}
          onChange={handleChange}
          className={inputCls}
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          className={inputCls}
        />
      </Field>

      <Field label="Birthday">
        <input
          type="date"
          name="birthday"
          value={form.birthday}
          onChange={handleChange}
          className={inputCls}
        />
      </Field>

      <Field label="Role">
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          className={inputCls}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </Field>

      {formError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {submitting
            ? isCreate
              ? "Creating…"
              : "Saving…"
            : isCreate
            ? "Create User"
            : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={closeModal}
          className="px-4 py-2 text-sm text-slate-500 border rounded-lg hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // ── render ─────────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
          <p className="text-sm text-slate-400 mt-1">
            {users.length} member{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> New User
        </button>
      </div>

      {pageError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {pageError}
        </p>
      )}

      {/* User table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Name
              </th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Username
              </th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">
                Email
              </th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:table-cell">
                Birthday
              </th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Role
              </th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">
                Joined
              </th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-semibold text-slate-800">
                  {u.full_name || (
                    <span className="text-slate-300 italic text-xs">—</span>
                  )}
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-500">
                  {u.username}
                </td>
                <td className="px-6 py-4 text-slate-500 hidden md:table-cell">
                  {u.email || (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs hidden sm:table-cell">
                  {u.birthday || (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-6 py-4 text-xs text-slate-400 hidden lg:table-cell">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  {deleteTarget === u.id ? (
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-red-600 font-medium">
                        Delete?
                      </span>
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded font-bold transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeleteTarget(null)}
                        className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded border transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 rounded hover:bg-indigo-50"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-16 text-center text-slate-400 text-sm"
                >
                  No users yet — create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {modal === "create" && (
        <Modal title="New User" onClose={closeModal}>
          <form onSubmit={handleCreate}>{formBody(true)}</form>
        </Modal>
      )}

      {/* Edit modal */}
      {modal === "edit" && editTarget && (
        <Modal title={`Edit — ${editTarget.username}`} onClose={closeModal}>
          <form onSubmit={handleUpdate}>{formBody(false)}</form>
        </Modal>
      )}
    </div>
  );
};

export default UsersPage;
