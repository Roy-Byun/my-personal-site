import React, { useEffect, useState } from "react";
import { Camera, Gift, MessageSquare, UtensilsCrossed, Users } from "lucide-react";
import { useAuth } from "./AuthContext";
import { flagEmoji } from "./countries";
import FamilyPostsWidget from "./FamilyPostsWidget";
import InfoTooltip from "./InfoTooltip";
import { useT } from "./i18n";

const calcAge = (bdayStr) => {
  if (!bdayStr) return null;
  const today = new Date();
  const b = new Date(bdayStr);
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
};

const birthdayCountdown = (bdayStr) => {
  if (!bdayStr) return null;
  const today = new Date();
  const b = new Date(bdayStr);
  let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  const diff = Math.round((next - today) / 86400000);
  if (diff === 0) return "🎂 Today!";
  if (diff <= 30) return `🎂 in ${diff} day${diff !== 1 ? "s" : ""}`;
  return null;
};

const displayName = (u) => {
  const parts = [u.last_name, u.first_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return u.western_name || u.full_name || "Member";
};

const initials = (u) => {
  if (u.last_name || u.first_name)
    return `${(u.last_name ?? "")[0] ?? ""}${(u.first_name ?? "")[0] ?? ""}`.toUpperCase() || "?";
  if (u.western_name)
    return u.western_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return "??";
};

const ROLE_COLORS = {
  admin: "bg-indigo-100 text-indigo-700",
  user:  "bg-slate-100 text-slate-500",
};

const MemberCard = ({ u }) => {
  const countdown = birthdayCountdown(u.birthday);
  const age = calcAge(u.birthday);
  const flag = u.country_code ? flagEmoji(u.country_code.replace("+", "").trim()) : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center gap-3 hover:shadow-md transition-shadow">
      {/* Avatar */}
      {u.profile_picture_url ? (
        <img src={u.profile_picture_url} alt={displayName(u)}
          className="w-16 h-16 rounded-full object-cover border-2 border-indigo-100" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold">
          {initials(u)}
        </div>
      )}

      {/* Name + role */}
      <div className="text-center">
        <p className="font-bold text-slate-800 leading-snug">{displayName(u)}</p>
        {u.western_name && (u.last_name || u.first_name) && (
          <p className="text-xs text-slate-400 mt-0.5">{u.western_name}</p>
        )}
        <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? ROLE_COLORS.user}`}>
          {u.role === "admin" ? "Admin" : "Member"}
        </span>
      </div>

      {/* Birthday */}
      {u.birthday && (
        <div className="text-center">
          <p className="text-xs text-slate-500">
            {new Date(u.birthday + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {age !== null && ` · ${age}세`}
          </p>
          {countdown && (
            <p className="text-xs font-semibold text-pink-500 mt-0.5">{countdown}</p>
          )}
        </div>
      )}

      {/* Contact */}
      {u.phone_number && (
        <p className="text-xs text-slate-400">
          {u.country_code} {u.phone_number}
        </p>
      )}
    </div>
  );
};

const ComingSoon = ({ icon: Icon, title, desc }) => (
  <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-6 flex flex-col items-center gap-2 text-center opacity-60">
    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
      <Icon className="w-5 h-5 text-slate-400" />
    </div>
    <p className="font-semibold text-sm text-slate-700">{title}</p>
    <p className="text-xs text-slate-400">{desc}</p>
    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full">Coming soon</span>
  </div>
);

const FamilyPage = ({ setCurrentPage }) => {
  const { user } = useAuth();
  const { t } = useT();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch("/api/users/family", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setMembers)
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

      {/* Members section */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-5 h-5 text-indigo-500" />
          <h2 className="text-xl font-bold text-slate-800">
            {t("Family Members")}
            <InfoTooltip text="가족 구성원 목록입니다. 로그인한 가족만 볼 수 있어요. (Visible to logged-in family members only)" />
          </h2>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{members.length} members</span>
        </div>

        {!user ? (
          <p className="text-slate-400 text-sm">Please log in to view family members.</p>
        ) : loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-52 bg-slate-100 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {members.map((m) => <MemberCard key={m.id} u={m} />)}
          </div>
        )}
      </div>

      {/* Family News full widget */}
      <div className="mb-10">
        <FamilyPostsWidget />
      </div>

      {/* Coming-soon features */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-700 mb-4">More Features</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ComingSoon icon={Camera}          title="Photo Gallery"    desc="Share and browse family photos & albums." />
          <ComingSoon icon={MessageSquare}   title="Family Chat"      desc="Real-time group messaging for the family." />
          <ComingSoon icon={Gift}            title="Shared Wishlist"  desc="Gift ideas by person — perfect for birthdays." />
          <ComingSoon icon={UtensilsCrossed} title="Family Recipes"   desc="A shared digital cookbook." />
        </div>
      </div>
    </div>
  );
};

export default FamilyPage;
