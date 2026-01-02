import React, { useState, useRef, useEffect } from "react";
import {
  User,
  LogIn,
  Briefcase,
  Users,
  Settings,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Activity,
  FileText,
  Network,
  Cpu,
  HardDrive,
  Clock,
  RefreshCw,
} from "lucide-react";
import SystemHealthPage from "./SystemHealthPage";

/**
 * SHARED COMPONENTS FOR FRAMEWORK
 */

const Navigation = ({ currentPage, setCurrentPage }) => (
  <div className="h-16 bg-white border-b sticky top-0 z-50 px-6 flex items-center justify-between shadow-sm">
    <div className="flex items-center gap-8">
      <div
        className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center overflow-hidden cursor-pointer shadow-md"
        onClick={() => setCurrentPage("home")}
      >
        <div className="text-white font-bold text-xl italic tracking-tighter">
          HH
        </div>
      </div>

      <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
        <button
          onClick={() => setCurrentPage("projects")}
          className="hover:text-indigo-600 flex items-center gap-1 transition-colors"
        >
          <Briefcase className="w-4 h-4" /> Projects
        </button>
        <button
          onClick={() => setCurrentPage("family")}
          className="hover:text-indigo-600 flex items-center gap-1 transition-colors"
        >
          <Users className="w-4 h-4" /> Family
        </button>
      </div>
    </div>

    <div className="flex items-center gap-4">
      {/* login/profile area handled in App header */}
    </div>
  </div>
);

const Footer = () => (
  <footer className="footer footer-center p-6 mt-12 border-t border-white/6">
    <div className="max-w-4xl mx-auto text-slate-400 text-xs">
      <p>© 2024 Royka Mini PC - Hosted via Docker & Tailscale</p>
      <div className="flex gap-4 mt-2">
        <span>SIT DEng Project</span>
        <span>PostgreSQL 15</span>
      </div>
    </div>
  </footer>
);

/** HomePage moved to ./HomePage.jsx */

/**
 * MAIN APP COMPONENT (refactored)
 */
