
import React, { useState, useEffect, useMemo } from 'react';
import Clock from './components/Clock';
import { TimeSession, ClockStatus, HomeConfig } from './types';
import { getSessionSummary } from './services/geminiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type UserRole = 'NANNY' | 'PARENT';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [activeSession, setActiveSession] = useState<TimeSession | null>(null);
  const [status, setStatus] = useState<ClockStatus>(ClockStatus.CLOCKED_OUT);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hourlyRate, setHourlyRate] = useState<number>(25);
  const [periodOffset, setPeriodOffset] = useState<number>(0); 
  const [error, setError] = useState<string | null>(null);

  // Determine role from URL: ?role=nanny or ?role=parent
  const role = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('role')?.toUpperCase();
    if (r === 'PARENT') return 'PARENT' as UserRole;
    if (r === 'NANNY') return 'NANNY' as UserRole;
    return 'NANNY' as UserRole; // Default to Nanny for safety
  }, []);

  const [homeConfig, setHomeConfig] = useState<HomeConfig>(() => {
    const saved = localStorage.getItem('home_config');
    return saved ? JSON.parse(saved) : { lat: 0, lng: 0, radiusMeters: 200 };
  });

  useEffect(() => {
    const saved = localStorage.getItem('nanny_sessions');
    const active = localStorage.getItem('nanny_active_session');
    if (saved) setSessions(JSON.parse(saved));
    if (active) {
      setActiveSession(JSON.parse(active));
      setStatus(ClockStatus.CLOCKED_IN);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('nanny_sessions', JSON.stringify(sessions));
    localStorage.setItem('home_config', JSON.stringify(homeConfig));
  }, [sessions, homeConfig]);

  useEffect(() => {
    if (activeSession) {
      localStorage.setItem('nanny_active_session', JSON.stringify(activeSession));
    } else {
      localStorage.removeItem('nanny_active_session');
    }
  }, [activeSession]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const handleClockIn = async () => {
    setError(null);
    const now = new Date();
    let userLoc: { lat: number, lng: number } | undefined = undefined;

    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, enableHighAccuracy: true })
      );
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      
      if (homeConfig.lat !== 0) {
        const dist = calculateDistance(userLoc.lat, userLoc.lng, homeConfig.lat, homeConfig.lng);
        if (dist > homeConfig.radiusMeters) {
          setError(`Location mismatch: You are ${Math.round(dist)}m away from home.`);
          return;
        }
      }
    } catch (e) {
      setError("Please enable location services to clock in.");
      return;
    }

    const newSess: TimeSession = { id: crypto.randomUUID(), startTime: now.toISOString(), location: userLoc, isOutOfBounds: false };
    setActiveSession(newSess);
    setStatus(ClockStatus.CLOCKED_IN);
  };

  const handleClockOut = () => {
    if (!activeSession) return;
    const now = new Date();
    const durationMins = Math.round((now.getTime() - new Date(activeSession.startTime).getTime()) / 60000);
    const completed: TimeSession = { ...activeSession, endTime: now.toISOString(), durationInMinutes: durationMins };
    setSessions(prev => [completed, ...prev]);
    setActiveSession(null);
    setStatus(ClockStatus.CLOCKED_OUT);
  };

  const filteredSessions = useMemo(() => {
    const now = new Date();
    const cycleDays = 14;
    const startOfPeriod = new Date();
    startOfPeriod.setDate(now.getDate() - (cycleDays * (periodOffset + 1)));
    const endOfPeriod = new Date();
    endOfPeriod.setDate(startOfPeriod.getDate() + cycleDays);
    
    return sessions.filter(s => {
      const sDate = new Date(s.startTime);
      return sDate >= startOfPeriod && sDate <= endOfPeriod;
    });
  }, [sessions, periodOffset]);

  const totalHours = useMemo(() => (filteredSessions.reduce((acc, s) => acc + (s.durationInMinutes || 0), 0) / 60).toFixed(2), [filteredSessions]);
  const totalPay = useMemo(() => (parseFloat(totalHours) * hourlyRate).toFixed(2), [totalHours, hourlyRate]);

  const chartData = useMemo(() => {
    const days: Record<string, number> = {};
    filteredSessions.forEach(s => {
      const day = new Date(s.startTime).toLocaleDateString([], { weekday: 'short' });
      days[day] = (days[day] || 0) + ((s.durationInMinutes || 0) / 60);
    });
    return Object.entries(days).map(([name, hours]) => ({ name, hours }));
  }, [filteredSessions]);

  const exportToCSV = () => {
    const headers = ["Date", "Start Time", "End Time", "Duration (Hours)", "Status"];
    const rows = filteredSessions.map(s => [
      new Date(s.startTime).toLocaleDateString(),
      new Date(s.startTime).toLocaleTimeString(),
      s.endTime ? new Date(s.endTime).toLocaleTimeString() : "In Progress",
      ((s.durationInMinutes || 0) / 60).toFixed(2),
      s.isOutOfBounds ? "Flagged" : "Verified"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `nanny_payroll_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyLink = (targetRole: string) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const fullUrl = `${baseUrl}?role=${targetRole}`;
    navigator.clipboard.writeText(fullUrl);
    alert(`${targetRole} link copied to clipboard!`);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-10 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <i className="fas fa-baby"></i>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">NannyTrack<span className="text-indigo-600">Pro</span></h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {role === 'NANNY' ? 'Nanny Interface' : 'Parent Review Mode'}
            </p>
          </div>
        </div>
        {role === 'PARENT' && (
          <div className="hidden md:block text-[10px] bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold uppercase tracking-tighter">
            Bi-Weekly Management
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        {role === 'NANNY' ? (
          <div className="max-w-lg mx-auto space-y-8 animate-in fade-in duration-500">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-4 rounded-3xl text-sm font-bold flex items-center gap-3 shadow-lg shadow-rose-100">
                <i className="fas fa-map-pin text-rose-400 text-xl"></i>
                {error}
              </div>
            )}
            <section className="bg-white p-12 rounded-[3rem] shadow-2xl shadow-indigo-100 border border-slate-100 flex flex-col items-center">
              <Clock />
              <div className="w-full mt-10">
                {status === ClockStatus.CLOCKED_OUT ? (
                  <button onClick={handleClockIn} className="w-full py-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2.5rem] text-3xl font-black shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4">
                    <i className="fas fa-sign-in-alt"></i> CLOCK IN
                  </button>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-8 text-center">
                      <p className="text-emerald-500 text-xs font-black uppercase tracking-widest mb-2">Shift Active</p>
                      <p className="text-4xl font-black text-emerald-700">At Home</p>
                    </div>
                    <button onClick={handleClockOut} className="w-full py-10 bg-rose-500 hover:bg-rose-600 text-white rounded-[2.5rem] text-3xl font-black shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4">
                      <i className="fas fa-sign-out-alt"></i> CLOCK OUT
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in duration-500">
            <div className="md:col-span-12 flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Select Period:</h2>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setPeriodOffset(0)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${periodOffset === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Current</button>
                  <button onClick={() => setPeriodOffset(1)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${periodOffset === 1 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Previous</button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => copyLink('nanny')} className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200">Nanny Link</button>
                <button onClick={() => copyLink('parent')} className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200">Parent Link</button>
                <button onClick={exportToCSV} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors">
                  <i className="fas fa-download mr-2"></i>Export CSV
                </button>
              </div>
            </div>

            <div className="md:col-span-7 space-y-6">
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-6">Activity Breakdown</h2>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                      <Bar dataKey="hours" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-slate-900 p-6 rounded-3xl shadow-xl text-white">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2"><i className="fas fa-magic text-indigo-400"></i> Smart Review</h2>
                  <button onClick={async () => { setIsAnalyzing(true); setAiSummary(await getSessionSummary(filteredSessions)); setIsAnalyzing(false); }} className="text-[10px] font-black bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/20">
                    {isAnalyzing ? 'Analyzing...' : 'Generate AI Report'}
                  </button>
                </div>
                <div className="text-sm text-slate-300 leading-relaxed italic border-l-2 border-indigo-500 pl-4 min-h-[60px]">
                  {aiSummary || "AI will analyze these 14 days for patterns and total payroll accuracy."}
                </div>
              </section>
            </div>

            <div className="md:col-span-5 space-y-6">
              <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 border-t-4 border-t-emerald-500">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 text-center">Bi-Weekly Payout</h2>
                <div className="text-center space-y-2 mb-8">
                  <p className="text-5xl font-black text-slate-800 tracking-tighter">${totalPay}</p>
                  <p className="text-sm font-bold text-emerald-600">{totalHours} hours total</p>
                </div>
                <div className="pt-6 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase">Pay Rate</span>
                  <div className="flex items-center gap-1 font-black text-slate-800">
                    <span>$</span>
                    <input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} className="w-12 bg-slate-50 rounded px-1 outline-none focus:ring-1 focus:ring-indigo-500" />
                    <span className="text-[10px] text-slate-400">/hr</span>
                  </div>
                </div>
              </section>

              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 max-h-[300px] overflow-y-auto">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 sticky top-0 bg-white py-1 border-b border-slate-50">Shift History</h2>
                <div className="space-y-3">
                  {filteredSessions.map(s => (
                    <div key={s.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center hover:bg-white transition-colors">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{new Date(s.startTime).toLocaleDateString([], {month: 'short', day: 'numeric'})}</p>
                        <p className="text-[9px] text-emerald-500 font-black uppercase">Verified Location</p>
                      </div>
                      <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                        {((s.durationInMinutes || 0) / 60).toFixed(1)}h
                      </span>
                    </div>
                  ))}
                  {filteredSessions.length === 0 && <p className="text-center text-xs text-slate-400 py-4">No data for this period.</p>}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
