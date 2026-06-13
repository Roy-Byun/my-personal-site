import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Briefcase,
  ChevronDown,
  Globe,
  LogIn,
  LogOut,
  Menu,
  Newspaper,
  Settings,
  User,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { LangProvider, useT } from "./i18n";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";
import ProfilePage from "./ProfilePage";
import SystemHealthPage from "./SystemHealthPage";
import UsersPage from "./UsersPage";
import NewsSection from "./NewsSection";
import NewsAdminPage from "./NewsAdminPage";
import HomePage from "./HomePage";
import FamilyPage from "./FamilyPage";
import ProjectsPage from "./ProjectsPage";

function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <button
      onClick={() => setLang(lang === "en" ? "ko" : "en")}
      className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors border rounded px-2 py-1"
      title={lang === "en" ? "한국어로 전환" : "Switch to English"}
    >
      <Globe className="w-3 h-3" />
      {lang === "en" ? "한국어" : "English"}
    </button>
  );
}

const Navigation = ({
  currentPage,
  setCurrentPage,
  isSystemOpen,
  setIsSystemOpen,
  dropdownRef,
  mobileOpen,
  setMobileOpen,
}) => {
  const { user, logout } = useAuth();
  const { t } = useT();
  const isAdmin = user?.role === "admin";

  const navLinks = (isMobile = false) => (
    <>
      <button
        onClick={() => { setCurrentPage("projects"); setMobileOpen(false); }}
        className={`hover:text-indigo-600 flex items-center gap-1 ${isMobile ? "w-full py-2" : ""}`}
      >
        <Briefcase className="w-4 h-4" /> {t("Projects")}
      </button>
      <button
        onClick={() => { setCurrentPage("family"); setMobileOpen(false); }}
        className={`hover:text-indigo-600 flex items-center gap-1 ${isMobile ? "w-full py-2" : ""}`}
      >
        <Users className="w-4 h-4" /> {t("Family")}
      </button>

      {user && isAdmin && (
        <div className={`relative ${isMobile ? "w-full" : ""}`} ref={isMobile ? null : dropdownRef}>
          <button
            onClick={() => setIsSystemOpen(!isSystemOpen)}
            className={`hover:text-indigo-600 flex items-center gap-1 ${isMobile ? "w-full py-2" : ""}`}
          >
            <Settings className="w-4 h-4" /> System{" "}
            <ChevronDown className="w-3 h-3" />
          </button>
          {isSystemOpen && (
            <div
              className={
                isMobile
                  ? "mt-1 pl-4 flex flex-col"
                  : "absolute top-full left-0 mt-2 w-48 bg-white border rounded-lg shadow-xl py-2 z-50"
              }
            >
              <button
                onClick={() => { setCurrentPage("sys-health"); setIsSystemOpen(false); setMobileOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
              >
                <Activity className="w-4 h-4" /> System Health
              </button>
              <button
                onClick={() => { setCurrentPage("users"); setIsSystemOpen(false); setMobileOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
              >
                <UserCog className="w-4 h-4" /> User Management
              </button>
              <button
                onClick={() => { setCurrentPage("news-admin"); setIsSystemOpen(false); setMobileOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
              >
                <Newspaper className="w-4 h-4" /> News Management
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <nav className="bg-white border-b sticky top-0 z-50 shadow-sm">
      <div className="h-16 px-6 flex items-center justify-between">
        {/* Left: logo + desktop links */}
        <div className="flex items-center gap-8">
          <div
            className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center cursor-pointer shadow-md"
            onClick={() => { setCurrentPage("home"); setMobileOpen(false); }}
          >
            <span className="text-white font-bold text-xl italic tracking-tighter">HH</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            {navLinks(false)}
          </div>
        </div>

        {/* Right: lang toggle + user area + hamburger */}
        <div className="flex items-center gap-3">
          <LangToggle />

          {!user ? (
            <button
              onClick={() => setCurrentPage("login")}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition-colors"
            >
              <LogIn className="w-4 h-4" /> {t("Login")}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {t(user.role === "admin" ? "admin" : "user")}
                </p>
                <p className="text-sm font-semibold">
                  {(user.last_name || user.first_name)
                    ? `${user.last_name ?? ""}${user.first_name ?? ""}`.trim()
                    : user.western_name || user.full_name || user.username}
                </p>
              </div>
              <button
                onClick={() => setCurrentPage("profile")}
                className="w-10 h-10 rounded-full border-2 border-indigo-600 flex items-center justify-center bg-slate-100 hover:bg-indigo-50 transition-colors"
                title={t("My Profile")}
              >
                <User className="text-slate-500 w-5 h-5" />
              </button>
              <button
                onClick={logout}
                className="text-slate-400 hover:text-red-500 transition-colors"
                title={t("Logout")}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Hamburger — mobile only */}
          <button
            className="md:hidden text-slate-600 hover:text-indigo-600 transition-colors ml-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white px-6 py-3 flex flex-col text-sm font-semibold text-slate-600">
          {navLinks(true)}
        </div>
      )}
    </nav>
  );
};

const Footer = () => (
  <footer className="bg-white border-t border-slate-200 py-10 px-6 mt-auto">
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
          HH
        </div>
        <p className="text-sm font-bold text-slate-800">HeptaHog Hub | SIT DEng Node</p>
      </div>
      <p className="text-xs text-slate-500">© 2026 Roy Byun. Managed via GitHub Actions.</p>
    </div>
  </footer>
);

function AppInner() {
  const { user, loading, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState("home");
  const [isSystemOpen, setIsSystemOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Detect invite token in URL on mount
  const [inviteToken, setInviteToken] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("invite");
    if (tok) {
      setInviteToken(tok);
      setCurrentPage("register");
      // Clean URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setIsSystemOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => setMobileOpen(false), [currentPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (currentPage === "login") {
    return <LoginPage onSuccess={() => setCurrentPage("home")} />;
  }

  if (currentPage === "register") {
    return (
      <RegisterPage
        inviteToken={inviteToken}
        onSuccess={() => setCurrentPage("home")}
        onLogin={() => setCurrentPage("login")}
      />
    );
  }

  const renderContent = () => {
    if (currentPage === "profile" && user) {
      return <ProfilePage user={user} onLogout={() => { logout(); setCurrentPage("home"); }} />;
    }
    if (currentPage === "sys-health" && user?.role === "admin") {
      return <SystemHealthPage />;
    }
    if (currentPage === "users" && user?.role === "admin") {
      return <UsersPage />;
    }
    if (currentPage === "news-admin" && user?.role === "admin") {
      return <NewsAdminPage />;
    }
    if (currentPage === "news-all") {
      return <NewsSection />;
    }
    if (currentPage === "family") {
      return <FamilyPage setCurrentPage={setCurrentPage} />;
    }
    if (currentPage === "projects") {
      return <ProjectsPage />;
    }
    return <HomePage onViewAllNews={() => setCurrentPage("news-all")} onViewAllPosts={() => setCurrentPage("family")} />;
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Navigation
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        isSystemOpen={isSystemOpen}
        setIsSystemOpen={setIsSystemOpen}
        dropdownRef={dropdownRef}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main className="flex-grow">
        <header className="w-full py-20 px-6 bg-slate-800 text-left text-white">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-extrabold italic mb-4">HeptaHog</h1>
            <p className="text-slate-300 text-lg max-w-2xl">Hosted on Roika Mini PC Node.</p>
          </div>
        </header>
        {renderContent()}
      </main>
      <Footer />
    </div>
  );
}

const App = () => (
  <LangProvider>
    <AppInner />
  </LangProvider>
);

export default App;
