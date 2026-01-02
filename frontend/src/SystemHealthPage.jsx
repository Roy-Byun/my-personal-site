import React, { useState, useEffect } from "react";
import { Cpu, HardDrive, Activity } from "lucide-react";

const SystemHealthPage = () => {
  const [stats, setStats] = useState({ cpu: 0, ram: 0, disk: 0 });

  useEffect(() => {
    const fetchStats = () => {
      fetch("/api/system-stats")
        .then((res) => res.json())
        .then((data) =>
          setStats({ cpu: data.cpu_usage, ram: data.memory, disk: data.disk })
        );
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <Cpu className="text-indigo-500 mb-2" />
        <h3 className="text-sm font-bold text-slate-400 uppercase">
          CPU Usage
        </h3>
        <p className="text-2xl font-bold text-slate-800">{stats.cpu}%</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <Activity className="text-emerald-500 mb-2" />
        <h3 className="text-sm font-bold text-slate-400 uppercase">
          RAM Usage
        </h3>
        <p className="text-2xl font-bold text-slate-800">{stats.ram}%</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <HardDrive className="text-amber-500 mb-2" />
        <h3 className="text-sm font-bold text-slate-400 uppercase">
          Disk Space
        </h3>
        <p className="text-2xl font-bold text-slate-800">{stats.disk}%</p>
      </div>
    </div>
  );
};

export default SystemHealthPage;
