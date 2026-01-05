import React, { useState, useEffect, useRef } from "react";
import {
  Cpu,
  HardDrive,
  Activity,
  Clock,
  Database,
  AlertCircle,
} from "lucide-react";

const SystemHealthPage = () => {
  const [stats, setStats] = useState({
    cpu: 0,
    ram: 0,
    disk: 0,
    uptime_formatted: "0m",
    boot_time: "",
    db_status: "Checking...",
    raw_uptime: 0,
  });
  const [showAlert, setShowAlert] = useState(false);
  const prevUptime = useRef(0);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/system-stats");
      const data = await response.json();

      // Alert Logic: Trigger if system has been up for less than 10 mins (600s)
      // and it's a fresh load or the uptime reset.
      if (data.raw_uptime < 600 && data.raw_uptime < prevUptime.current) {
        setShowAlert(true);
      }
      prevUptime.current = data.raw_uptime;

      setStats(data);
    } catch (error) {
      console.error("Failed to fetch system stats:", error);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Reboot Alert */}
      {showAlert && (
        <div className="mb-6 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-500" />
            <p className="text-amber-800 font-medium text-sm">
              System recently rebooted. Last boot: {stats.boot_time}
            </p>
          </div>
          <button
            onClick={() => setShowAlert(false)}
            className="text-amber-500 hover:text-amber-700 text-sm font-bold"
          >
            DISMISS
          </button>
        </div>
      )}

      <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center md:text-left">
        System Health Monitor
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          icon={Cpu}
          title="CPU Load"
          value={stats.cpu_usage}
          color="text-indigo-500"
        />
        <StatCard
          icon={Activity}
          title="RAM Usage"
          value={stats.memory}
          color="text-emerald-500"
        />
        <StatCard
          icon={HardDrive}
          title="Disk Space"
          value={stats.disk}
          color="text-amber-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <Clock className="text-slate-400 w-8 h-8" />
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              System Uptime
            </h3>
            <p className="text-xl font-bold text-slate-800">
              {stats.uptime_formatted}
            </p>
            <p className="text-[10px] text-slate-400">
              Booted: {stats.boot_time}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <Database className="text-slate-400 w-8 h-8" />
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Database Connection
            </h3>
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  stats.db_status === "Connected"
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <p className="text-xl font-bold text-slate-800">
                {stats.db_status}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, title, value, color }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
    <Icon className={`${color} mb-2 w-6 h-6`} />
    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
      {title}
    </h3>
    <p className="text-2xl font-bold text-slate-800">{value}%</p>
  </div>
);

export default SystemHealthPage;
