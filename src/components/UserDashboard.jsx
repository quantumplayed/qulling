import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader, ClipboardList, ShieldCheck, Award, Eye, Calendar, User, Zap, ChevronRight, X } from 'lucide-react';
import { getSupabaseClient } from '../services/supabaseClient';
import { useNavigate } from 'react-router-dom';

const UserDashboard = ({ currentUser }) => {
    const navigate = useNavigate();
    const [pitches, setPitches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAudit, setSelectedAudit] = useState(null);

    useEffect(() => {
        fetchUserPitches();
    }, [currentUser]);

    const fetchUserPitches = async () => {
        setLoading(true);
        const supabase = getSupabaseClient();
        if (!supabase) {
            setLoading(false);
            return;
        }

        try {
            // Fetch papers table records where source = 'pitch' and user_id = currentUser.id
            const { data, error } = await supabase
                .from('papers')
                .select('*')
                .eq('source', 'pitch')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            // For completed audits, fetch annotations as well
            const pitchesWithAnnos = await Promise.all((data || []).map(async (p) => {
                if (p.status === 'completed') {
                    const { data: annos } = await supabase
                        .from('annotations')
                        .select('*')
                        .eq('paper_id', p.id);
                    return { ...p, annotations: annos || [] };
                }
                return { ...p, annotations: [] };
            }));

            setPitches(pitchesWithAnnos);
        } catch (error) {
            console.error("Failed to fetch user pitches:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white py-12 px-4 font-sans relative overflow-hidden">
            {/* Background neon glows */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.03)_0%,transparent_70%)] pointer-events-none" />
            <div className="absolute top-10 left-10 w-[500px] h-[500px] bg-emerald-500/5 dark:bg-emerald-950/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="container mx-auto max-w-5xl relative z-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12 border-b border-zinc-200 dark:border-white/10 pb-8">
                    <div>
                        <div className="flex items-center gap-3">
                            <Award className="text-emerald-500 dark:text-emerald-400" size={32} />
                            <h1 className="text-3xl font-black tracking-tighter uppercase text-zinc-900 dark:text-white">Verification Dashboard</h1>
                        </div>
                        <p className="text-[10px] text-zinc-500 dark:text-gray-500 uppercase tracking-widest font-mono mt-1">
                            Client Dashboard • Account: {currentUser.name || currentUser.email} • {currentUser.affiliation}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => navigate('/')}
                            className="supabase-btn-green px-4 py-2.5 rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                        >
                            <Zap size={13} /> Run New Pitch Analysis
                        </button>
                    </div>
                </header>

                {loading ? (
                    <div className="glass-panel p-20 flex flex-col items-center justify-center border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/40 rounded-3xl">
                        <Loader className="animate-spin text-emerald-500 dark:text-emerald-400 mb-4" size={36} />
                        <span className="text-sm font-mono text-zinc-400 dark:text-gray-500 uppercase tracking-widest">Loading Pitch Registry...</span>
                    </div>
                ) : pitches.length === 0 ? (
                    <div className="glass-panel p-16 text-center border-dashed border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/40 rounded-3xl flex flex-col items-center justify-center">
                        <ClipboardList size={48} className="text-zinc-400 dark:text-gray-600 mb-4" />
                        <h3 className="text-base font-black uppercase text-zinc-800 dark:text-white tracking-widest">No Pitch Audits Requested</h3>
                        <p className="text-xs text-zinc-500 dark:text-gray-505 mt-2 max-w-sm font-mono leading-relaxed">
                            You haven't requested any expert scientific audits yet. Paste your startup pitch on the main console and click "Request Expert Audit" after the AI run.
                        </p>
                        <button 
                            onClick={() => navigate('/')}
                            className="mt-6 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider text-[10px] rounded-xl dark:hover:bg-gray-200 transition-all cursor-pointer"
                        >
                            Go to Console
                        </button>
                    </div>
                ) : (
                    <div className="glass-panel p-6 sm:p-8 border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/40 rounded-3xl animate-in fade-in duration-500 text-left">
                        <div className="flex items-center gap-2 mb-6">
                            <ClipboardList className="text-emerald-500 dark:text-emerald-400" size={20} />
                            <h2 className="text-lg font-bold uppercase tracking-tight text-zinc-900 dark:text-white">Audit Request History</h2>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-zinc-200 dark:border-white/10 text-[9px] uppercase text-zinc-500 dark:text-gray-500 tracking-widest font-mono">
                                        <th className="pb-4 font-black">Startup Pitch / Claim</th>
                                        <th className="pb-4 font-black">Date Requested</th>
                                        <th className="pb-4 font-black">Verification Status</th>
                                        <th className="pb-4 font-black text-right">Audit Certificate</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {pitches.map(pitch => (
                                        <tr key={pitch.id} className="border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50/50 dark:hover:bg-white/[0.01] transition-all group">
                                            <td className="py-5 pr-6 max-w-md">
                                                <div className="font-bold text-zinc-800 dark:text-gray-200 line-clamp-1">{pitch.title}</div>
                                                <p className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono mt-1 line-clamp-1 italic">"{pitch.pdf_url || 'No document text attached'}"</p>
                                            </td>
                                            <td className="py-5 font-mono text-xs text-zinc-500 dark:text-gray-500 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={13} />
                                                    {new Date(pitch.created_at).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td className="py-5">
                                                <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase font-mono tracking-tighter ${
                                                    pitch.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                                    pitch.status === 'reviewing' ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400' :
                                                    pitch.status === 'assigned' ? 'bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 text-yellow-605 dark:text-yellow-400' :
                                                    'bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/5 text-zinc-500 dark:text-gray-400'
                                                }`}>
                                                    {pitch.status === 'completed' ? 'Certified' :
                                                     pitch.status === 'reviewing' ? 'Under Review' :
                                                     pitch.status === 'assigned' ? 'Assigned' : 'Pending Review'}
                                                </span>
                                            </td>
                                            <td className="py-5 text-right">
                                                {pitch.status === 'completed' ? (
                                                    <button
                                                        onClick={() => setSelectedAudit(pitch)}
                                                        className="supabase-btn-green px-3.5 py-1.5 rounded-lg text-[10px] uppercase tracking-widest inline-flex items-center gap-1.5 cursor-pointer"
                                                    >
                                                        <ShieldCheck size={12} /> View Certificate
                                                    </button>
                                                ) : (
                                                    <span className="text-[9px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-100 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 px-2 py-1 rounded">
                                                        Awaiting Audit
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Scientific Certificate Modal */}
            {selectedAudit && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/30 dark:bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/15 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 border-emerald-500/25 dark:border-emerald-500/20 shadow-emerald-500/5">
                        <header className="p-6 border-b border-zinc-100 dark:border-white/10 flex justify-between items-start bg-gradient-to-r from-emerald-500/5 dark:from-emerald-950/20 to-transparent">
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-full text-[9px] font-black uppercase tracking-wider font-mono">
                                <Award size={11} /> Scientific Feasibility Certified
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono">CASE: {selectedAudit.id}</span>
                            </div>
                            <h3 className="text-lg font-black text-zinc-900 dark:text-white leading-snug">Scientific Audit Certificate</h3>
                            <p className="text-xs text-zinc-500 dark:text-gray-400 font-mono mt-1">Pitch: "{selectedAudit.title.replace('Audit Request: ', '')}"</p>
                          </div>
                          <button 
                            onClick={() => setSelectedAudit(null)}
                            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-550 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white transition-all ml-4 cursor-pointer"
                          >
                            <X size={18} />
                          </button>
                        </header>

                        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 rounded-2xl">
                              <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono">Expert Auditor</span>
                              <h5 className="font-black text-sm text-zinc-800 dark:text-gray-200 mt-1">{selectedAudit.assessment?.reviewer_name}</h5>
                              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{selectedAudit.assessment?.reviewer_affiliation}</p>
                            </div>
                            <div className="p-4 bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 rounded-2xl flex justify-between items-center">
                              <div>
                                <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono">Verification Score</span>
                                <h5 className="font-mono font-black text-2xl text-emerald-600 dark:text-emerald-400 mt-1">{selectedAudit.assessment?.score}%</h5>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] uppercase font-bold text-zinc-500 font-mono">Verdict</span>
                                <div className="font-black text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mt-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-250 dark:border-emerald-500/20 rounded-lg">
                                  {selectedAudit.assessment?.verdict}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Executive Auditor Notes</span>
                            <div className="p-4 bg-zinc-50/50 dark:bg-black/40 border border-zinc-100 dark:border-white/5 rounded-2xl text-xs text-zinc-705 dark:text-gray-300 leading-relaxed font-mono whitespace-pre-line">
                              {selectedAudit.assessment?.notes}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider font-mono">Highlighted Claims & Expert Critiques ({selectedAudit.annotations?.length || 0})</span>
                            {selectedAudit.annotations && selectedAudit.annotations.length > 0 ? (
                              <div className="space-y-3">
                                {selectedAudit.annotations.map((ann, idx) => (
                                  <div key={idx} className="p-4 bg-zinc-50/40 dark:bg-white/[0.01] border border-zinc-100 dark:border-white/5 rounded-2xl flex flex-col gap-2.5">
                                    <div className="flex justify-between items-center border-b border-zinc-100 dark:border-white/5 pb-2 text-[9px] font-mono text-zinc-550 dark:text-gray-500 uppercase">
                                      <span>Annotated Passage</span>
                                    </div>
                                    <p className="text-xs text-zinc-650 dark:text-gray-400 italic leading-relaxed border-l-2 border-cyan-500/60 pl-3">
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
                              <div className="text-center py-8 border border-dashed border-zinc-200 dark:border-white/5 rounded-2xl text-zinc-400 dark:text-gray-600 italic text-xs font-mono">
                                No claims highlights were logged by the reviewer.
                              </div>
                            )}
                          </div>
                        </div>

                        <footer className="p-6 border-t border-zinc-100 dark:border-white/10 flex justify-end bg-zinc-50 dark:bg-black">
                          <button 
                            onClick={() => setSelectedAudit(null)}
                            className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider text-[10px] rounded-xl dark:hover:bg-gray-200 transition-all cursor-pointer font-mono"
                          >
                            Close Certificate View
                          </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserDashboard;
