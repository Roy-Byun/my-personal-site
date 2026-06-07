import React, { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Shield, Trash2, User, UserPlus, X } from "lucide-react";
import CountryCodeSelect from "./CountryCodeSelect";
import { COUNTRIES, flagEmoji } from "./countries";

// ── helpers ────────────────────────────────────────────────────────────────

const calcAge = (birthdayStr) => {
  if (!birthdayStr) return null;
  const today = new Date();
  const bday = new Date(birthdayStr);
  let age = today.getFullYear() - bday.getFullYear();
  const m = today.getMonth() - bday.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bday.getDate())) age--;
  return age;
};

const displayName = (u) =>
  (u.last_name || u.first_name)
    ? `${u.last_name ?? ""}${u.first_name ?? ""}`.trim()
    : u.western_name || u.full_name || u.username;

const initials = (u) => {
  if (u.last_name || u.first_name)
    return `${(u.last_name ?? "")[0] ?? ""}${(u.first_name ?? "")[0] ?? ""}`.toUpperCase() || "?";
  if (u.western_name)
    return u.western_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return u.username.slice(0, 2).toUpperCase();
};

const RoleBadge = ({ role }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
      role === "admin"
        ? "bg-indigo-100 text-indigo-700"
        : "bg-slate-100 text-slate-600"
    }`}
  >
    {role === "admin" ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
    {role}
  </span>
);

const Avatar = ({ u }) =>
  u.profile_picture_url ? (
    <img
      src={u.profile_picture_url}
      alt={displayName(u)}
      className="w-8 h-8 rounded-full object-cover border border-slate-200"
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold border border-indigo-200">
      {initials(u)}
    </div>
  );

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

const Field = ({ label, children, half }) => (
  <div className={half ? "" : "col-span-2"}>
    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
      {label}
    </label>
    {children}
  </div>
);

const SectionHeading = ({ children }) => (
  <h4 className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 mt-2">
    {children}
  </h4>
);

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const EMPTY_FORM = {
  // account
  username: "",
  password: "",
  email: "",
  role: "user",
  // name
  first_name: "",
  last_name: "",
  western_name: "",
  // birthday
  birthday: "",
  birthday_lunar: "",
  is_lunar: false,
  // contact
  country_code: "",
  phone_number: "",
  // profile
  profile_picture_url: "",
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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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
      email: u.email ?? "",
      role: u.role,
      first_name: u.first_name ?? "",
      last_name: u.last_name ?? "",
      western_name: u.western_name ?? "",
      birthday: u.birthday ?? "",
      birthday_lunar: u.birthday_lunar ?? "",
      is_lunar: u.is_lunar ?? false,
      country_code: u.country_code ?? "",
      phone_number: u.phone_number ?? "",
      profile_picture_url: u.profile_picture_url ?? "",
    });
    setFormError("");
    setModal("edit");
  };

  const closeModal = () => { setModal(null); setEditTarget(null); setFormError(""); };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  // ── build API payload ──────────────────────────────────────────────────

  const buildPayload = (isCreate) => {
    const p = {
      email: form.email || null,
      role: form.role,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      western_name: form.western_name || null,
      birthday: form.birthday || null,
      birthday_lunar: form.birthday_lunar || null,
      is_lunar: form.is_lunar,
      country_code: form.country_code || null,
      phone_number: form.phone_number || null,
      profile_picture_url: form.profile_picture_url || null,
    };
    if (isCreate) {
      p.username = form.username;
      p.password = form.password;
    } else if (form.password) {
      p.password = form.password;
    }
    return p;
  };

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
        body: JSON.stringify(buildPayload(true)),
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
      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload(false)),
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

  // ── form body ──────────────────────────────────────────────────────────

  const formBody = (isCreate) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {/* Account */}
      <SectionHeading>Account</SectionHeading>

      {isCreate && (
        <Field label="Username *" half>
          <input name="username" value={form.username} onChange={handleChange}
            required autoComplete="off" className={inputCls} />
        </Field>
      )}

      <Field label={isCreate ? "Password *" : "New Password (blank = no change)"} half={isCreate}>
        <input type="password" name="password" value={form.password} onChange={handleChange}
          required={isCreate} autoComplete="new-password" className={inputCls} />
      </Field>

      <Field label="Email" half>
        <input type="email" name="email" value={form.email} onChange={handleChange} className={inputCls} />
      </Field>

      <Field label="Role" half>
        <select name="role" value={form.role} onChange={handleChange} className={inputCls}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </Field>

      {/* Name */}
      <SectionHeading>Name</SectionHeading>

      <Field label="성 (Last Name)" half>
        <input name="last_name" value={form.last_name} onChange={handleChange} className={inputCls} />
      </Field>

      <Field label="이름 (First Name)" half>
        <input name="first_name" value={form.first_name} onChange={handleChange} className={inputCls} />
      </Field>

      <Field label="영어이름 (Western Name)" half>
        <input name="western_name" value={form.western_name} onChange={handleChange}
          placeholder="e.g. Roy" className={inputCls} />
      </Field>

      {/* Birthday */}
      <SectionHeading>Birthday</SectionHeading>

      <Field label="양력 (Solar Birthday)" half>
        <input type="date" name="birthday" value={form.birthday} onChange={handleChange} className={inputCls} />
      </Field>

      <Field label="음력 (Lunar Birthday)" half>
        <input type="date" name="birthday_lunar" value={form.birthday_lunar} onChange={handleChange}
          className={inputCls} />
      </Field>

      <div className="col-span-2 flex items-center gap-2">
        <input type="checkbox" id="is_lunar" name="is_lunar" checked={form.is_lunar}
          onChange={handleChange} className="accent-indigo-600 w-4 h-4" />
        <label htmlFor="is_lunar" className="text-xs text-slate-600">Primary birthday is lunar</label>
        {form.birthday && (
          <span className="ml-auto text-xs text-slate-400">
            Age: {calcAge(form.birthday)}
          </span>
        )}
      </div>

      {/* Contact */}
      <SectionHeading>Contact</SectionHeading>

      <Field label="Country Code" half>
        <CountryCodeSelect
          value={form.country_code}
          onChange={handleChange}
          name="country_code"
        />
      </Field>

      <Field label="Phone Number" half>
        <input name="phone_number" value={form.phone_number} onChange={handleChange}
          placeholder="10-1234-5678" className={inputCls} />
      </Field>

      {/* Profile */}
      <SectionHeading>Profile</SectionHeading>

      <Field label="Profile Picture URL">
        <input name="profile_picture_url" value={form.profile_picture_url} onChange={handleChange}
          placeholder="https://..." className={inputCls} />
      </Field>

      {/* Error + submit */}
      {formError && (
        <p className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <div className="col-span-2 flex gap-3 pt-2">
        <button type="submit" disabled={submitting}
          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {submitting
            ? isCreate ? "Creating…" : "Saving…"
            : isCreate ? "Create User" : "Save Changes"}
        </button>
        <button type="button" onClick={closeModal}
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
          <p className="text-sm text-slate-400 mt-1">
            {users.length} member{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={openCreate}
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-10" />
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Username</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Email</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:table-cell">Phone</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:table-cell">Birthday / Age</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const age = calcAge(u.birthday);
              return (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Avatar u={u} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {displayName(u)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{u.username}</td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                    {u.email || <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden xl:table-cell">
                    {u.phone_number ? (
                      <span className="flex items-center gap-1.5">
                        {u.country_code && (() => {
                          const c = COUNTRIES.find((x) => x.dial === u.country_code);
                          return c ? (
                            <span className="text-base leading-none" title={c.name}>
                              {flagEmoji(c.iso)}
                            </span>
                          ) : (
                            <span className="font-mono text-slate-400">{u.country_code}</span>
                          );
                        })()}
                        <span>{u.phone_number}</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">
                    {u.birthday ? (
                      <span>
                        {u.birthday}
                        {age !== null && (
                          <span className="ml-1 text-indigo-500 font-semibold">({age}세)</span>
                        )}
                        {u.is_lunar && (
                          <span className="ml-1 text-slate-400">[음]</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {deleteTarget === u.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-red-600 font-medium">Delete?</span>
                        <button onClick={() => handleDelete(u.id)}
                          className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded font-bold transition-colors"
                        >Yes</button>
                        <button onClick={() => setDeleteTarget(null)}
                          className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded border transition-colors"
                        >No</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(u)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors p-1.5 rounded hover:bg-indigo-50"
                          title="Edit"
                        ><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteTarget(u.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-50"
                          title="Delete"
                        ><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {users.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center text-slate-400 text-sm">
                  No users yet — create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === "create" && (
        <Modal title="New User" onClose={closeModal}>
          <form onSubmit={handleCreate}>{formBody(true)}</form>
        </Modal>
      )}

      {modal === "edit" && editTarget && (
        <Modal title={`Edit — ${editTarget.username}`} onClose={closeModal}>
          <form onSubmit={handleUpdate}>{formBody(false)}</form>
        </Modal>
      )}
    </div>
  );
};

export default UsersPage;
