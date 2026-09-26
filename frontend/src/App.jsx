import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Globe,
  LogIn,
  LogOut,
  Menu,
  Newspaper,
  Settings,
  User,
  UserCircle,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { LangProvider, useT } from "./i18n";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";
import ProfilePage from "./ProfilePage";
import NewsSection from "./NewsSection";
import HomePage from "./HomePage";
import FamilyPage from "./FamilyPage";
import ProjectsPage from "./ProjectsPage";

// Code-split the heavy / rarely-visited pages so the first load isn't a single
// ~1.2 MB bundle over a slow link. recharts (FinancePage), @xyflow + dagre
// (FamilyTreePage) and @dnd-kit (ProjectDetailPage → KanbanBoard) each become
// their own chunk, fetched only when that page is opened.
const SystemHealthPage = lazy(() => import("./SystemHealthPage"));
const UsersPage = lazy(() => import("./UsersPage"));
const NewsAdminPage = lazy(() => import("./NewsAdminPage"));
const FamilyTreePage = lazy(() => import("./FamilyTreePage"));
const ProjectDetailPage = lazy(() => import("./ProjectDetailPage"));
const TaskTrackingPage = lazy(() => import("./TaskTrackingPage"));
const AboutMePage = lazy(() => import("./AboutMePage"));
const FinancePage = lazy(() => import("./FinancePage"));

const PageFallback = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

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

export const PAGE_LABELS = {
  home:            "Home",
  family:          "Family",
  "family-tree":   "Family Tree",
  projects:        "Projects",
  "project-detail":"Project",
  "task-tracking": "Task Tracking",
  finance:         "Finance",
  about:           "About Me",
  profile:         "My Profile",
  "news-all":      "News",
  "sys-health":    "System Health",
  users:           "User Management",
  "news-admin":    "News Management",
};

// ── Page banner (dark) ───────────────────────────────────────────────────────

function PageBanner({ currentPage }) {
  const { t } = useT();
  if (currentPage === "home") {
    return (
      <header className="w-full py-20 px-6 bg-slate-800 text-left text-white">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-extrabold italic mb-4">{t("My corner of the internet.")}</h1>
          <p className="text-slate-300 text-lg max-w-2xl">{t("Everything about me: projects, ideas and more.")}</p>
        </div>
      </header>
    );
  }

  return (
    <header className="w-full py-8 px-6 bg-slate-800 text-white">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
          {PAGE_LABELS[currentPage] || currentPage}
        </h1>
      </div>
    </header>
  );
}

// ── Breadcrumb row (below banner, above content) ──────────────────────────────

