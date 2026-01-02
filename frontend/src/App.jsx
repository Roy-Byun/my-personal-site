import React, { useState, useRef, useEffect } from "react";
import {
  User,
  LogIn,
  Briefcase,
  Users,
  Settings,
  ExternalLink,
  ChevronDown,
  Activity,
  FileText,
  Network,
} from "lucide-react";
import SystemHealthPage from "./SystemHealthPage";

/**
 * SHARED COMPONENTS
 */
const Navigation = ({
  currentPage,
  setCurrentPage,
  isLoggedIn,
  isAdmin,
  handleLogin,
  isSystemOpen,
  setIsSystemOpen,
  dropdownRef,
}) => (
  <nav className="h-16 bg-white border-b sticky top-0 z-50 px-6 flex items-center justify-between shadow-sm">
    <div className="flex items-center gap-8">
      <div
        className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center cursor-pointer shadow-md"
        onClick={() => setCurrentPage("home")}
      >
        <div className="text-white font-bold text-xl italic tracking-tighter">
          HH
        </div>
      </div>

      <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
        <button
          onClick={() => setCurrentPage("projects")}
          className="hover:text-indigo-600 flex items-center gap-1"
        >
          <Briefcase className="w-4 h-4" /> Projects
        </button>
        <button
          onClick={() => setCurrentPage("family")}
          className="hover:text-indigo-600 flex items-center gap-1"
        >
          <Users className="w-4 h-4" /> Family
        </button>

        {isLoggedIn && isAdmin && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsSystemOpen(!isSystemOpen)}
              className="hover:text-indigo-600 flex items-center gap-1"
            >
              <Settings className="w-4 h-4" /> System{" "}
              <ChevronDown className="w-3 h-3" />
            </button>
            {isSystemOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white border rounded-lg shadow-xl py-2 z-50">
                <button
                  onClick={() => {
                    setCurrentPage("sys-health");
                    setIsSystemOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <Activity className="w-4 h-4" /> System Health
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    <div className="flex items-center gap-4">
      {!isLoggedIn ? (
        <button
          onClick={handleLogin}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold"
        >
          <LogIn className="w-4 h-4 inline mr-2" /> Login
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-400">Admin</p>
            <p className="text-sm font-semibold">Roy Byun</p>
          </div>
          <div className="w-10 h-10 rounded-full border-2 border-indigo-600 flex items-center justify-center bg-slate-200">
            <User className="text-slate-500 w-6 h-6" />
          </div>
        </div>
      )}
    </div>
  </nav>
);

const Footer = () => (
  <footer className="bg-white border-t border-slate-200 py-10 px-6 mt-auto">
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
          HH
        </div>
        <p className="text-sm font-bold text-slate-800">
          HeptaHog Hub | SIT DEng Node
        </p>
      </div>
      <p className="text-xs text-slate-500">
        © 2024 Roy Byun. Managed via GitHub Actions.
      </p>
    </div>
  </footer>
);

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentPage, setCurrentPage] = useState("home");
  const [isSystemOpen, setIsSystemOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target))
        setIsSystemOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
    setIsAdmin(true);
  };

  const renderContent = () => {
    if (currentPage === "sys-health") return <SystemHealthPage />;
    return (
      <section className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-4 gap-8 text-left">
        <aside className="col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-widest mb-4">
              Dashboard
            </h3>
            <div className="p-3 bg-slate-50 rounded-lg border text-center">
              <p className="text-[10px] font-bold text-slate-400">Status</p>
              <p className="text-sm font-semibold text-emerald-600">
                Active Node
              </p>
            </div>
          </div>
        </aside>

        <article className="col-span-3 space-y-8">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">
              Recent Activities
            </h2>
            <p className="text-slate-500">
              Node metrics and activities go here.
            </p>
          </div>
        </article>
      </section>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Navigation
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        handleLogin={handleLogin}
        isSystemOpen={isSystemOpen}
        setIsSystemOpen={setIsSystemOpen}
        dropdownRef={dropdownRef}
      />
      <main className="flex-grow">
        <header className="w-full relative py-20 px-6 bg-slate-800 text-left text-white">
          <div className="max-w-7xl mx-auto relative z-10">
            <h1 className="text-4xl md:text-5xl font-extrabold italic mb-4">
              HeptaHog
            </h1>
            <p className="text-slate-300 text-lg max-w-2xl">
              Hosted on Roika Mini PC Node.
            </p>
          </div>
        </header>
        {renderContent()}
      </main>
      <Footer />
    </div>
  );
};

export default App;
