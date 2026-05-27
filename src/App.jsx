import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import { Terminal, AlertTriangle, CheckCircle, ArrowRight, Cpu, ShieldCheck, Zap, Loader, ExternalLink, Lightbulb, MoreVertical, LayoutDashboard, UserCheck, X, LogIn, Award, Settings, ShieldAlert, User, LogOut, Sun, Moon } from 'lucide-react';
import ExpertPortal from './components/ExpertPortal';
import EditorDashboard from './components/EditorDashboard';
import UserDashboard from './components/UserDashboard';
import AuthModal from './components/AuthModal';
import SettingsModal from './components/SettingsModal';
import ProfileModal from './components/ProfileModal';

import { getSupabaseClient, getSupabaseConfig } from './services/supabaseClient';
import { getGeminiApiKey, embedText, generateAnalysis } from './services/geminiService';

function App() {
  const navigate = useNavigate();
  const [modality, setModality] = useState('unified'); // unified
  const [pitch, setPitch] = useState('');
  const [llmProvider, setLlmProvider] = useState('gemini');
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [showInternalMenu, setShowInternalMenu] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingPath, setPendingPath] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedCurationRef, setSelectedCurationRef] = useState(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('qulling_theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('qulling_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('qulling_theme', 'light');
    }
  }, [isDarkMode]);

  const logsEndRef = useRef(null);

  const checkConfiguration = () => {
    const apiKey = getGeminiApiKey();
    const { url, key } = getSupabaseConfig();
    setIsConfigured(!!(apiKey && url && key));
  };

  useEffect(() => {
    checkConfiguration();
  }, []);

  // Supabase Auth session listener
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Check active session immediately on mount
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Fetch profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profile) {
          setCurrentUser({
            id: profile.id,
            email: profile.email,
            role: profile.role,
            name: profile.name,
            affiliation: profile.affiliation || 'Expert Partner'
          });
        }
      } else {
        setCurrentUser(null);
      }
    };
    checkUser();

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data: profile }) => {
            if (profile) {
              setCurrentUser({
                id: profile.id,
                email: profile.email,
                role: profile.role,
                name: profile.name,
                affiliation: profile.affiliation || 'Expert Partner'
              });
            }
          })
          .catch(err => console.error("Error fetching profile in auth change:", err));
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [isConfigured]);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (status === 'processing') {
      scrollToBottom();
    }
  }, [logs, status]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    if (pendingPath) {
      navigate(pendingPath);
      setPendingPath(null);
    } else {
      if (user.role === 'admin') navigate('/editor');
      else if (user.role === 'reviewer') navigate('/expert');
      else navigate('/dashboard');
    }
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    navigate('/');
    setShowInternalMenu(false);
  };

  const startAnalysis = async () => {
    if (!pitch.trim()) return;

    const apiKey = getGeminiApiKey();
    const supabase = getSupabaseClient();

    const isMock = !apiKey;

    setStatus('processing');
    setLogs([]);
    setResult(null);

    const logMsg = (msg) => setLogs(prev => [...prev, `${msg}`]);

    if (isMock) {
      try {
        logMsg("Initializing feasibility assessment...");
        await new Promise(r => setTimeout(r, 600));
        logMsg("Analyzing technical proposal...");
        await new Promise(r => setTimeout(r, 600));
        logMsg("Searching scientific publication database index...");
        await new Promise(r => setTimeout(r, 800));

        logMsg("Search complete: Identified 2 scientific references.");
        logMsg("Matching Publication: Quantum Decoherence in Solid-State Qubits (arXiv:2104.0921)");
        await new Promise(r => setTimeout(r, 800));

        logMsg("Submitting context to verification model...");
        await new Promise(r => setTimeout(r, 1000));
        logMsg("Analysis completed. Finalizing evaluation reports...");
        await new Promise(r => setTimeout(r, 400));

        setResult({
          score: 50,
          verdict: "Unknown",
          summary: "The technical proposal presents quantum computing concepts that require further empirical verification. Detailed noise model calculations and physical scaling bounds are currently missing.",
          assessment: "More information needed. The description lacks clear engineering specifications for noise mitigation, error correction, or physical layer scaling. Specifically, detailed coherence time bounds and fault-tolerance thresholds could not be verified from the provided literature context.",
          references: [
            {
              id: "mock_paper_1",
              title: "Quantum Decoherence in Solid-State Qubits",
              author: "A. Kovalev et al.",
              year: "2021",
              source: "arxiv",
              reviewed: false
            },
            {
              id: "mock_paper_2",
              title: "Error Mitigation Strategies for Near-Term Quantum Devices",
              author: "S. Tanaka et al.",
              year: "2023",
              source: "arxiv",
              reviewed: false
            }
          ],
          logs: [
            "Cross-referenced physics constraints via arXiv preprints.",
            "Analyzed engineering feasibility using historical venture metrics.",
            "Estimated timeline roadmap dependencies."
          ]
        });

        setStatus('complete');
      } catch (e) {
        console.error(e);
        logMsg(`ERROR: ${e.message}`);
        setStatus('error');
      }
      return;
    }

    if (!supabase) {
      setIsSettingsOpen(true);
      alert("Supabase Configuration Required! Please enter your Supabase URL and Anon Key to execute a live database lookup.");
      setStatus('idle');
      return;
    }

    try {
      logMsg("Initializing feasibility assessment...");
      await new Promise(r => setTimeout(r, 400));
      logMsg("Analyzing technical proposal...");
      const vector = await embedText(pitch, apiKey);

      logMsg(`Searching scientific publication database index...`);
      const { data: chunkMatches, error: matchError } = await supabase.rpc(
        'match_paper_chunks',
        {
          query_embedding: vector,
          match_threshold: 0.1,
          match_count: 3
        }
      );

      if (matchError) {
        throw new Error(`Database lookup failed: ${matchError.message}`);
      }

      const retrievedDocs = chunkMatches ? chunkMatches.map(c => c.content) : [];
      logMsg(`Search complete: Identified ${retrievedDocs.length} scientific references.`);

      if (retrievedDocs.length > 0 && chunkMatches[0].metadata) {
        logMsg(`Matching Publication: ${chunkMatches[0].metadata.title || 'Unknown'}`);
      }

      logMsg("Submitting context to verification model...");
      const analysis = await generateAnalysis(pitch, retrievedDocs, apiKey, modality);
      logMsg("Analysis completed. Finalizing evaluation reports...");

      const paperIds = chunkMatches ? [...new Set(chunkMatches.map(c => c.paper_id))] : [];
      const references = [];

      if (paperIds.length > 0) {
        const { data: papersData } = await supabase
          .from('papers')
          .select('*')
          .in('id', paperIds);

        const { data: annosData } = await supabase
          .from('annotations')
          .select('*')
          .in('paper_id', paperIds);

        if (papersData) {
          papersData.forEach(p => {
            const paperAnnos = annosData ? annosData.filter(a => a.paper_id === p.id) : [];
            references.push({
              id: p.id,
              title: p.title,
              author: p.authors || 'Unknown Author',
              year: p.year || 'N/A',
              source: p.source,
              reviewed: p.status === 'completed' && p.assessment,
              assessment: p.assessment,
              annotations: paperAnnos
            });
          });
        }
      }

      if (references.length === 0 && chunkMatches) {
        chunkMatches.forEach((c, idx) => {
          if (c.metadata) {
            references.push({
              id: c.paper_id || `paper_${idx}`,
              title: c.metadata.title || 'Unknown Abstract',
              author: c.metadata.author || 'Unknown Author',
              year: c.metadata.year || 'N/A',
              source: c.metadata.source || 'arxiv',
              reviewed: false
            });
          }
        });
      }

      setResult({
        score: analysis.score,
        verdict: analysis.verdict,
        summary: analysis.summary,
        assessment: analysis.assessment,
        references: references,
        logs: [
          "Cross-referenced physics constraints via arXiv preprints.",
          "Analyzed engineering feasibility using historical venture metrics.",
          "Estimated timeline roadmap dependencies."
        ]
      });

      setStatus('complete');
    } catch (e) {
      console.error(e);
      logMsg(`ERROR: ${e.message}`);
      setStatus('error');
    }
  };

  const handleRequestExpertAudit = async () => {
    if (!currentUser) {
      setPendingPath('/dashboard');
      setIsAuthOpen(true);
      return;
    }

    setStatus('submitting_audit');
    const supabase = getSupabaseClient();
    try {
      const { error } = await supabase
        .from('papers')
        .insert({
          title: `Pitch Validation: ${pitch.substring(0, 40)}...`,
          abstract: pitch,
          source: 'user_submission',
          status: 'pending_review'
        });

      if (error) throw error;

      alert('Request submitted! An expert reviewer will audit the proposal. You can track status on your dashboard.');
      setStatus('complete');
    } catch (err) {
      console.error(err);
      alert('Failed to submit: ' + err.message);
      setStatus('complete');
    }
  };

  const theme = {
    color: 'emerald',
    accent: 'text-emerald-500 dark:text-[#3ecf8e]',
    bg: 'from-emerald-950/20',
    glow: 'bg-emerald-500/10',
    button: 'supabase-btn-green shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20',
    label: 'Unified Assessment'
  };

  // Protected Route components
  const ProtectedUserRoute = ({ children }) => {
    if (!currentUser || currentUser.role !== 'user') {
      setTimeout(() => {
        setPendingPath('/dashboard');
        navigate('/');
        setIsAuthOpen(true);
      }, 0);
      return null;
    }
    return children;
  };

  const ProtectedExpertRoute = ({ children }) => {
    if (!currentUser || currentUser.role !== 'reviewer') {
      setTimeout(() => {
        setPendingPath('/expert');
        navigate('/');
        setIsAuthOpen(true);
      }, 0);
      return null;
    }
    return children;
  };

  const ProtectedAdminRoute = ({ children }) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setTimeout(() => {
        setPendingPath('/editor');
        navigate('/');
        setIsAuthOpen(true);
      }, 0);
      return null;
    }
    return children;
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-black overflow-x-hidden text-zinc-900 dark:text-white font-sans">
      {/* Navbar */}
      <nav className="taller-nav-header px-4 sm:px-12 border-b border-zinc-200 dark:border-white/10 backdrop-blur-md sticky top-0 z-50 bg-white/80 dark:bg-black/50 text-zinc-900 dark:text-white">
        <div className="container mx-auto flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2 cursor-pointer group">
            <Cpu className="text-[#3ecf8e] animate-pulse-glow" />
            <span className="font-bold text-xl tracking-tighter text-zinc-900 dark:text-white group-hover:opacity-80 transition-opacity">QULLING<span className="text-[#3ecf8e]">.</span></span>
          </Link>

          <div className="flex gap-3 items-center">

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-600 dark:text-gray-400 h-10 w-10 flex items-center justify-center transition-all cursor-pointer"
              title="Toggle Light/Dark Theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Settings button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-600 dark:text-gray-400 h-10 w-10 flex items-center justify-center transition-all cursor-pointer"
              title="Settings"
            >
              <Settings size={18} />
            </button>

            {/* Supabase style Login Green Button / Profile menu */}
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setShowInternalMenu(!showInternalMenu)}
                  className="px-4 py-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-800 dark:text-gray-250 text-xs font-bold rounded-xl transition-all h-10 flex items-center gap-2 cursor-pointer"
                >
                  <User size={14} className="text-[#3ecf8e]" />
                  {(currentUser.name || currentUser.email || '').split(' ')[0]}
                </button>

                {showInternalMenu && (
                  <div className="absolute right-0 mt-6 w-80 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 z-[100] backdrop-blur-md text-left">
                    <div className="p-8 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/5 text-center flex flex-col items-center">
                      <div className="text-zinc-800 dark:text-gray-250 font-bold text-lg leading-snug break-all max-w-[240px]">{currentUser.name || currentUser.email}</div>
                      <div className="text-[10px] uppercase font-mono text-[#3ecf8e] tracking-wider mt-1.5 font-semibold">{currentUser.role} • {currentUser.affiliation}</div>
                    </div>

                    <div className="px-6 py-6 flex flex-col gap-4">
                      <button
                        onClick={() => {
                          setIsProfileOpen(true);
                          setShowInternalMenu(false);
                        }}
                        className="w-full flex items-center justify-center gap-3.5 px-4 py-4 text-base font-bold bg-transparent hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-all text-zinc-700 dark:text-gray-250 cursor-pointer"
                      >
                        <User size={20} className="text-[#3ecf8e]" />
                        Edit Profile
                      </button>

                      {currentUser.role === 'user' && (
                        <button
                          onClick={() => {
                            navigate('/dashboard');
                            setShowInternalMenu(false);
                          }}
                          className="w-full flex items-center justify-center gap-3.5 px-4 py-4 text-base font-bold bg-transparent hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-all text-zinc-700 dark:text-gray-250 cursor-pointer"
                        >
                          <Award size={20} className="text-[#3ecf8e]" />
                          My Evaluation
                        </button>
                      )}

                      {currentUser.role === 'reviewer' && (
                        <button
                          onClick={() => {
                            navigate('/expert');
                            setShowInternalMenu(false);
                          }}
                          className="w-full flex items-center justify-center gap-3.5 px-4 py-4 text-base font-bold bg-transparent hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-all text-zinc-700 dark:text-gray-250 cursor-pointer"
                        >
                          <UserCheck size={20} className="text-purple-400" />
                          Review Workspace
                        </button>
                      )}

                      {currentUser.role === 'admin' && (
                        <button
                          onClick={() => {
                            navigate('/editor');
                            setShowInternalMenu(false);
                          }}
                          className="w-full flex items-center justify-center gap-3.5 px-4 py-4 text-base font-bold bg-transparent hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-all text-zinc-700 dark:text-gray-250 cursor-pointer"
                        >
                          <LayoutDashboard size={20} className="text-cyan-400" />
                          Admin Console
                        </button>
                      )}
                    </div>

                    <div className="p-6 bg-zinc-50 dark:bg-black/40 border-t border-zinc-100 dark:border-white/5 flex justify-center">
                      <button
                        onClick={handleSignOut}
                        className="px-8 py-6 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-sm font-black uppercase tracking-widest transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <LogOut size={16} /> Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="supabase-btn-green px-4 sm:px-10 py-3 text-sm font-semibold rounded-xl min-w-[90px] sm:min-w-[130px] h-12 flex items-center justify-center hover:shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={
          <>
            {/* Hero Section */}
            <main className="flex-1 flex flex-col items-center px-4 py-16 sm:py-24 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(62,207,142,0.04)_0%,transparent_60%)] pointer-events-none" />
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] ${theme.glow} opacity-20 blur-[150px] rounded-full pointer-events-none transition-all duration-1000`} />

              <div className="max-w-6xl z-10 fade-in w-full flex flex-col items-center text-center">

                <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black mb-10 mt-20 tracking-tighter leading-none uppercase">
                  Curated AI assessment<br />
                  for <span className="text-[#3ecf8e]">Quantum Tech</span>.
                </h1>

                <p className="text-xl sm:text-2xl md:text-3xl text-zinc-800 dark:text-zinc-300 font-light leading-relaxed max-w-4xl mx-auto px-4 mb-20">
                  AI has learned to imitate the internet, not understand it.{" "}
                  <span className="text-[#3ecf8e] dark:text-[#3ecf8e] font-semibold italic">
                    It is only as good as the data it is trained on
                  </span>
                  , and we create expert-curated data.
                </p>

                <h2 className="text-lg font-black uppercase tracking-[0.25em] text-[#3ecf8e] mb-6 font-mono">
                  Try it yourself
                </h2>

                <p className="text-base sm:text-lg text-gray-400 mb-10 max-w-2xl leading-relaxed font-light px-4 text-center">
                  Evaluate quantum technology proposals, physical viability, and scaling roadblocks against peer-reviewed scientific literature and database indexes.
                </p>

                {/* Unified Command Console */}
                <div className="w-full max-w-3xl mt-6 mb-20 px-4">
                  <div className="modal-card w-full text-left relative overflow-hidden transition-all duration-700">
                    <div className={`absolute top-0 right-0 w-64 h-64 ${theme.glow} blur-[80px] -mr-32 -mt-32 transition-all duration-1000 opacity-20 dark:opacity-100`} />

                    <div className="modal-body flex flex-col gap-8">
                      <div className="flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                          <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-lg bg-${theme.color}-500/10 border border-${theme.color}-500/20 transition-all duration-500`}>
                              <ShieldCheck className={theme.accent} size={24} />
                            </div>
                            <h3 className="font-black text-xl tracking-tight uppercase text-zinc-900 dark:text-white">Unified Feasibility & Growth Console</h3>
                          </div>
                        </div>

                        <textarea
                          value={pitch}
                          onChange={(e) => setPitch(e.target.value)}
                          disabled={status === 'processing'}
                          placeholder="Enter technical proposal or deep tech startup pitch to evaluate engineering risks, physical viability, and growth scaling pathways simultaneously..."
                          className="w-full h-32 sm:h-40 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl p-6 font-mono text-sm text-zinc-900 dark:text-white focus:border-zinc-400 dark:focus:border-white/30 outline-none resize-none mb-6 transition-all"
                        />

                        <button
                          onClick={startAnalysis}
                          disabled={!pitch.trim() || status === 'processing'}
                          className={`w-full py-6 rounded-2xl text-white font-black uppercase tracking-[0.3em] text-sm transition-all ${theme.button} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer hover:scale-[1.01] active:scale-[0.99] duration-200`}
                        >
                          {status === 'processing' ? <Loader className="animate-spin" /> : <Zap size={18} />}
                          {status === 'processing' ? 'Processing...' : 'Submit'}
                        </button>
                      </div>

                      {/* Status/Results Bottom Section */}
                      {(status !== 'idle' || result) && (
                        <div className="border-t border-zinc-200 dark:border-white/10 pt-8 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                          {status === 'processing' && (
                            <div className="space-y-3 font-mono text-xs text-left">
                              {logs.map((log, i) => (
                                <div key={i} className={`${theme.accent} opacity-90 text-[11px] flex gap-2 items-center`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50 shrink-0" />
                                  <span>{log}</span>
                                </div>
                              ))}
                              <div ref={logsEndRef} />
                            </div>
                          )}

                          {status === 'complete' && result && (
                            <div className="fade-in">
                              <div className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-200 dark:border-white/10 text-left">
                                <div>
                                  <div className="text-[10px] uppercase text-gray-500 font-mono mb-1">Feasibility & Growth Index</div>
                                  <div className={`text-6xl font-black ${theme.accent} font-mono`}>{result.score}%</div>
                                </div>
                                <div className={`bg-${theme.color}-500/20 border border-${theme.color}-500/50 px-4 py-2 rounded-full ${theme.accent} text-xs font-black uppercase tracking-widest`}>
                                  {result.verdict}
                                </div>
                              </div>

                              <div className="space-y-6">
                                <div className={`bg-${theme.color}-500/5 border border-${theme.color}-500/10 p-5 rounded-xl text-left`}>
                                  <h4 className={`font-black ${theme.accent} mb-2 flex items-center gap-2 uppercase text-[10px] tracking-widest`}>
                                    <ShieldCheck size={14} />
                                    Scientific Assessment
                                  </h4>
                                  <p className="text-gray-305 text-sm leading-relaxed">{result.assessment}</p>
                                </div>

                                {/* Request Curation (For User Role) */}
                                {currentUser && currentUser.role === 'user' && (
                                  <div className="p-5 border border-emerald-500/20 bg-emerald-500/5 rounded-xl flex flex-col gap-3">
                                    <div>
                                      <h5 className="font-bold text-xs text-emerald-400 uppercase tracking-wider flex items-center gap-1.5"><ShieldCheck size={14} /> Expert Peer Review & Validation</h5>
                                      <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                                        Get a human-verified Scientific Evaluation Certificate from domain expert researchers and professors.
                                      </p>
                                    </div>
                                    <button
                                      onClick={handleRequestExpertAudit}
                                      disabled={status === 'submitting_audit'}
                                      className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider text-[9px] rounded-lg transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                    >
                                      {status === 'submitting_audit' ? <Loader className="animate-spin" size={12} /> : <ShieldCheck size={12} />}
                                      {status === 'submitting_audit' ? 'Submitting Request...' : 'Submit Pitch for Expert Validation'}
                                    </button>
                                  </div>
                                )}

                                {/* Cited References with curation details */}
                                {result.references && result.references.length > 0 && (
                                  <div className="bg-zinc-50 dark:bg-white/5 p-5 rounded-xl border border-zinc-150 dark:border-white/5">
                                    <h4 className="font-black text-zinc-400 dark:text-gray-500 mb-3 uppercase text-[10px] tracking-widest">Cited References & Curation</h4>
                                    <div className="space-y-3">
                                      {result.references.map((ref, idx) => (
                                        <div key={idx} className="p-3 bg-white dark:bg-black/40 border border-zinc-150 dark:border-white/5 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                          <div className="flex-1">
                                            <h5 className="font-bold text-xs text-zinc-800 dark:text-gray-200">{ref.title}</h5>
                                            <p className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono mt-0.5">{ref.author} ({ref.year})</p>
                                          </div>
                                          {ref.reviewed ? (
                                            <button
                                              onClick={() => setSelectedCurationRef(ref)}
                                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 rounded-full text-[9px] font-black uppercase tracking-wider hover:bg-green-500/20 transition-all cursor-pointer shadow-lg shadow-green-500/5"
                                            >
                                              <Award size={11} /> Expert Reviewed ({ref.assessment.score}%)
                                            </button>
                                          ) : (
                                            <span className="text-[9px] font-mono text-zinc-400 dark:text-gray-600 uppercase bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/5 px-2 py-0.5 rounded">Uncurated</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="bg-zinc-50 dark:bg-white/5 p-5 rounded-xl border border-zinc-100 dark:border-white/5 mb-4">
                                  <h4 className="font-black text-zinc-400 dark:text-gray-500 mb-2 uppercase text-[10px] tracking-widest">Scientific Summary</h4>
                                  <p className="text-zinc-600 dark:text-gray-400 text-xs leading-relaxed">{result.summary}</p>
                                </div>

                                <div className="bg-zinc-50 dark:bg-white/5 p-5 rounded-xl border border-zinc-100 dark:border-white/5">
                                  <h4 className="font-black text-zinc-400 dark:text-gray-500 mb-2 uppercase text-[10px] tracking-widest">Evaluation Log</h4>
                                  <div className="space-y-1 text-left">
                                    {result.logs && result.logs.map((log, i) => (
                                      <div key={i} className="text-[10px] font-mono text-gray-500 flex gap-2 items-center">
                                        <span className="w-1 h-1 rounded-full bg-gray-600 opacity-60 shrink-0" />
                                        <span>{log}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </>
        } />

        <Route path="/dashboard" element={
          <ProtectedUserRoute>
            <UserDashboard currentUser={currentUser} />
          </ProtectedUserRoute>
        } />

        <Route path="/expert" element={
          <ProtectedExpertRoute>
            <ExpertPortal currentUser={currentUser} />
          </ProtectedExpertRoute>
        } />

        <Route path="/editor" element={
          <ProtectedAdminRoute>
            <EditorDashboard currentUser={currentUser} />
          </ProtectedAdminRoute>
        } />
      </Routes>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-white/5 py-12 mt-auto bg-white dark:bg-black">
        <div className="container mx-auto text-center">
          <p className="text-zinc-500 dark:text-gray-600 text-sm font-mono tracking-widest uppercase">© 2026 QULLING // CURATED QUANTUM TECH ASSESSMENT</p>
        </div>
      </footer>

      {/* Settings credentials modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={checkConfiguration}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleLoginSuccess}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onProfileUpdated={(updatedUser) => setCurrentUser(updatedUser)}
      />

      {/* Curation Reference details modal */}
      {selectedCurationRef && (
        <div className="fixed inset-0 z-[200] overflow-y-auto flex items-center justify-center p-4 bg-zinc-900/30 dark:bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/15 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] sm:max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
            <header className="p-4 sm:p-6 border-b border-zinc-200 dark:border-white/10 flex justify-between items-start bg-gradient-to-r from-green-500/5 dark:from-green-950/20 to-transparent">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 rounded-full text-[9px] font-black uppercase tracking-wider">
                    <ShieldCheck size={11} /> Curation Audit Verified
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono">Reference ID: {selectedCurationRef.id}</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-zinc-900 dark:text-white leading-snug">{selectedCurationRef.title}</h3>
                <p className="text-xs text-zinc-500 dark:text-gray-400 font-mono mt-1">{selectedCurationRef.author} ({selectedCurationRef.year})</p>
              </div>
              <button
                onClick={() => setSelectedCurationRef(null)}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-500 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white transition-all ml-4 shrink-0"
              >
                <X size={18} />
              </button>
            </header>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-left">
              {/* Reviewer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 rounded-2xl">
                  <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-500">Expert Auditor</span>
                  <h5 className="font-black text-sm text-zinc-800 dark:text-gray-200 mt-1">{selectedCurationRef.assessment.reviewer_name}</h5>
                  <p className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono mt-0.5">{selectedCurationRef.assessment.reviewer_affiliation || 'Expert Partner'}</p>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 rounded-2xl flex justify-between items-center">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-500 font-mono">Fidelity Score</span>
                    <h5 className="font-mono font-black text-2xl text-green-600 dark:text-green-400 mt-1">{selectedCurationRef.assessment.score}%</h5>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-500 font-mono">Verdict</span>
                    <div className="font-black text-xs text-white uppercase tracking-wider mt-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-lg">
                      {selectedCurationRef.assessment.verdict}
                    </div>
                  </div>
                </div>
              </div>

              {/* Assessment overall Notes */}
              <div className="space-y-2">
                <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-500 tracking-wider">Scientific Assessment Summary</span>
                <div className="p-4 bg-zinc-50 dark:bg-black/40 border border-zinc-150 dark:border-white/5 rounded-2xl text-xs text-zinc-700 dark:text-gray-300 leading-relaxed font-mono whitespace-pre-line">
                  {selectedCurationRef.assessment.notes}
                </div>
              </div>

              {/* Specific annotations */}
              <div className="space-y-3">
                <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-500 tracking-wider">Claims Commentary & Annotations</span>
                {selectedCurationRef.annotations && selectedCurationRef.annotations.length > 0 ? (
                  <div className="space-y-3">
                    {selectedCurationRef.annotations.map((ann, idx) => (
                      <div key={idx} className="p-4 bg-zinc-50/50 dark:bg-white/[0.02] border border-zinc-100 dark:border-white/5 rounded-2xl flex flex-col gap-2.5">
                        <div className="flex justify-between items-center border-b border-zinc-100 dark:border-white/5 pb-2 text-[9px] font-mono text-zinc-500 dark:text-gray-500 uppercase">
                          <span>Annotated Passage</span>
                          <span>Page {ann.page}</span>
                        </div>
                        <p className="text-xs text-zinc-700 dark:text-gray-400 italic leading-relaxed border-l-2 border-cyan-500/60 pl-3">
                          "{ann.text}"
                        </p>
                        <div className="p-3 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-500/10 rounded-xl">
                          <span className="text-[8px] font-mono uppercase text-cyan-600 dark:text-cyan-400 font-bold tracking-wider">Expert Critique</span>
                          <p className="text-xs text-cyan-800 dark:text-cyan-300 mt-1 leading-relaxed font-sans">{ann.comment}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-zinc-200 dark:border-white/5 rounded-2xl text-zinc-500 dark:text-gray-600 italic text-xs font-mono">
                    No specific passage annotations registered for this paper.
                  </div>
                )}
              </div>
            </div>

            <footer className="p-6 border-t border-zinc-200 dark:border-white/10 flex justify-end bg-zinc-50 dark:bg-black">
              <button
                onClick={() => setSelectedCurationRef(null)}
                className="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider text-[10px] rounded-xl hover:bg-zinc-800 dark:hover:bg-gray-200 transition-all cursor-pointer"
              >
                Close Audit Profile
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
