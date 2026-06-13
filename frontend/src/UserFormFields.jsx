import { useEffect, useRef, useState } from "react";
import CountryCodeSelect from "./CountryCodeSelect";

export const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

export function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 pt-1">
      {children}
    </p>
  );
}

function useLunarCalc(solarDate) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!solarDate) { setResult(null); return; }
    const t = setTimeout(() => {
      fetch(`/api/utils/solar-to-lunar?date=${solarDate}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => setResult(d?.lunar_date ?? null))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [solarDate]);
  return result;
}

/**
 * Shared profile/registration fields.
 * form: { last_name, first_name, western_name, birthday, birthday_lunar,
 *         is_lunar, email, country_code, phone_number, profile_picture_url }
 * setForm: standard React setState
 */
export function UserFormFields({ form, setForm }) {
  const lunarAutoFilled = useRef(false);
  const autoLunar = useLunarCalc(form.birthday);

  // Auto-populate lunar date when solar changes, unless user manually entered a value
  useEffect(() => {
    if (autoLunar && (!form.birthday_lunar || lunarAutoFilled.current)) {
      setForm(prev => ({ ...prev, birthday_lunar: autoLunar }));
      lunarAutoFilled.current = true;
    }
  }, [autoLunar]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(field) {
    return e => {
      const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setForm(prev => ({ ...prev, [field]: val }));
    };
  }

  function handleLunarChange(e) {
    lunarAutoFilled.current = false; // user is manually editing — stop auto-fill
    setForm(prev => ({ ...prev, birthday_lunar: e.target.value }));
  }

  function handleClearLunar() {
    lunarAutoFilled.current = false;
    setForm(prev => ({ ...prev, birthday_lunar: "" }));
  }

  return (
    <div className="space-y-3">
      {/* ── Name ── */}
      <SectionLabel>이름 (Name)</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">성 (Last Name)</label>
          <input value={form.last_name} onChange={set("last_name")} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">이름 (First Name)</label>
          <input value={form.first_name} onChange={set("first_name")} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">영어이름 (Western Name)</label>
        <input value={form.western_name} onChange={set("western_name")}
          placeholder="e.g. Roy" className={inputCls} />
      </div>

      {/* ── Birthday ── */}
      <SectionLabel>생일 (Birthday)</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">양력 (Solar)</label>
          <input type="date" value={form.birthday} onChange={set("birthday")} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
            음력 (Lunar)
            {lunarAutoFilled.current && form.birthday_lunar && (
              <span className="text-[9px] font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                자동계산
              </span>
            )}
          </label>
          <div className="relative">
            <input
              type="date"
              value={form.birthday_lunar}
              onChange={handleLunarChange}
              className={inputCls}
            />
            {lunarAutoFilled.current && form.birthday_lunar && (
              <button
                type="button"
                onClick={handleClearLunar}
                title="음력 날짜 초기화"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-xs"
              >
                ✕
              </button>
            )}
          </div>
          {form.birthday && !form.birthday_lunar && !autoLunar && (
            <p className="text-[10px] text-slate-400 mt-1">계산 중…</p>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.is_lunar || false}
          onChange={set("is_lunar")}
          className="accent-indigo-600 w-4 h-4 rounded"
        />
        <span className="text-xs text-slate-600">
          음력을 주 생일로 사용 (Primary birthday is lunar)
        </span>
      </label>

      {/* ── Contact ── */}
      <SectionLabel>연락처 (Contact)</SectionLabel>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">이메일 (Email)</label>
        <input type="email" value={form.email} onChange={set("email")} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">국가 코드</label>
          <CountryCodeSelect
            value={form.country_code}
            onChange={e => setForm(prev => ({ ...prev, country_code: e.target.value }))}
            name="country_code"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">전화번호</label>
          <input value={form.phone_number} onChange={set("phone_number")}
            placeholder="010-1234-5678" className={inputCls} />
        </div>
      </div>

      {/* ── Profile ── */}
      <SectionLabel>프로필 (Profile)</SectionLabel>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">프로필 사진 URL</label>
        <input value={form.profile_picture_url} onChange={set("profile_picture_url")}
          placeholder="https://…" className={inputCls} />
      </div>
    </div>
  );
}

export const EMPTY_PROFILE_FORM = {
  last_name: "", first_name: "", western_name: "",
  birthday: "", birthday_lunar: "", is_lunar: false,
  email: "", country_code: "", phone_number: "", profile_picture_url: "",
};
