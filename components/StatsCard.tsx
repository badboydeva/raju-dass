
import React from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
  color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon, trend, color }) => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
      <div>
        <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        {trend && (
          <p className="mt-2 text-xs font-semibold text-emerald-600">
            <i className="fas fa-arrow-up mr-1"></i> {trend}
          </p>
        )}
      </div>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <i className={`${icon} text-lg`}></i>
      </div>
    </div>
  );
};

export default StatsCard;
