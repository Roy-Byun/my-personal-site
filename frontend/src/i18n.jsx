import { createContext, useContext, useState } from "react";

const KO = {
  // Nav
  "Home": "홈",
  "Family": "가족",
  "Projects": "프로젝트",
  "Profile": "프로필",
  "Admin": "관리자",
  "Logout": "로그아웃",
  "Login": "로그인",

  // Auth
  "Username": "닉네임",
  "Password": "비밀번호",
  "Sign In": "로그인",
  "Register": "회원가입",
  "Invite Code": "초대 코드",
  "First Name": "이름",
  "Last Name": "성",
  "Western Name": "영어 이름",
  "Birthday": "생일",
  "Email": "이메일",
  "Create Account": "계정 만들기",
  "Already have an account?": "이미 계정이 있으신가요?",
  "Back to login": "로그인으로 돌아가기",

  // Profile
  "My Profile": "내 프로필",
  "Edit Profile": "프로필 수정",
  "Save Changes": "저장",
  "Cancel": "취소",
  "Change Password": "비밀번호 변경",
  "New Password": "새 비밀번호",
  "Deactivate Account": "계정 비활성화",
  "Deactivate my account": "내 계정을 비활성화합니다",
  "This will log you out and disable your account.": "이 작업은 로그아웃 후 계정을 비활성화합니다.",
  "Are you sure?": "정말 하시겠습니까?",
  "Yes, deactivate": "네, 비활성화합니다",

  // Family
  "Family Members": "가족 구성원",
  "Family News": "가족 소식",
  "View all": "전체 보기",
  "Coming Soon": "준비 중",
  "Role": "역할",
  "admin": "관리자",
  "user": "일반",
  "in {n} days": "{n}일 후",
  "Today!": "오늘!",

  // Calendar
  "Family Calendar": "가족 캘린더",
  "Add Event": "일정 추가",
  "Import .ics": ".ics 가져오기",
  "No events in the next 30 days": "다음 30일 내 일정이 없습니다",
  "Upcoming Events": "다가오는 일정",

  // News
  "Family Posts": "가족 게시물",
  "No posts yet": "게시물이 없습니다",

  // Announcements
  "Announcements": "공지사항",

  // Errors / messages
  "Loading…": "불러오는 중…",
  "Error loading data": "데이터를 불러올 수 없습니다",
  "Saved!": "저장됨!",
  "Failed to save": "저장 실패",

  // Admin suspension
  "Suspend": "정지",
  "Unsuspend": "정지 해제",
  "Reactivate": "재활성화",
  "Suspension reason (optional)": "정지 사유 (선택)",
  "Duration": "기간",
  "1 day": "1일",
  "7 days": "7일",
  "30 days": "30일",
  "90 days": "90일",
  "1 year": "1년",
  "Permanent ban": "영구 정지",
};

const LangContext = createContext({ lang: "en", t: (k) => k, setLang: () => {} });

export function LangProvider({ children }) {
  const saved = typeof localStorage !== "undefined"
    ? localStorage.getItem("lang") || "en"
    : "en";
  const [lang, setLangState] = useState(saved);

  function setLang(l) {
    setLangState(l);
    localStorage.setItem("lang", l);
  }

  function t(key, vars = {}) {
    let str = (lang === "ko" ? KO[key] : undefined) ?? key;
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, v);
    });
    return str;
  }

  return <LangContext value={{ lang, t, setLang }}>{children}</LangContext>;
}

export function useT() {
  return useContext(LangContext);
}
