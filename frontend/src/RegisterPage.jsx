import { useEffect, useState } from "react";
import { useT } from "./i18n";

export default function RegisterPage({ inviteToken, onSuccess, onLogin }) {
  const { t } = useT();
  const [tokenValid, setTokenValid] = useState(null); // null=checking, true, false
  const [tokenNote, setTokenNote] = useState("");
  const [form, setForm] = useState({
    username: "", password: "", first_name: "", last_name: "",
    western_name: "", birthday: "", email: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteToken) { setTokenValid(false); return; }
    fetch(`/api/invites/validate/${encodeURIComponent(inviteToken)}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.valid) { setTokenValid(true); setTokenNote(data.note || ""); }
        else setTokenValid(false);
      })
      .catch(() => setTokenValid(false));
  }, [inviteToken]);

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = { ...form, invite_token: inviteToken };
      if (!payload.birthday) delete payload.birthday;
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.detail || t("Failed to save")); return; }
      onSuccess(data);
    } finally {
      setLoading(false);
    }
  }

  if (tokenValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{t("Loading…")}</p>
      </div>
    );
  }

  if (tokenValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center space-y-4">
          <h2 className="text-xl font-bold text-red-600">유효하지 않은 초대 링크</h2>
          <p className="text-gray-600 text-sm">
            이 초대 링크는 유효하지 않거나 만료되었습니다. 관리자에게 새 링크를 요청하세요.
          </p>
          <button onClick={onLogin} className="text-indigo-600 hover:underline text-sm">
            {t("Back to login")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">{t("Register")}</h1>
        {tokenNote && (
          <p className="text-sm text-indigo-600 bg-indigo-50 rounded px-3 py-2">
            초대: {tokenNote}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("Last Name")} (성)</label>
              <input value={form.last_name} onChange={set("last_name")}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("First Name")} (이름)</label>
              <input value={form.first_name} onChange={set("first_name")}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("Western Name")} (영어 이름)</label>
            <input value={form.western_name} onChange={set("western_name")}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("Username")}
              <span className="ml-1 text-gray-400 font-normal">(영문·숫자·. _ - @ 만 가능, 변경 불가)</span>
            </label>
            <input value={form.username} onChange={set("username")} required
              pattern="[a-zA-Z0-9._\-@]{3,30}"
              title="3-30자, 영문/숫자/. _ - @ 만 허용"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("Password")}</label>
            <input type="password" value={form.password} onChange={set("password")} required minLength={6}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("Birthday")} (선택)</label>
            <input type="date" value={form.birthday} onChange={set("birthday")}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t("Email")} (선택)</label>
            <input type="email" value={form.email} onChange={set("email")}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold
                       hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {loading ? t("Loading…") : t("Create Account")}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          {t("Already have an account?")}{" "}
          <button onClick={onLogin} className="text-indigo-600 hover:underline">{t("Back to login")}</button>
        </p>
      </div>
    </div>
  );
}
