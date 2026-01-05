import React, { useState, useEffect } from "react";
import { Cpu, HardDrive, Activity, Clock, Database } from "lucide-react";

const SystemHealthPage = () => {
  // 1. Updated state to include new metrics
  const [stats, setStats] = useState({
    cpu: 0,
    ram: 0,
    disk: 0,
    uptime: 0,
    db_status: "Checking...",
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/system-stats");
      const data = await response.json();

      // 2. Map new backend keys to state
      setStats({
        cpu: data.cpu_usage,
        ram: data.memory,
        disk: data.disk,
        uptime: data.uptime,
        db_status: data.db_status,
      });
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch system stats:", error);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const StatCard = ({ icon: Icon, title, value, unit = "%", color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <Icon className={`${color} mb-2 w-6 h-6`} />
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        {title}
      </h3>
      <p className="text-2xl font-bold text-slate-800">
        {value}
        {unit}
      </p>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        System Health Monitor
      </h2>

      {/* Primary Hardware Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          icon={Cpu}
          title="CPU Load"
          value={stats.cpu}
          color="text-indigo-500"
        />
        <StatCard
          icon={Activity}
          title="RAM Usage"
          value={stats.ram}
          color="text-emerald-500"
        />
        <StatCard
          icon={HardDrive}
          title="Disk Space"
          value={stats.disk}
          color="text-amber-500"
        />
      </div>

      {/* Secondary Status Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Uptime Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <Clock className="text-slate-500 w-6 h-6" />
          </div>
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              System Uptime
            </h3>
            <p className="text-xl font-bold text-slate-800">
              {stats.uptime} Hours
            </p>
          </div>
        </div>

        {/* Database Status Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <Database className="text-slate-500 w-6 h-6" />
          </div>
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

export default SystemHealthPage;
