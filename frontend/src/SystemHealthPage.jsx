import React, { useState, useEffect } from "react";
import { Cpu, HardDrive, Activity, Clock } from "lucide-react";

const SystemHealthPage = () => {
  const [stats, setStats] = useState({ cpu: 0, ram: 0, disk: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/system-stats");
      const data = await response.json();
      setStats({
        cpu: data.cpu_usage,
        ram: data.memory,
        disk: data.disk,
      });
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch system stats:", error);
    }
  };

  useEffect(() => {
    fetchStats(); // Initial fetch
    const interval = setInterval(fetchStats, 3000); // Update every 3 seconds
    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  const StatCard = ({ icon: Icon, title, value, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <Icon className={`${color} mb-2 w-6 h-6`} />
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        {title}
      </h3>
      <p className="text-2xl font-bold text-slate-800">{value}%</p>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        System Health Monitor
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
    </div>
  );
};

export default SystemHealthPage;
