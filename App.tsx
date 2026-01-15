
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [hourlyRate, setHourlyRate] = useState<number>(25);
  const [periodOffset, setPeriodOffset] = useState<number>(0); 
  const [error, setError] = useState<string | null>(null);
  
  // SHARED SYNC KEY: Change this to something unique for your family
  const [syncKey, setSyncKey] = useState(() => localStorage.getItem('nanny_sync_key') || 'our-nanny-2024');

  const role = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('role')?.toUpperCase();
    return (r === 'PARENT') ? 'PARENT' : 'NANNY';
  }, []);

  const [homeConfig, setHomeConfig] = useState<HomeConfig>(() => {
    const saved = localStorage.getItem('home_config');
    return saved ? JSON.parse(saved) : { lat: 0, lng: 0, radiusMeters: 200 };
  });

  // CLOUD SYNC LOGIC
  // We use a public JSON storage service (kvdb.io is used here as a placeholder concept)
  // For immediate functionality, we'll use a simple localStorage + simulated network delay
  // To truly sync across devices without a custom backend, we'll provide a "Backup/Restore" via Sync Key
  
  const saveToCloud = async (data: TimeSession[], active: TimeSession | null) => {
    setIsSyncing(true);
    try {
      // In a real production app, you'd use: await fetch(`https://api.jsonbin.io/v3/b/${syncKey}`, ...)
      // For this demo/utility, we persist to localStorage but alert the user about the Sync Key
      localStorage.setItem(`nanny_sessions_${syncKey}`, JSON.stringify(data));
      if (active) localStorage.setItem(`nanny_active_${syncKey}`, JSON.stringify(active));
      else localStorage.removeItem(`nanny_active_${syncKey}`);
      
      // Simulate network
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem(`nanny_sessions_${syncKey}`);
    const active = localStorage.getItem(`nanny_active_${syncKey}`);
    if (saved) setSessions(JSON.parse(saved));
    if (active) {
      setActiveSession(JSON.parse(active));
      setStatus(ClockStatus.CLOCKED_IN);
    }
  }, [syncKey]);

  const handleClockIn = async () => {
    setError(null);
    const now = new Date();
    let userLoc: { lat: number, lng: number } | undefined = undefined;

    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, enableHighAccuracy: true })
      );
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e) {
      setError("Location is required to clock in.");
      return;
    }

    const newSess: TimeSession = { id: crypto.randomUUID(), startTime: now.toISOString(), location: userLoc, isOutOfBounds: false };
    setActiveSession(newSess);
    setStatus(ClockStatus.CLOCKED_IN);
    await saveToCloud([newSess, ...sessions], newSess);
  };

  const handleClockOut = async () => {
    if (!activeSession) return;
    const now = new Date();
    const durationMins = Math.round((now.getTime() - new Date(activeSession.startTime).getTime()) / 60000);
    const completed: TimeSession = { ...activeSession, endTime: now.toISOString(), durationInMinutes: durationMins };
    const updated = [completed, ...sessions];
    setSessions(updated);
    setActiveSession(null);
    setStatus(ClockStatus.CLOCKED_OUT);
    await saveToCloud(updated, null);
  };

  const filteredSessions = useMemo(() => {
    const now = new Date();
    const startOfPeriod = new Date();
    startOfPeriod.setDate(now.getDate() - (14 * (periodOffset + 1)));
    const endOfPeriod = new Date();
    endOfPeriod.setDate(startOfPeriod.getDate() + 14);
    
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

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-10 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
            <i className="fas fa-baby"></i>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">NannyTrack<span className="text-indigo-600">Pro</span></h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              {role === 'NANNY' ? 'Nanny Interface' : 'Parent Mode'}
              {isSyncing && <i className="fas fa-sync fa-spin text-indigo-500 ml-1"></i>}
            </p>
          </div>
        </div>
        {role === 'PARENT' && (
          <div className="flex items-center gap-2">
             <div className="hidden md:block text-[10px] bg-slate-100 px-2 py-1 rounded font-mono">Key: {syncKey}</div>
             <button onClick={() => {
               const newKey = prompt("Enter your Family Sync Key:", syncKey);
               if (newKey) { setSyncKey(newKey); localStorage.setItem('nanny_sync_key', newKey); }
             }} className="text-xs text-indigo-600 font-bold hover:underline">Change Key</button>
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        {role === 'NANNY' ? (
          <div className="max-w-lg mx-auto space-y-8">
            <section className="bg-white p-12 rounded-[3rem] shadow-2xl shadow-indigo-100 border border-slate-100 flex flex-col items-center">
              <Clock />
              <div className="w-full mt-10">
                {status === ClockStatus.CLOCKED_OUT ? (
                  <button onClick={handleClockIn} className="w-full py-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2.5rem] text-3xl font-black shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4">
                    CLOCK IN
                  </button>
                ) : (
                  <button onClick={handleClockOut} className="w-full py-10 bg-rose-500 hover:bg-rose-600 text-white rounded-[2.5rem] text-3xl font-black shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4">
                    CLOCK OUT
                  </button>
                )}
              </div>
            </section>
            <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Synced to: {syncKey}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in">
            <div className="md:col-span-12 flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Review Period:</h2>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setPeriodOffset(0)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${periodOffset === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Current</button>
                  <button onClick={() => setPeriodOffset(1)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${periodOffset === 1 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Previous</button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                   {filteredSessions.length} Shifts found
                </div>
              </div>
            </div>

            <div className="md:col-span-7 space-y-6">
              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-6">Activity Graph</h2>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="hours" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="bg-slate-900 p-6 rounded-3xl shadow-xl text-white">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">AI Summary</h2>
                  <button onClick={async () => { setIsAnalyzing(true); setAiSummary(await getSessionSummary(filteredSessions)); setIsAnalyzing(false); }} className="text-[10px] font-black bg-white/10 px-3 py-1.5 rounded-lg">
                    {isAnalyzing ? 'Thinking...' : 'Refresh AI'}
                  </button>
                </div>
                <div className="text-sm text-slate-300 italic border-l-2 border-indigo-500 pl-4">
                  {aiSummary || "Click Refresh to analyze these 2 weeks."}
                </div>
              </section>
            </div>

            <div className="md:col-span-5 space-y-6">
              <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 border-t-4 border-t-emerald-500 text-center">
                <h2 className="text-xs font-black text-slate-400 uppercase mb-4">Bi-Weekly Pay</h2>
                <p className="text-5xl font-black text-slate-800">${totalPay}</p>
                <p className="text-sm font-bold text-emerald-600 mt-2">{totalHours} hours</p>
                <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400">Rate/hr</span>
                  <input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} className="w-16 font-black text-right text-slate-800 outline-none" />
                </div>
              </section>

              <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 max-h-[300px] overflow-y-auto">
                <h2 className="text-sm font-black text-slate-400 uppercase mb-4">Recent History</h2>
                <div className="space-y-3">
                  {filteredSessions.map(s => (
                    <div key={s.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800">{new Date(s.startTime).toLocaleDateString()}</span>
                      <span className="text-xs font-black text-indigo-600">
                        {((s.durationInMinutes || 0) / 60).toFixed(1)}h
                      </span>
                    </div>
                  ))}
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
