import { useState } from "react";
import { useT } from "./i18n";

export default function ProfilePage({ user, onLogout }) {
  const { t } = useT();
  const [form, setForm] = useState({
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    western_name: user.western_name || "",
    birthday: user.birthday || "",
    email: user.email || "",
    country_code: user.country_code || "",
    phone_number: user.phone_number || "",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [deactivateStep, setDeactivateStep] = useState(0); // 0 idle, 1 confirm

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const payload = { ...form };
      if (!payload.birthday) delete payload.birthday;
      if (!payload.password) delete payload.password;
      const r = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) { setMsg(data.detail || t("Failed to save")); return; }
      setMsg(t("Saved!"));
      setForm(f => ({ ...f, password: "" }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    const r = await fetch("/api/auth/deactivate", {
      method: "POST",
      credentials: "include",
    });
    if (r.ok) {
      onLogout();
    }
  }

  const displayName = [user.last_name, user.first_name].filter(Boolean).join(" ")
    || user.western_name || user.username;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center
                        text-2xl font-bold text-indigo-600">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{displayName}</h1>
          <p className="text-sm text-gray-500">@{user.username}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            user.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"
          }`}>
            {t(user.role)}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-white rounded-2xl shadow p-6 space-y-4">
        <h2 className="font-semibold text-gray-700 text-lg">{t("Edit Profile")}</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("Last Name")} (성)</label>
              <input value={form.last_name} onChange={set("last_name")}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("First Name")} (이름)</label>
              <input value={form.first_name} onChange={set("first_name")}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("Western Name")}</label>
            <input value={form.western_name} onChange={set("western_name")}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("Username")} <span className="text-gray-400 font-normal">(변경 불가)</span>
            </label>
            <input value={user.username} disabled
              className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("Birthday")}</label>
            <input type="date" value={form.birthday} onChange={set("birthday")}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("Email")}</label>
            <input type="email" value={form.email} onChange={set("email")}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">국가 코드</label>
              <input value={form.country_code} onChange={set("country_code")} placeholder="+82"
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">전화번호</label>
              <input value={form.phone_number} onChange={set("phone_number")}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("New Password")} (변경시만 입력)</label>
            <input type="password" value={form.password} onChange={set("password")} minLength={6}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          {msg && (
            <p className={`text-sm rounded px-3 py-2 ${
              msg === t("Saved!") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
            }`}>{msg}</p>
          )}

          <button type="submit" disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium
                       hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? t("Loading…") : t("Save Changes")}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl shadow p-6 border border-red-100 space-y-3">
        <h2 className="font-semibold text-red-600 text-lg">{t("Deactivate Account")}</h2>
        <p className="text-sm text-gray-600">{t("This will log you out and disable your account.")}</p>

        {deactivateStep === 0 && (
          <button onClick={() => setDeactivateStep(1)}
            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg
                       text-sm font-medium hover:bg-red-100 transition-colors">
            {t("Deactivate my account")}
          </button>
        )}

        {deactivateStep === 1 && (
          <div className="flex gap-3 items-center">
            <span className="text-sm text-gray-700 font-medium">{t("Are you sure?")}</span>
            <button onClick={handleDeactivate}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">
              {t("Yes, deactivate")}
            </button>
            <button onClick={() => setDeactivateStep(0)}
              className="text-gray-500 hover:text-gray-700 text-sm">
              {t("Cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
