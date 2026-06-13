import { useState } from "react";
import { useT } from "./i18n";
import { UserFormFields, inputCls, SectionLabel } from "./UserFormFields";

function initProfile(user) {
  return {
    last_name:           user.last_name           ?? "",
    first_name:          user.first_name          ?? "",
    western_name:        user.western_name        ?? "",
    birthday:            user.birthday            ?? "",
    birthday_lunar:      user.birthday_lunar      ?? "",
    is_lunar:            user.is_lunar            ?? false,
    email:               user.email               ?? "",
    country_code:        user.country_code        ?? "",
    phone_number:        user.phone_number        ?? "",
    profile_picture_url: user.profile_picture_url ?? "",
  };
}

export default function ProfilePage({ user, onLogout }) {
  const { t } = useT();
  const [profile, setProfile] = useState(() => initProfile(user));
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState("");
  const [deactivateStep, setDeactivateStep] = useState(0);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const payload = {
        ...profile,
        birthday:       profile.birthday       || null,
        birthday_lunar: profile.birthday_lunar || null,
        email:          profile.email          || null,
        country_code:   profile.country_code   || null,
        phone_number:   profile.phone_number   || null,
        profile_picture_url: profile.profile_picture_url || null,
        first_name:  profile.first_name  || null,
        last_name:   profile.last_name   || null,
        western_name: profile.western_name || null,
        ...(newPassword ? { password: newPassword } : {}),
      };
      const r = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) { setMsg(data.detail || t("Failed to save")); return; }
      setMsg(t("Saved!"));
      setNewPassword("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    const r = await fetch("/api/auth/deactivate", { method: "POST", credentials: "include" });
    if (r.ok) onLogout();
  }

  const displayName =
    [user.last_name, user.first_name].filter(Boolean).join(" ")
    || user.western_name || user.username;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center
                        text-2xl font-bold text-indigo-600 shrink-0">
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
          {/* Username — locked */}
          <SectionLabel>계정 (Account)</SectionLabel>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {t("Username")} <span className="text-slate-400 font-normal text-[10px]">(변경 불가)</span>
            </label>
            <input value={user.username} disabled
              className={`${inputCls} bg-gray-50 text-gray-400 cursor-not-allowed`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {t("New Password")} <span className="text-slate-400 font-normal text-[10px]">(변경 시만 입력)</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              minLength={6}
              className={inputCls}
            />
          </div>

          {/* Shared profile fields */}
          <UserFormFields form={profile} setForm={setProfile} />

          {msg && (
            <p className={`text-sm rounded px-3 py-2 ${
              msg === t("Saved!") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
            }`}>{msg}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium
                       hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? t("Loading…") : t("Save Changes")}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl shadow p-6 border border-red-100 space-y-3">
        <h2 className="font-semibold text-red-600 text-lg">{t("Deactivate Account")}</h2>
        <p className="text-sm text-gray-600">{t("This will log you out and disable your account.")}</p>

        {deactivateStep === 0 && (
          <button
            onClick={() => setDeactivateStep(1)}
            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg
                       text-sm font-medium hover:bg-red-100 transition-colors"
          >
            {t("Deactivate my account")}
          </button>
        )}
        {deactivateStep === 1 && (
          <div className="flex gap-3 items-center">
            <span className="text-sm text-gray-700 font-medium">{t("Are you sure?")}</span>
            <button
              onClick={handleDeactivate}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
            >
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
