import { useEffect, useState } from "react";
import { useT } from "./i18n";
import { UserFormFields, EMPTY_PROFILE_FORM, inputCls, SectionLabel } from "./UserFormFields";

export default function RegisterPage({ inviteToken, onSuccess, onLogin }) {
  const { t } = useT();
  const [tokenValid, setTokenValid] = useState(null);
  const [tokenNote, setTokenNote]   = useState("");

  const [creds, setCreds] = useState({ username: "", password: "" });
  const [profile, setProfile] = useState(EMPTY_PROFILE_FORM);

  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteToken) { setTokenValid(false); return; }
    fetch(`/api/invites/validate/${encodeURIComponent(inviteToken)}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.valid) { setTokenValid(true); setTokenNote(d.note || ""); } else setTokenValid(false); })
      .catch(() => setTokenValid(false));
  }, [inviteToken]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        invite_token: inviteToken,
        username: creds.username,
        password: creds.password,
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
      };
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8 px-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-lg w-full space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">{t("Register")}</h1>
        {tokenNote && (
          <p className="text-sm text-indigo-600 bg-indigo-50 rounded px-3 py-2">초대: {tokenNote}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Account credentials */}
          <SectionLabel>계정 (Account)</SectionLabel>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {t("Username")}
              <span className="ml-1 text-slate-400 font-normal text-[10px]">(영문·숫자·. _ - @ 만 가능, 변경 불가)</span>
            </label>
            <input
              value={creds.username}
              onChange={e => setCreds(c => ({ ...c, username: e.target.value }))}
              required
              pattern="[a-zA-Z0-9._\-@]{3,30}"
              title="3-30자, 영문/숫자/. _ - @ 만 허용"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t("Password")}</label>
            <input
              type="password"
              value={creds.password}
              onChange={e => setCreds(c => ({ ...c, password: e.target.value }))}
              required
              minLength={6}
              className={inputCls}
            />
          </div>

          {/* Shared profile fields */}
          <UserFormFields form={profile} setForm={setProfile} />

          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold
                       hover:bg-indigo-700 disabled:opacity-50 transition-colors mt-2"
          >
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
