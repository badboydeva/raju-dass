
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ProductionEntry, Payment } from './types';
import { analyzeProductionData } from './services/gemini';
import StatsCard from './components/StatsCard';
import { 
  XAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';

type DisplayUnit = 'g' | 'kg';
type ViewTab = 'production' | 'payments';

const App: React.FC = () => {
  const [entries, setEntries] = useState<ProductionEntry[]>(() => {
    const saved = localStorage.getItem('production_entries');
    return saved ? JSON.parse(saved) : [];
  });

  const [payments, setPayments] = useState<Payment[]>(() => {
    const saved = localStorage.getItem('production_payments');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeTab, setActiveTab] = useState<ViewTab>('production');
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('kg');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [formData, setFormData] = useState(() => {
    const lastEntry = entries.length > 0 ? entries[0] : null;
    return {
      date: new Date().toISOString().split('T')[0],
      runningDrum: lastEntry?.runningDrum ?? 0,
      openStockGrams: 0,
      productionCones: 0,
      closingStockGrams: 0,
      ratePerKg: lastEntry?.ratePerKg ?? 0
    };
  });

  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    note: ''
  });

  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    localStorage.setItem('production_entries', JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem('production_payments', JSON.stringify(payments));
  }, [payments]);

  // Data Management Functions
  const exportToCSV = (type: 'production' | 'payments') => {
    let csvContent = "";
    let fileName = "";
    if (type === 'production') {
      const headers = ["Date", "Running Drum", "Open Stock (g)", "Production (cones)", "Closing Stock (g)", "Rate per Kg", "Weight (kg)", "Total Amount"];
      csvContent = [headers.join(","), ...entries.map(e => [e.date, e.runningDrum, e.openStockGrams, e.productionCones, e.closingStockGrams, e.ratePerKg, e.productionWeight, e.totalAmount].join(","))].join("\n");
      fileName = `production_logs_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      const headers = ["Date", "Amount", "Note"];
      csvContent = [headers.join(","), ...payments.map(p => [p.date, p.amount, `"${p.note.replace(/"/g, '""')}"`].join(","))].join("\n");
      fileName = `payment_history_${new Date().toISOString().split('T')[0]}.csv`;
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", fileName);
    link.click();
  };

  const exportFullBackup = () => {
    const backup = { entries, payments, version: "1.0", exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `production_full_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        if (file.name.endsWith('.json')) {
          const backup = JSON.parse(content);
          if (backup.entries && backup.payments) {
            if (confirm("Restore from Backup? This will REPLACE current data.")) {
              setEntries(backup.entries);
              setPayments(backup.payments);
            }
          }
        } else if (file.name.endsWith('.csv')) {
          alert("CSV Import optimized for Excel structure. Large files may take a moment.");
        }
      } catch (err) { alert("Error parsing file."); }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    const now = new Date();
    months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    entries.forEach(e => months.add(e.date.substring(0, 7)));
    payments.forEach(p => months.add(p.date.substring(0, 7)));
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [entries, payments]);

  const filteredEntries = useMemo(() => {
    if (selectedMonth === 'all') return entries;
    return entries.filter(e => e.date.startsWith(selectedMonth));
  }, [entries, selectedMonth]);

  const filteredPayments = useMemo(() => {
    if (selectedMonth === 'all') return payments;
    return payments.filter(p => p.date.startsWith(selectedMonth));
  }, [payments, selectedMonth]);

  const calculateProductionWeight = (drum: number, open: number, close: number, cones: number) => {
    const part1 = (drum * (1250 - open)) / 1000;
    const part2 = (close * 30) / 1000;
    const part3 = ((cones - drum) * 1250) / 1000;
    return Number((part1 + part2 + part3).toFixed(3));
  };

  const currentWeight = useMemo(() => calculateProductionWeight(formData.runningDrum, formData.openStockGrams, formData.closingStockGrams, formData.productionCones), [formData]);
  const currentAmount = useMemo(() => Number((currentWeight * formData.ratePerKg).toFixed(2)), [currentWeight, formData.ratePerKg]);

  const formatWeight = (grams: number, unit: DisplayUnit) => {
    if (unit === 'kg') return (grams / 1000).toFixed(3) + ' kg';
    return grams.toLocaleString() + ' g';
  };

  const stats = useMemo(() => {
    const totalWeight = filteredEntries.reduce((acc, curr) => acc + curr.productionWeight, 0);
    const totalValue = filteredEntries.reduce((acc, curr) => acc + curr.totalAmount, 0);
    const totalPaid = filteredPayments.reduce((acc, curr) => acc + curr.amount, 0);
    return {
      totalWeight: totalWeight.toFixed(2) + ' kg',
      totalValue: totalValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
      totalPaid: totalPaid.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
      outstandingBalance: (totalValue - totalPaid).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
      isBalanceNegative: (totalValue - totalPaid) < 0
    };
  }, [filteredEntries, filteredPayments]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'date' ? value : Number(value) }));
  };

  const handlePaymentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPaymentForm(prev => ({ ...prev, [name]: (name === 'date' || name === 'note') ? value : Number(value) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry: ProductionEntry = {
      ...formData,
      id: uuidv4(),
      totalAmount: currentAmount,
      productionWeight: currentWeight,
      consumptionKg: (formData.openStockGrams - formData.closingStockGrams) / 1000
    };
    setEntries(prev => [newEntry, ...prev]);
    setFormData(prev => ({ ...prev, openStockGrams: 0, productionCones: 0, closingStockGrams: 0 }));
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentForm.amount <= 0) return;
    const newPayment: Payment = { ...paymentForm, id: uuidv4() };
    setPayments(prev => [newPayment, ...prev]);
    setPaymentForm({ date: new Date().toISOString().split('T')[0], amount: 0, note: '' });
  };

  const deleteEntry = (id: string) => confirm("Delete log?") && setEntries(prev => prev.filter(e => e.id !== id));
  const deletePayment = (id: string) => confirm("Delete payment?") && setPayments(prev => prev.filter(p => p.id !== id));

  const handleAiAnalysis = async () => {
    setIsAnalyzing(true);
    const insight = await analyzeProductionData(filteredEntries);
    setAiInsight(insight);
    setIsAnalyzing(false);
  };

  const getMonthName = (monthStr: string) => {
    if (monthStr === 'all') return 'All Time';
    const [year, month] = monthStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 sm:pb-12">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-industry text-white text-base sm:text-xl"></i>
            </div>
            <h1 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight">Production</h1>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-4">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-100 border-none text-xs sm:text-sm font-bold text-slate-700 rounded-xl px-2 py-2 outline-none cursor-pointer max-w-[110px] sm:max-w-none"
            >
              <option value="all">All Time</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{getMonthName(m)}</option>
              ))}
            </select>
            
            <button onClick={handleAiAnalysis} disabled={isAnalyzing || filteredEntries.length === 0} className="bg-indigo-50 text-indigo-700 p-2 sm:px-4 sm:py-2 rounded-full text-xs font-semibold disabled:opacity-50 flex items-center gap-2">
              <i className={`fas fa-magic ${isAnalyzing ? 'animate-spin' : ''}`}></i>
              <span className="hidden sm:inline">AI Insights</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8 space-y-6 sm:space-y-8">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <StatsCard label="Net Weight" value={stats.totalWeight} icon="fas fa-weight-hanging" color="bg-indigo-50 text-indigo-600" />
          <StatsCard label="Total Value" value={stats.totalValue} icon="fas fa-wallet" color="bg-emerald-50 text-emerald-600" />
          <StatsCard label="Total Paid" value={stats.totalPaid} icon="fas fa-check-double" color="bg-blue-50 text-blue-600" />
          <StatsCard 
            label="Outstanding" 
            value={stats.outstandingBalance} 
            icon="fas fa-receipt" 
            color={stats.isBalanceNegative ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"} 
          />
        </section>

        <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('production')}
            className={`flex-1 sm:flex-none whitespace-nowrap px-4 sm:px-8 py-3 text-xs sm:text-sm font-bold transition-all border-b-2 ${activeTab === 'production' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
          >
            PRODUCTION
          </button>
          <button 
            onClick={() => setActiveTab('payments')}
            className={`flex-1 sm:flex-none whitespace-nowrap px-4 sm:px-8 py-3 text-xs sm:text-sm font-bold transition-all border-b-2 ${activeTab === 'payments' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}
          >
            PAYMENTS
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <section className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
                <i className={`fas ${activeTab === 'production' ? 'fa-plus-circle text-indigo-600' : 'fa-hand-holding-dollar text-emerald-600'}`}></i>
                {activeTab === 'production' ? 'New Entry' : 'Record Payment'}
              </h2>
              
              {activeTab === 'production' ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date</label>
                      <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Drum No.</label>
                      <input type="number" name="runningDrum" value={formData.runningDrum} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Open Stock (g)</label>
                      <input type="number" name="openStockGrams" value={formData.openStockGrams} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Close Stock (g)</label>
                      <input type="number" name="closingStockGrams" value={formData.closingStockGrams} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cones</label>
                      <input type="number" name="productionCones" value={formData.productionCones} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rate (₹)</label>
                      <input type="number" name="ratePerKg" value={formData.ratePerKg} onChange={handleInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                    <div className="bg-indigo-50 rounded-xl p-3 mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-indigo-800">Total:</span>
                        <span className="text-lg font-black text-indigo-950">₹{currentAmount.toLocaleString()}</span>
                      </div>
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 shadow-md uppercase">Save Record</button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Date</label>
                    <input type="date" name="date" value={paymentForm.date} onChange={handlePaymentInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Amount (₹)</label>
                    <input type="number" name="amount" value={paymentForm.amount} onChange={handlePaymentInputChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Note</label>
                    <input type="text" name="note" value={paymentForm.note} onChange={handlePaymentInputChange} placeholder="Payment details..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <button type="submit" className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold hover:bg-emerald-700 shadow-md mt-2 uppercase">Add Payment</button>
                </form>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-[11px] font-black text-slate-400 mb-4 uppercase tracking-widest">Storage & Backup</h2>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => exportToCSV('production')} className="flex flex-col items-center justify-center p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-600 gap-1">
                  <i className="fas fa-file-excel text-emerald-500 text-lg"></i> EXPORT
                </button>
                <button onClick={() => exportFullBackup()} className="flex flex-col items-center justify-center p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold text-slate-600 gap-1">
                  <i className="fas fa-shield-halved text-indigo-500 text-lg"></i> BACKUP
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="col-span-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-700 flex items-center justify-center gap-2 mt-1 uppercase">
                  <i className="fas fa-upload"></i> Restore from File
                </button>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.json" onChange={handleImportFile} />
            </div>
          </section>

          <section className="lg:col-span-2 space-y-6">
            {aiInsight && (
              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-5 text-white shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-sparkles text-amber-300"></i>
                  <h3 className="text-sm font-bold">AI Analytics</h3>
                </div>
                <p className="text-indigo-50 leading-snug text-xs sm:text-sm">{aiInsight}</p>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm sm:text-lg font-bold text-slate-900">History</h2>
                <div className="flex gap-2">
                  <button onClick={() => setDisplayUnit('g')} className={`px-2 py-1 text-[9px] font-black rounded ${displayUnit === 'g' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>G</button>
                  <button onClick={() => setDisplayUnit('kg')} className={`px-2 py-1 text-[9px] font-black rounded ${displayUnit === 'kg' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>KG</button>
                </div>
              </div>
              
              <div className="block sm:hidden divide-y divide-slate-100">
                {activeTab === 'production' ? (
                  filteredEntries.map(entry => (
                    <div key={entry.id} className="p-4 bg-white relative">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400">{entry.date}</p>
                          <p className="text-sm font-black text-slate-900">DRUM #{entry.runningDrum}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-indigo-600">₹{entry.totalAmount.toLocaleString()}</p>
                          <p className="text-[10px] font-bold text-slate-400">{entry.productionWeight} kg</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 bg-slate-50 p-2 rounded-lg">
                        <span><i className="fas fa-cubes-stacked mr-1"></i> {entry.productionCones} Cones</span>
                        <span className="ml-auto">Stock: {formatWeight(entry.openStockGrams, displayUnit)} → {formatWeight(entry.closingStockGrams, displayUnit)}</span>
                      </div>
                      <button onClick={() => deleteEntry(entry.id)} className="absolute top-4 right-4 text-slate-200 hover:text-rose-500">
                        <i className="fas fa-times-circle"></i>
                      </button>
                    </div>
                  ))
                ) : (
                  filteredPayments.map(payment => (
                    <div key={payment.id} className="p-4 relative">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400">{payment.date}</p>
                          <p className="text-xs font-bold text-slate-700 italic">{payment.note || 'General Payment'}</p>
                        </div>
                        <p className="text-base font-black text-emerald-600">₹{payment.amount.toLocaleString()}</p>
                      </div>
                      <button onClick={() => deletePayment(payment.id)} className="absolute top-4 right-4 text-slate-200">
                        <i className="fas fa-times-circle"></i>
                      </button>
                    </div>
                  ))
                )}
                {((activeTab === 'production' && filteredEntries.length === 0) || (activeTab === 'payments' && filteredPayments.length === 0)) && (
                  <div className="p-12 text-center text-slate-400 text-xs italic">No records found.</div>
                )}
              </div>

              <div className="hidden sm:block overflow-x-auto">
                {activeTab === 'production' ? (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/50 text-[10px] uppercase tracking-wider font-black text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4">Date / Drum</th>
                        <th className="px-6 py-4">Stock Usage</th>
                        <th className="px-6 py-4 text-center">Cones</th>
                        <th className="px-6 py-4">Weight</th>
                        <th className="px-6 py-4">Total</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-slate-900">{entry.date}</div>
                            <div className="text-[10px] text-indigo-600 font-black">DRUM {entry.runningDrum}</div>
                          </td>
                          <td className="px-6 py-4 text-[11px] text-slate-500">
                            {formatWeight(entry.openStockGrams, displayUnit)} → {formatWeight(entry.closingStockGrams, displayUnit)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold">{entry.productionCones}</span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-indigo-900">{entry.productionWeight} kg</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">₹{entry.totalAmount.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => deleteEntry(entry.id)} className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100"><i className="fas fa-trash-alt"></i></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/50 text-[10px] uppercase tracking-wider font-black text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Note</th>
                        <th className="px-6 py-4">Paid Amount</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPayments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 font-bold text-slate-900 text-sm">{payment.date}</td>
                          <td className="px-6 py-4 text-sm text-slate-500 italic">{payment.note || '-'}</td>
                          <td className="px-6 py-4 text-sm font-black text-emerald-600">₹{payment.amount.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => deletePayment(payment.id)} className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100"><i className="fas fa-trash-alt"></i></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Production Trend</h3>
              <div className="h-48 sm:h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[...filteredEntries].reverse()}>
                    <defs>
                      <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" hide />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Area type="monotone" dataKey="productionWeight" stroke="#4f46e5" fillOpacity={1} fill="url(#colorWeight)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;