const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentPage, setCurrentPage] = useState("home");
  const [isSystemOpen, setIsSystemOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsSystemOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
    setIsAdmin(true);
  };

  const bannerImage =
    "http://googleusercontent.com/image_collection/image_retrieval/11889983225176544295";

  const renderContent = () => {
    switch (currentPage) {
      case "sys-health":
        return <SystemHealthPage />;
      case "home":
      default:
        return (
          <section className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-4 gap-8">
            <aside className="col-span-4 md:col-span-1 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-[0.2em] mb-4">
                  Dashboard
                </h3>
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      Status
                    </p>
                    <p className="text-sm font-semibold text-emerald-600">
                      Active Node
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      Uptime
                    </p>
                    <p className="text-sm font-semibold text-slate-700">
                      14.2 Days
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 shadow-sm">
                <h3 className="font-bold text-indigo-900 text-[10px] uppercase tracking-wider mb-2">
                  Notice
                </h3>
                <p className="text-indigo-700 text-xs leading-relaxed">
                  PostgreSQL migration complete. Reachability modules are
                  undergoing maintenance.
                </p>
              </div>
            </aside>

            <article className="col-span-4 md:col-span-3 space-y-8">
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-slate-800">
                    Recent Activities
                  </h2>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    SIT Node: Roika
                  </div>
                </div>
                <div className="space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex gap-4 p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all cursor-default group"
                    >
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-indigo-50 transition-colors">
                        <Settings className="w-6 h-6 text-slate-400 group-hover:text-indigo-500" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-base">
                          Database Update
                        </h4>
                        <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                          Verified persistent storage for user metadata on
                          PostgreSQL 15.
                        </p>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 block">
                          2 hours ago
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm group hover:border-indigo-200 transition-colors">
                  <h3 className="font-bold text-lg mb-2 text-slate-800">
                    Projects Gallery
                  </h3>
                  <p className="text-slate-500 text-sm mb-4">
                    Portfolios and Industrial PhD research metadata.
                  </p>
                  <button
                    onClick={() => setCurrentPage("projects")}
                    className="text-indigo-600 text-sm font-bold flex items-center gap-1 hover:underline"
                  >
                    Browse List <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm group hover:border-indigo-200 transition-colors">
                  <h3 className="font-bold text-lg mb-2 text-slate-800">
                    Family Network
                  </h3>
                  <p className="text-slate-500 text-sm mb-4">
                    Secure reachability directory for relatives.
                  </p>
                  <button
                    onClick={() => setCurrentPage("family")}
                    className="text-indigo-600 text-sm font-bold flex items-center gap-1 hover:underline"
                  >
                    View Directory <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </article>
          </section>
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
      <nav className="h-16 bg-white border-b sticky top-0 z-50 px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-8">
          <div
            className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center overflow-hidden cursor-pointer shadow-md"
            onClick={() => setCurrentPage("home")}
          >
            <div className="text-white font-bold text-xl italic tracking-tighter">
              HH
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <button
              onClick={() => setCurrentPage("projects")}
              className="hover:text-indigo-600 flex items-center gap-1 transition-colors"
            >
              <Briefcase className="w-4 h-4" /> Projects
            </button>
            <button
              onClick={() => setCurrentPage("family")}
              className="hover:text-indigo-600 flex items-center gap-1 transition-colors"
            >
              <Users className="w-4 h-4" /> Family
            </button>

            {/* ADMIN GUARD: Show System dropdown only to logged-in admins */}
            {isLoggedIn && isAdmin && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsSystemOpen(!isSystemOpen)}
                  className={`hover:text-indigo-600 flex items-center gap-1 transition-colors ${
                    isSystemOpen ? "text-indigo-600" : ""
                  }`}
                >
                  <Settings className="w-4 h-4" /> System{" "}
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${
                      isSystemOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isSystemOpen && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      onClick={() => {
                        setCurrentPage("sys-health");
                        setIsSystemOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2"
                    >
                      <Activity className="w-4 h-4" /> System Health
                    </button>
                    <button
                      onClick={() => {
                        setCurrentPage("sys-logs");
                        setIsSystemOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" /> Visit Logs
                    </button>
                    <button
                      onClick={() => {
                        setCurrentPage("sys-network");
                        setIsSystemOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2"
                    >
                      <Network className="w-4 h-4" /> Network Status
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
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-sm"
            >
              <LogIn className="w-4 h-4" /> Login
            </button>
          ) : (
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setCurrentPage("profile")}
            >
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">
                  Admin
                </p>
                <p className="text-sm font-semibold leading-none">Roy Byun</p>
              </div>
              <div className="w-10 h-10 rounded-full border-2 border-indigo-600 p-0.5 group-hover:bg-indigo-50 transition-colors shadow-sm">
                <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                  <User className="text-slate-500 w-6 h-6" />
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="flex-grow">
        <section className="w-full relative py-20 px-6 overflow-hidden bg-slate-900">
          <div className="absolute inset-0">
            <img
              src={bannerImage}
              alt="Hedgehog Family"
              className="w-full h-full object-cover opacity-40"
              onError={(e) => {
                e.target.src =
                  "https://images.unsplash.com/photo-1543333995-a78ee9e5420f?q=80&w=2070&auto=format&fit=crop";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/80 to-transparent"></div>
          </div>
          <div className="max-w-7xl mx-auto relative z-10 text-white">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 drop-shadow-md tracking-tight italic">
              HeptaHog
            </h1>
            <p className="text-indigo-100 text-lg max-w-2xl drop-shadow-sm font-medium">
              Centralized project management and relative contact system hosted
              on the private Roika Mini PC node.
            </p>
          </div>
        </section>

        {renderContent()}
      </main>

      <footer className="bg-white border-t border-slate-200 py-10 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center italic font-bold text-white text-xs">
              HH
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 uppercase tracking-tighter">
                HeptaHog Hub
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                SIT DEng Node: Roika
              </p>
            </div>
          </div>
          <div className="text-center md:text-right">
            <p className="text-xs text-slate-500 font-medium">
              © 2024 Roy Byun. Managed via GitHub Actions.
            </p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-[0.2em] font-bold">
              Computing Science | SIT
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