function Breadcrumb({ pageHistory, navigateToIndex }) {
  if (pageHistory.length <= 1) return null;

  return (
    <div className="w-full bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 py-2.5">
        <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-1 text-xs text-slate-500">
          {pageHistory.map((page, i) => {
            const isLast = i === pageHistory.length - 1;
            return (
              <React.Fragment key={`${page}-${i}`}>
                {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
                {isLast ? (
                  <span className="font-semibold text-slate-700">
                    {PAGE_LABELS[page] || page}
                  </span>
                ) : (
                  <button
                    onClick={() => navigateToIndex(i)}
                    className="hover:text-indigo-600 transition-colors"
                  >
                    {PAGE_LABELS[page] || page}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

// ── Navigation bar ────────────────────────────────────────────────────────────

const Navigation = ({
  navigate,
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
        onClick={() => { navigate("projects"); setMobileOpen(false); }}
        className={`hover:text-indigo-600 flex items-center gap-1 ${isMobile ? "w-full py-2" : ""}`}
      >
        <Briefcase className="w-4 h-4" /> {t("Projects")}
      </button>
      <button
        onClick={() => { navigate("about"); setMobileOpen(false); }}
        className={`hover:text-indigo-600 flex items-center gap-1 ${isMobile ? "w-full py-2" : ""}`}
      >
        <UserCircle className="w-4 h-4" /> {t("About Me")}
      </button>
      <button
        onClick={() => { navigate("family"); setMobileOpen(false); }}
        className={`hover:text-indigo-600 flex items-center gap-1 ${isMobile ? "w-full py-2" : ""}`}
      >
        <Users className="w-4 h-4" /> {t("Family")}
      </button>

      {user && isAdmin && (
        <button
          onClick={() => { navigate("finance"); setMobileOpen(false); }}
          className={`hover:text-indigo-600 flex items-center gap-1 ${isMobile ? "w-full py-2" : ""}`}
        >
          <Wallet className="w-4 h-4" /> {t("Finance")}
        </button>
      )}

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
                onClick={() => { navigate("sys-health"); setIsSystemOpen(false); setMobileOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
              >
                <Activity className="w-4 h-4" /> System Health
              </button>
              <button
                onClick={() => { navigate("users"); setIsSystemOpen(false); setMobileOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
              >
                <UserCog className="w-4 h-4" /> User Management
              </button>
              <button
                onClick={() => { navigate("news-admin"); setIsSystemOpen(false); setMobileOpen(false); }}
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
        {/* Left: logo + desktop nav links */}
        <div className="flex items-center gap-6">
          <button type="button" onClick={() => navigate("home")} className="shrink-0" aria-label="HeptaHog Hub home">
            <img src="/logo.png" alt="HeptaHog Hub" className="w-12 h-12 object-contain" />
          </button>

          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            {navLinks(false)}
          </div>
        </div>

        {/* Right: lang toggle + user area + hamburger */}
        <div className="flex items-center gap-3">
          <LangToggle />

          {!user ? (
            <button
              onClick={() => navigate("login")}
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
                onClick={() => navigate("profile")}
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

// ── Footer ───────────────────────────────────────────────────────────────────

const Footer = () => (
  <footer className="bg-white border-t border-slate-200 py-10 px-6 mt-auto">
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
      <div className="flex items-center gap-4">
        <img src="/logo.png" alt="" className="w-10 h-10 object-contain" />
        <p className="text-sm font-bold text-slate-800">HeptaHog Hub | SIT DEng Node</p>
      </div>
      <p className="text-xs text-slate-500">© 2026 Roy Byun. Managed via GitHub Actions.</p>
    </div>
  </footer>
);

// ── App ───────────────────────────────────────────────────────────────────────

function AppInner() {
  const { user, loading, logout } = useAuth();

  // Navigation history stack
  const [pageHistory, setPageHistory] = useState(["home"]);
  const currentPage = pageHistory[pageHistory.length - 1];
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  function navigate(page) {
    setPageHistory(h => {
      if (page === "home") return ["home"];
      if (h[h.length - 1] === page) return h;
      // If page already exists earlier in history, slice back to it
      const existing = h.lastIndexOf(page);
      if (existing !== -1) return h.slice(0, existing + 1);
      return [...h, page];
    });
  }

  function navigateToIndex(index) {
    setPageHistory(h => h.slice(0, index + 1));
  }

  const [isSystemOpen, setIsSystemOpen] = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const dropdownRef = useRef(null);

  // Detect invite token in URL on mount
  const [inviteToken, setInviteToken] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("invite");
    if (tok) {
      setInviteToken(tok);
      navigate("register");
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setIsSystemOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => setMobileOpen(false), [currentPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Full-screen pages (no nav/footer/header)
  if (currentPage === "login") {
    return (
      <LoginPage
        onSuccess={() => navigate("home")}
        onBack={pageHistory.length > 1 ? () => navigateToIndex(pageHistory.length - 2) : null}
      />
    );
  }
  if (currentPage === "register") {
    return (
      <RegisterPage
        inviteToken={inviteToken}
        onSuccess={() => navigate("home")}
        onLogin={() => navigate("login")}
      />
    );
  }

  const renderContent = () => {
    if (currentPage === "profile" && user) {
      return <ProfilePage user={user} onLogout={() => { logout(); navigate("home"); }} />;
    }
    if (currentPage === "sys-health" && user?.role === "admin") return <SystemHealthPage />;
    if (currentPage === "users"      && user?.role === "admin") return <UsersPage />;
    if (currentPage === "news-admin" && user?.role === "admin") return <NewsAdminPage />;
    if (currentPage === "news-all")    return <NewsSection />;
    if (currentPage === "family")      return <FamilyPage setCurrentPage={navigate} />;
    if (currentPage === "family-tree") return <FamilyTreePage />;
    if (currentPage === "projects")    return (
      <ProjectsPage
        onSelectProject={(id) => { setSelectedProjectId(id); navigate("project-detail"); }}
        onViewTaskTracking={() => navigate("task-tracking")}
      />
    );
    if (currentPage === "project-detail")
      return <ProjectDetailPage projectId={selectedProjectId} onBack={() => navigate("projects")} />;
    if (currentPage === "task-tracking" && user?.role === "admin")
      return <TaskTrackingPage onBack={() => navigate("projects")} />;
    if (currentPage === "finance"      && user?.role === "admin") return <FinancePage />;
    if (currentPage === "about")       return <AboutMePage />;
    return (
      <HomePage
        onViewAllNews={() => navigate("news-all")}
        onViewAllPosts={() => navigate("family")}
        onViewAllEvents={() => navigate("family")}
      />
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Navigation
        navigate={navigate}
        isSystemOpen={isSystemOpen}
        setIsSystemOpen={setIsSystemOpen}
        dropdownRef={dropdownRef}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <main className="flex-grow">
        <PageBanner currentPage={currentPage} />
        <Breadcrumb pageHistory={pageHistory} navigateToIndex={navigateToIndex} />
        <Suspense fallback={<PageFallback />}>
          {renderContent()}
        </Suspense>
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
