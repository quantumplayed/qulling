import React, { useState, useEffect } from 'react';
import { ArrowLeft, LayoutDashboard, Users, Shield, Zap, Loader, ClipboardList, CheckCircle, Clock, AlertTriangle, Eye, Award, Upload, X, FileText } from 'lucide-react';
import { getSupabaseClient } from '../services/supabaseClient';
import { getGeminiApiKey } from '../services/geminiService';
import { ingestPaper } from '../services/pdfParser';

const EditorDashboard = ({ currentUser }) => {
    const [papers, setPapers] = useState([]);
    const [reviewers, setReviewers] = useState([]);
    const [allProfiles, setAllProfiles] = useState([]);
    const [updatingRoleId, setUpdatingRoleId] = useState(null);
    const [stats, setStats] = useState({ paper_count: 0, chunk_count: 0 });
    const [activeTab, setActiveTab] = useState('papers'); // papers, pitches, stats, users
    const [loading, setLoading] = useState(true);
    const [assigningId, setAssigningId] = useState(null);
    const [selectedReviewerForPaper, setSelectedReviewerForPaper] = useState({});
    const [selectedPaperDetails, setSelectedPaperDetails] = useState(null);
    
    // Upload Modal states
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState('');
    const [authors, setAuthors] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchPapers(),
                fetchReviewers(),
                fetchStats(),
                fetchAllProfiles()
            ]);
        } catch (error) {
            console.error("Failed to fetch dashboard data from Supabase:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAllProfiles = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        setAllProfiles(data || []);
    };

    const handleUpdateUserRole = async (userId, newRole) => {
        setUpdatingRoleId(userId);
        const supabase = getSupabaseClient();
        if (!supabase) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;
            
            // Update local state immediately
            setAllProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
            
            // Refresh reviewer roster
            await fetchReviewers();
        } catch (error) {
            console.error("Error updating profile role:", error);
            alert("Database Error: Failed to update user role. Please ensure you have run the updated RLS SQL policy.");
        } finally {
            setUpdatingRoleId(null);
        }
    };

    const fetchPapers = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        
        const { data, error } = await supabase
            .from('papers')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        setPapers(data || []);
        
        // Initialize default selected reviewer for dropdowns
        const initialSelected = {};
        data?.forEach(p => {
            if (p.assigned_to) {
                initialSelected[p.id] = p.assigned_to;
            }
        });
        setSelectedReviewerForPaper(initialSelected);
    };

    const fetchReviewers = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'reviewer');

        if (error) throw error;
        setReviewers(data || []);
    };

    const fetchStats = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        // Fetch counts directly using count query
        const { count: papersCount, error: papersErr } = await supabase
            .from('papers')
            .select('*', { count: 'exact', head: true })
            .neq('source', 'pitch'); // count actual research papers only for stats
            
        const { count: chunksCount, error: chunksErr } = await supabase
            .from('paper_chunks')
            .select('*', { count: 'exact', head: true });

        const { count: pitchesCount, error: pitchesErr } = await supabase
            .from('papers')
            .select('*', { count: 'exact', head: true })
            .eq('source', 'pitch');

        if (papersErr || chunksErr || pitchesErr) {
            console.error("Stats count query failed:", papersErr || chunksErr || pitchesErr);
            return;
        }

        setStats({
            paper_count: papersCount || 0,
            chunk_count: chunksCount || 0,
            pitch_count: pitchesCount || 0
        });
    };

    const handleAssignReviewer = async (paperId) => {
        const reviewer = selectedReviewerForPaper[paperId];
        if (!reviewer) return;

        setAssigningId(paperId);
        const supabase = getSupabaseClient();
        
        try {
            const { error } = await supabase
                .from('papers')
                .update({ 
                    assigned_to: reviewer,
                    status: 'assigned' 
                })
                .eq('id', paperId);

            if (error) throw error;
            await fetchPapers();
        } catch (error) {
            console.error("Error assigning paper in Supabase:", error);
            alert("Database Error: Failed to save assignment.");
        } finally {
            setAssigningId(null);
        }
    };

    const handleReviewerChange = (paperId, value) => {
        setSelectedReviewerForPaper(prev => ({
            ...prev,
            [paperId]: value
        }));
    };

    const handleUploadPaper = async (e) => {
        e.preventDefault();
        if (!file) return;

        const supabase = getSupabaseClient();
        const geminiKey = getGeminiApiKey();

        if (!supabase || !geminiKey) {
            alert("System configuration missing. Please ensure Supabase URL/Key and Gemini API Key are set in settings.");
            return;
        }

        setUploading(true);
        setUploadProgress('Initializing...');

        try {
            await ingestPaper(
                file,
                title.trim(),
                authors.trim(),
                year,
                supabase,
                geminiKey,
                (progress) => setUploadProgress(progress)
            );

            setFile(null);
            setTitle('');
            setAuthors('');
            setYear(new Date().getFullYear());
            setShowUploadModal(false);
            
            await fetchData();
        } catch (error) {
            console.error("PDF upload failure:", error);
            alert(`Ingestion Failed: ${error.message || 'Check storage bucket permissions.'}`);
        } finally {
            setUploading(false);
            setUploadProgress('');
        }
    };

    const filteredPapers = papers.filter(p => p.source !== 'pitch');
    const filteredPitches = papers.filter(p => p.source === 'pitch');

    const countStatus = (status) => papers.filter(p => p.status === status).length;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white py-20 px-8 sm:px-16 font-sans relative overflow-hidden">
            {/* Background neon glows */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.05)_0%,transparent_70%)] pointer-events-none" />
            <div className="absolute top-10 left-10 w-[500px] h-[500px] bg-cyan-500/5 dark:bg-cyan-955/20 blur-[120px] rounded-full pointer-events-none" />

            <div className="container mx-auto max-w-7xl relative z-10">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-20 border-b border-zinc-200 dark:border-white/10 pb-12">
                    <div>
                        <div className="flex items-center gap-3">
                            <LayoutDashboard className="text-cyan-600 dark:text-cyan-400" size={32} />
                            <h1 className="text-3xl font-black tracking-tighter uppercase text-zinc-900 dark:text-white">Editor Admin Dashboard</h1>
                        </div>
                        <p className="text-[10px] text-zinc-500 dark:text-gray-550 uppercase tracking-widest font-mono mt-1.5">
                            Platform Management Console • Admin: {currentUser.name || currentUser.email}
                        </p>
                    </div>
                    <div className="flex gap-4">
                        {/* PDF Upload button relocated inside Research Literature section header */}
                    </div>
                </header>                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-20">
                    <div className="p-10 border border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] rounded-3xl shadow-sm">
                        <div className="text-zinc-500 dark:text-gray-400 text-[10px] uppercase font-bold tracking-[0.2em] mb-2 font-mono">Knowledge Papers</div>
                        <div className="text-3xl font-black text-zinc-900 dark:text-white">{stats.paper_count} <span className="text-[10px] text-zinc-400 dark:text-gray-600 font-mono uppercase font-normal">Files</span></div>
                    </div>
                    <div className="p-10 border border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] rounded-3xl shadow-sm">
                        <div className="text-zinc-500 dark:text-gray-400 text-[10px] uppercase font-bold tracking-[0.2em] mb-2 font-mono">Vector Chunks</div>
                        <div className="text-3xl font-black text-cyan-650 dark:text-cyan-400">{stats.chunk_count} <span className="text-[10px] text-zinc-400 dark:text-gray-600 font-mono uppercase font-normal">Segments</span></div>
                    </div>
                    <div className="p-10 border border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] rounded-3xl shadow-sm">
                        <div className="text-emerald-600 dark:text-emerald-500 text-[10px] uppercase font-bold tracking-[0.2em] mb-2 font-mono">Startup Audits</div>
                        <div className="text-3xl font-black text-emerald-555 dark:text-emerald-400">{stats.pitch_count || 0} <span className="text-[10px] text-zinc-400 dark:text-gray-600 font-mono uppercase font-normal">Requests</span></div>
                    </div>
                    <div className="p-10 border border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] rounded-3xl shadow-sm">
                        <div className="text-green-605 dark:text-green-500 text-[10px] uppercase font-bold tracking-[0.2em] mb-2 font-mono">Evaluations Done</div>
                        <div className="text-3xl font-black text-green-600 dark:text-green-400">{countStatus('completed')}</div>
                    </div>
                    <div className="p-10 border border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] rounded-3xl shadow-sm col-span-2 md:col-span-1">
                        <div className="text-purple-600 dark:text-purple-500 text-[10px] uppercase font-bold tracking-[0.2em] mb-2 font-mono">Expert Reviewers</div>
                        <div className="text-3xl font-black text-purple-600 dark:text-purple-400">{reviewers.length}</div>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex flex-wrap gap-6 mb-20 bg-zinc-100/60 dark:bg-zinc-950/60 p-4 rounded-[24px] w-fit border border-zinc-200 dark:border-white/10">
                    <button
                        onClick={() => setActiveTab('papers')}
                        className={`px-12 py-5 rounded-[16px] text-sm font-black uppercase tracking-[0.2em] transition-all cursor-pointer ${activeTab === 'papers' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/25' : 'text-zinc-500 hover:text-zinc-955 dark:text-gray-400 dark:hover:text-white'}`}
                    >
                        Research Literature
                    </button>
                    <button
                        onClick={() => setActiveTab('pitches')}
                        className={`px-12 py-5 rounded-[16px] text-sm font-black uppercase tracking-[0.2em] transition-all cursor-pointer ${activeTab === 'pitches' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/25' : 'text-zinc-500 hover:text-zinc-955 dark:text-gray-400 dark:hover:text-white'}`}
                    >
                        Startup Audit Pipelines
                    </button>
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`px-12 py-5 rounded-[16px] text-sm font-black uppercase tracking-[0.2em] transition-all cursor-pointer ${activeTab === 'stats' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/25' : 'text-zinc-500 hover:text-zinc-955 dark:text-gray-400 dark:hover:text-white'}`}
                    >
                        Active Reviewer Roster
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-12 py-5 rounded-[16px] text-sm font-black uppercase tracking-[0.2em] transition-all cursor-pointer ${activeTab === 'users' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/25' : 'text-zinc-500 hover:text-zinc-955 dark:text-gray-400 dark:hover:text-white'}`}
                    >
                        User Directory & Roles
                    </button>
                </div>

                {loading ? (
                    <div className="p-24 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl">
                        <Loader className="animate-spin text-cyan-600 dark:text-cyan-400 mb-4" size={36} />
                        <span className="text-xs font-mono text-zinc-400 dark:text-gray-500 uppercase tracking-widest font-bold">Loading Supabase Registry...</span>
                    </div>
                ) : (
                    <>
                        {activeTab === 'papers' && (
                            <div className="relative p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10 border-b border-zinc-100 dark:border-white/5 pb-6 sm:pr-64">
                                    <div className="flex items-center gap-3">
                                        <ClipboardList className="text-cyan-600 dark:text-cyan-400" size={24} />
                                        <h2 className="text-2xl font-bold uppercase tracking-tight text-zinc-900 dark:text-white">Literature Evaluation Assignments</h2>
                                    </div>
                                    <button
                                        onClick={() => setShowUploadModal(true)}
                                        className="sm:absolute sm:top-12 sm:right-12 w-full sm:w-auto px-8 py-5 bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-cyan-500/25 hover:scale-[1.02] active:scale-[0.98] duration-200"
                                    >
                                        <span className="text-lg font-black leading-none">+</span> Upload & Index PDF
                                    </button>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-200 dark:border-white/10 text-[10px] uppercase text-zinc-550 dark:text-gray-550 tracking-widest font-mono">
                                                <th className="pb-6 font-black">Paper Details</th>
                                                <th className="pb-6 font-black">Source</th>
                                                <th className="pb-6 font-black">Status</th>
                                                <th className="pb-6 font-black">Assigned Reviewer</th>
                                                <th className="pb-6 font-black text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm">
                                            {filteredPapers.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="py-24 text-center text-zinc-400 dark:text-gray-600 italic font-mono text-xs">No papers cataloged in database. Click 'Upload & Index PDF' to add one.</td>
                                                </tr>
                                            ) : (
                                                filteredPapers.map(paper => (
                                                    <tr key={paper.id} className="border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50/50 dark:hover:bg-white/[0.01] transition-all group">
                                                        <td className="py-8 pr-4 max-w-sm">
                                                            <div className="font-bold text-zinc-800 dark:text-gray-250 line-clamp-1 text-base">{paper.title}</div>
                                                            <div className="text-[11px] text-zinc-500 dark:text-gray-500 font-mono mt-1.5 line-clamp-1">{paper.authors} ({paper.year})</div>
                                                        </td>
                                                        <td className="py-8 font-mono text-xs uppercase text-zinc-500 dark:text-gray-550">
                                                            {paper.source}
                                                        </td>
                                                        <td className="py-8">
                                                            <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase font-mono tracking-wider ${
                                                                paper.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                                                paper.status === 'reviewing' ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400' :
                                                                paper.status === 'assigned' ? 'bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 text-yellow-605 dark:text-yellow-400' :
                                                                'bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/5 text-zinc-500 dark:text-gray-400'
                                                            }`}>
                                                                {paper.status}
                                                            </span>
                                                        </td>
                                                        <td className="py-8">
                                                            {paper.status === 'completed' ? (
                                                                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                                                                    <Award size={14} /> {reviewers.find(r => r.id === paper.assigned_to)?.name || reviewers.find(r => r.id === paper.assigned_to)?.email || paper.assigned_to}
                                                                </div>
                                                            ) : (
                                                                <select
                                                                    value={selectedReviewerForPaper[paper.id] || ''}
                                                                    onChange={(e) => handleReviewerChange(paper.id, e.target.value)}
                                                                    disabled={assigningId === paper.id}
                                                                    className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-xs text-zinc-805 dark:text-gray-300 font-mono focus:border-cyan-500 outline-none w-52 cursor-pointer font-medium"
                                                                >
                                                                    <option value="" className="bg-white dark:bg-zinc-955 text-zinc-900 dark:text-white font-bold">-- Choose Reviewer --</option>
                                                                    {reviewers.map(r => (
                                                                        <option key={r.id} value={r.id} className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white">{r.name || r.email}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </td>
                                                        <td className="py-8 text-right">
                                                            {paper.status === 'completed' ? (
                                                                <button
                                                                    onClick={async () => {
                                                                        const supabase = getSupabaseClient();
                                                                        const { data: annos } = await supabase.from('annotations').select('*').eq('paper_id', paper.id);
                                                                        setSelectedPaperDetails({ ...paper, annotations: annos || [] });
                                                                    }}
                                                                    className="px-5 py-3 rounded-xl bg-emerald-50 dark:bg-green-500/10 border border-emerald-250 dark:border-green-500/30 hover:bg-emerald-100 dark:hover:bg-green-500/20 text-emerald-700 dark:text-green-400 text-[11px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                                                                >
                                                                    <Eye size={12} /> View Evaluation
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleAssignReviewer(paper.id)}
                                                                    disabled={!selectedReviewerForPaper[paper.id] || selectedReviewerForPaper[paper.id] === paper.assigned_to || assigningId === paper.id}
                                                                    className="px-6 py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 disabled:hover:bg-cyan-600 text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-md shadow-cyan-900/10 flex items-center justify-center gap-1.5 ml-auto cursor-pointer"
                                                                >
                                                                    {assigningId === paper.id ? (
                                                                        <Loader className="animate-spin" size={12} />
                                                                    ) : (
                                                                        'Confirm'
                                                                    )}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}                        {activeTab === 'pitches' && (
                            <div className="p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
                                <div className="flex items-center gap-3 mb-10 border-b border-zinc-100 dark:border-white/5 pb-6">
                                    <ClipboardList className="text-emerald-555 dark:text-emerald-400" size={24} />
                                    <h2 className="text-2xl font-bold uppercase tracking-tight text-zinc-900 dark:text-white">Startup Audit Request Pipelines</h2>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-200 dark:border-white/10 text-[10px] uppercase text-zinc-555 dark:text-gray-555 tracking-widest font-mono">
                                                <th className="pb-6 font-black">Requested Audit Pitch</th>
                                                <th className="pb-6 font-black">Submitted By</th>
                                                <th className="pb-6 font-black">Status</th>
                                                <th className="pb-6 font-black">Assigned Reviewer</th>
                                                <th className="pb-6 font-black text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm">
                                            {filteredPitches.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="py-24 text-center text-zinc-400 dark:text-gray-600 italic font-mono text-xs">No startup pitches submitted for audit.</td>
                                                </tr>
                                            ) : (
                                                filteredPitches.map(pitch => (
                                                    <tr key={pitch.id} className="border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50/50 dark:hover:bg-white/[0.01] transition-all group">
                                                        <td className="py-8 pr-4 max-w-sm">
                                                            <div className="font-bold text-zinc-800 dark:text-gray-250 line-clamp-1 text-base">{pitch.title.replace('Audit Request: ', '')}</div>
                                                            <div className="text-[11px] text-zinc-500 dark:text-gray-500 font-mono mt-1.5 line-clamp-1 italic">"{pitch.pdf_url}"</div>
                                                        </td>
                                                        <td className="py-8 font-mono text-xs text-zinc-500 dark:text-gray-400">
                                                            @{pitch.authors}
                                                        </td>
                                                        <td className="py-8">
                                                            <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase font-mono tracking-wider ${
                                                                pitch.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                                                pitch.status === 'reviewing' ? 'bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400' :
                                                                pitch.status === 'assigned' ? 'bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 text-yellow-605 dark:text-yellow-400' :
                                                                'bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/5 text-zinc-500 dark:text-gray-400'
                                                            }`}>
                                                                {pitch.status}
                                                            </span>
                                                        </td>
                                                        <td className="py-8">
                                                            {pitch.status === 'completed' ? (
                                                                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                                                                    <Award size={14} /> {reviewers.find(r => r.id === pitch.assigned_to)?.name || reviewers.find(r => r.id === pitch.assigned_to)?.email || pitch.assigned_to}
                                                                </div>
                                                            ) : (
                                                                <select
                                                                    value={selectedReviewerForPaper[pitch.id] || ''}
                                                                    onChange={(e) => handleReviewerChange(pitch.id, e.target.value)}
                                                                    disabled={assigningId === pitch.id}
                                                                    className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-xs text-zinc-805 dark:text-gray-300 font-mono focus:border-cyan-500 outline-none w-52 cursor-pointer font-medium"
                                                                >
                                                                    <option value="" className="bg-white dark:bg-zinc-955 text-zinc-900 dark:text-white font-bold">-- Choose Reviewer --</option>
                                                                    {reviewers.map(r => (
                                                                        <option key={r.id} value={r.id} className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white">{r.name || r.email}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </td>
                                                        <td className="py-8 text-right">
                                                            {pitch.status === 'completed' ? (
                                                                <button
                                                                    onClick={async () => {
                                                                        const supabase = getSupabaseClient();
                                                                        const { data: annos } = await supabase.from('annotations').select('*').eq('paper_id', pitch.id);
                                                                        setSelectedPaperDetails({ ...pitch, annotations: annos || [] });
                                                                    }}
                                                                    className="px-5 py-3 rounded-xl bg-emerald-50 dark:bg-green-500/10 border border-emerald-250 dark:border-green-500/30 hover:bg-emerald-100 dark:hover:bg-green-500/20 text-emerald-700 dark:text-green-400 text-[11px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                                                                >
                                                                    <Eye size={12} /> View Certificate
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleAssignReviewer(pitch.id)}
                                                                    disabled={!selectedReviewerForPaper[pitch.id] || selectedReviewerForPaper[pitch.id] === pitch.assigned_to || assigningId === pitch.id}
                                                                    className="px-6 py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 disabled:hover:bg-cyan-600 text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-md shadow-cyan-900/10 flex items-center justify-center gap-1.5 ml-auto cursor-pointer"
                                                                >
                                                                    {assigningId === pitch.id ? (
                                                                        <Loader className="animate-spin" size={12} />
                                                                    ) : (
                                                                        'Confirm'
                                                                    )}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'stats' && (
                            <div className="p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
                                <div className="flex items-center gap-3 mb-10 border-b border-zinc-100 dark:border-white/5 pb-6">
                                    <Users className="text-cyan-600 dark:text-cyan-400" size={24} />
                                    <h2 className="text-2xl font-bold uppercase tracking-tight text-zinc-900 dark:text-white">Active Expert Reviewer Roster</h2>
                                </div>

                                <div className="grid md:grid-cols-2 gap-10">
                                    {reviewers.map(reviewer => {
                                        const reviewerPapers = papers.filter(p => p.assigned_to === reviewer.id);
                                        const completed = reviewerPapers.filter(p => p.status === 'completed').length;

                                        return (
                                            <div key={reviewer.id} className="p-10 bg-zinc-50/50 dark:bg-black border border-zinc-200 dark:border-white/5 rounded-[32px] hover:border-cyan-500/20 hover:shadow-md transition-all flex flex-col justify-between">
                                                <div>
                                                    <div className="flex justify-between items-start gap-4 mb-4">
                                                        <h4 className="font-black text-lg text-zinc-900 dark:text-white leading-tight">{reviewer.name || reviewer.email.split('@')[0]}</h4>
                                                        <span className="text-[9px] font-mono font-bold uppercase bg-cyan-50 dark:bg-cyan-950 text-cyan-705 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20 px-2.5 py-1 rounded-lg">
                                                            {reviewer.email}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-zinc-500 dark:text-gray-400 font-mono mb-6">{reviewer.affiliation}</p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-zinc-200 dark:border-white/5">
                                                    <div className="bg-zinc-100/50 dark:bg-[#0c0d10] p-4 border border-zinc-205 dark:border-white/5 rounded-2xl text-center">
                                                        <span className="text-[9px] text-zinc-500 dark:text-gray-500 uppercase font-mono font-bold tracking-wider">Assigned</span>
                                                        <div className="text-2xl font-black font-mono mt-1 text-zinc-800 dark:text-white">{reviewerPapers.length}</div>
                                                    </div>
                                                    <div className="bg-zinc-100/50 dark:bg-[#0c0d10] p-4 border border-zinc-205 dark:border-white/5 rounded-2xl text-center">
                                                        <span className="text-[9px] text-emerald-600 dark:text-green-500/65 uppercase font-mono font-bold tracking-wider">Completed</span>
                                                        <div className="text-2xl font-black font-mono mt-1 text-emerald-600 dark:text-green-400">{completed}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}                        {activeTab === 'users' && (
                            <div className="p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
                                <div className="flex items-center gap-3 mb-10 border-b border-zinc-100 dark:border-white/5 pb-6">
                                    <Users className="text-cyan-600 dark:text-cyan-400" size={24} />
                                    <h2 className="text-2xl font-bold uppercase tracking-tight text-zinc-900 dark:text-white">User Directory & Roles</h2>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-200 dark:border-white/10 text-[10px] uppercase text-zinc-555 dark:text-gray-555 tracking-widest font-mono">
                                                <th className="pb-6 font-black">User Details</th>
                                                <th className="pb-6 font-black">Email</th>
                                                <th className="pb-6 font-black">Affiliation</th>
                                                <th className="pb-6 font-black">Current Role</th>
                                                <th className="pb-6 font-black text-right">Modify Role</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm">
                                            {allProfiles.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="py-24 text-center text-zinc-400 dark:text-gray-600 italic font-mono text-xs">No users registered in database.</td>
                                                </tr>
                                            ) : (
                                                allProfiles.map(profile => (
                                                    <tr key={profile.id} className="border-b border-zinc-100 dark:border-white/5 hover:bg-zinc-50/50 dark:hover:bg-white/[0.01] transition-all group">
                                                        <td className="py-8 pr-4 max-w-sm">
                                                            <div className="font-bold text-zinc-800 dark:text-gray-250 text-base">{profile.name || profile.email.split('@')[0]}</div>
                                                        </td>
                                                        <td className="py-8 font-mono text-xs text-zinc-550 dark:text-gray-405">
                                                            {profile.email}
                                                        </td>
                                                        <td className="py-8 text-zinc-500 dark:text-gray-400">
                                                            {profile.affiliation || 'N/A'}
                                                        </td>
                                                        <td className="py-8">
                                                            <span className={`text-[9px] font-black px-3 py-1.5 rounded-full uppercase font-mono tracking-wider ${
                                                                profile.role === 'admin' ? 'bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 text-cyan-600 dark:text-cyan-400' :
                                                                profile.role === 'reviewer' ? 'bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400' :
                                                                'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                                            }`}>
                                                                {profile.role}
                                                            </span>
                                                        </td>
                                                        <td className="py-8 text-right">
                                                            <select
                                                                value={profile.role}
                                                                disabled={updatingRoleId === profile.id}
                                                                onChange={(e) => handleUpdateUserRole(profile.id, e.target.value)}
                                                                className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-xs text-zinc-800 dark:text-gray-255 outline-none focus:border-cyan-500 transition-all cursor-pointer font-bold"
                                                            >
                                                                <option value="user" className="bg-white dark:bg-zinc-955 text-zinc-900 dark:text-white font-bold">User (Customer)</option>
                                                                <option value="reviewer" className="bg-white dark:bg-zinc-955 text-zinc-900 dark:text-white font-bold">Reviewer (Expert)</option>
                                                                <option value="admin" className="bg-white dark:bg-zinc-955 text-zinc-900 dark:text-white font-bold">Platform Admin</option>
                                                            </select>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Paper Ingestion PDF Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-905/30 dark:bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/15 rounded-3xl shadow-2xl overflow-hidden text-left animate-in zoom-in-95 duration-200">
                        <header className="p-8 border-b border-zinc-100 dark:border-white/10 flex justify-between items-center bg-gradient-to-r from-cyan-500/5 dark:from-cyan-950/20 to-transparent">
                            <div className="flex items-center gap-2">
                                <Upload className="text-cyan-500 dark:text-cyan-400" size={20} />
                                <h3 className="text-lg font-black uppercase tracking-tight text-zinc-900 dark:text-white">Upload Research PDF</h3>
                            </div>
                            <button 
                                onClick={() => !uploading && setShowUploadModal(false)}
                                className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-550 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
                                disabled={uploading}
                            >
                                <X size={18} />
                            </button>
                        </header>

                        <form onSubmit={handleUploadPaper} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase tracking-wider font-mono ml-1">PDF Document</label>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    required
                                    onChange={(e) => {
                                        const selected = e.target.files?.[0];
                                        setFile(selected);
                                        if (selected) {
                                            setTitle(selected.name.replace('.pdf', '').replace(/_/g, ' '));
                                        }
                                    }}
                                    disabled={uploading}
                                    className="w-full text-xs text-zinc-550 dark:text-gray-400 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:bg-zinc-100 dark:file:bg-white/5 file:text-cyan-600 dark:file:text-cyan-400 file:cursor-pointer hover:file:bg-zinc-200 dark:hover:file:bg-white/10 cursor-pointer"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-zinc-750 dark:text-gray-300 uppercase tracking-wider font-mono ml-1">Paper Title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    required
                                    disabled={uploading}
                                    placeholder="e.g. Surface Codes for Fault-Tolerant Quantum Computation"
                                    className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-cyan-500 transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-zinc-750 dark:text-gray-300 uppercase tracking-wider font-mono ml-1">Authors</label>
                                <input
                                    type="text"
                                    value={authors}
                                    onChange={(e) => setAuthors(e.target.value)}
                                    required
                                    disabled={uploading}
                                    placeholder="e.g. Fowler et al."
                                    className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-cyan-500 transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-zinc-750 dark:text-gray-300 uppercase tracking-wider font-mono ml-1">Publication Year</label>
                                <input
                                    type="number"
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    required
                                    disabled={uploading}
                                    className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-cyan-500 transition-all"
                                />
                            </div>

                            {uploading && (
                                <div className="p-5 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-500/10 rounded-2xl flex flex-col gap-3">
                                    <div className="flex items-center gap-2.5 text-xs text-cyan-750 dark:text-cyan-400 font-mono font-bold">
                                        <Loader className="animate-spin" size={14} />
                                        <span>Status: {uploadProgress}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-zinc-200 dark:bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-cyan-500 animate-pulse" style={{ width: '100%' }} />
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4 pt-2">
                                <button
                                    type="submit"
                                    disabled={uploading || !file}
                                    className="flex-1 py-4 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    {uploading ? 'Processing Ingestion...' : 'Ingest & Index Abstract'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowUploadModal(false)}
                                    disabled={uploading}
                                    className="px-6 py-4 border border-zinc-200 dark:border-white/10 hover:bg-zinc-150 dark:hover:bg-white/5 text-zinc-550 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white text-[11px] font-mono uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Paper Curation details popup */}
            {selectedPaperDetails && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/30 dark:bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/15 rounded-[32px] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <header className="p-8 border-b border-zinc-100 dark:border-white/10 flex justify-between items-start bg-gradient-to-r from-emerald-500/5 dark:from-emerald-955/20 to-transparent">
                          <div>
                            <div className="flex items-center gap-2.5 mb-2">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-full text-[9px] font-black uppercase tracking-wider font-mono">
                                <Award size={11} /> Evaluation Complete
                              </span>
                              <span className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono font-bold">ID: {selectedPaperDetails.id}</span>
                            </div>
                            <h3 className="text-xl font-black text-zinc-900 dark:text-white leading-snug">
                                {selectedPaperDetails.source === 'pitch' ? 'Startup Audit Certificate' : 'Academic Literature Review'}
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-gray-400 font-mono mt-1.5">
                                {selectedPaperDetails.source === 'pitch' ? `Audit Request: ${selectedPaperDetails.title.replace('Audit Request: ', '')}` : `${selectedPaperDetails.title} (${selectedPaperDetails.year})`}
                            </p>
                          </div>
                          <button 
                            onClick={() => setSelectedPaperDetails(null)}
                            className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-550 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white transition-all ml-4 cursor-pointer"
                          >
                            <X size={18} />
                          </button>
                        </header>

                        <div className="p-8 overflow-y-auto space-y-8 flex-1 text-left">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="p-6 bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-white/5 rounded-2xl">
                              <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-500 font-mono">Expert Auditor</span>
                              <h5 className="font-black text-base text-zinc-800 dark:text-gray-205 mt-1">{selectedPaperDetails.assessment?.reviewer_name || reviewers.find(r => r.id === selectedPaperDetails.assigned_to)?.name || reviewers.find(r => r.id === selectedPaperDetails.assigned_to)?.email || selectedPaperDetails.assigned_to}</h5>
                              <p className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono mt-1">{selectedPaperDetails.assessment?.reviewer_affiliation || 'Expert Partner'}</p>
                            </div>
                            <div className="p-6 bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-white/5 rounded-2xl flex justify-between items-center">
                              <div>
                                <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-500 font-mono">Fidelity Score</span>
                                <h5 className="font-mono font-black text-3xl text-emerald-600 dark:text-emerald-400 mt-1">{selectedPaperDetails.assessment?.score}%</h5>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-550 font-mono">Verdict</span>
                                <div className="font-black text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mt-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-250 dark:border-emerald-500/20 rounded-lg">
                                  {selectedPaperDetails.assessment?.verdict}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-500 tracking-wider font-mono">Reviewer Assessment Notes</span>
                            <div className="p-6 bg-zinc-50/50 dark:bg-black/40 border border-zinc-200 dark:border-white/5 rounded-2xl text-sm text-zinc-700 dark:text-gray-355 leading-relaxed font-mono whitespace-pre-line">
                              {selectedPaperDetails.assessment?.notes}
                            </div>
                          </div>

                          <div className="space-y-4">
                            <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-gray-550 tracking-wider font-mono">Highlights & Claims Annotated ({selectedPaperDetails.annotations?.length || 0})</span>
                            {selectedPaperDetails.annotations && selectedPaperDetails.annotations.length > 0 ? (
                              <div className="space-y-4">
                                {selectedPaperDetails.annotations.map((ann, idx) => (
                                  <div key={idx} className="p-6 bg-zinc-50/40 dark:bg-white/[0.01] border border-zinc-200 dark:border-white/5 rounded-2xl flex flex-col gap-3">
                                    <div className="flex justify-between items-center border-b border-zinc-200 dark:border-white/5 pb-2 text-[9px] font-mono text-zinc-555 dark:text-gray-500 uppercase">
                                      <span>Annotated Passage</span>
                                      {ann.page > 0 && <span>Page {ann.page}</span>}
                                    </div>
                                    <p className="text-xs text-zinc-650 dark:text-gray-400 italic leading-relaxed border-l-2 border-cyan-500/60 pl-3">
                                      "{ann.text}"
                                    </p>
                                    <div className="p-4 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-500/10 rounded-xl">
                                      <span className="text-[8px] font-mono uppercase text-cyan-600 dark:text-cyan-400 font-bold tracking-wider">Reviewer Comment</span>
                                      <p className="text-xs text-cyan-800 dark:text-cyan-300 mt-1.5 leading-relaxed font-sans">{ann.comment}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-white/5 rounded-2xl text-zinc-400 dark:text-gray-600 italic text-xs font-mono">
                                No claims annotations created.
                              </div>
                            )}
                          </div>
                        </div>

                        <footer className="p-6 border-t border-zinc-100 dark:border-white/10 flex justify-end bg-zinc-50 dark:bg-black">
                          <button 
                            onClick={() => setSelectedPaperDetails(null)}
                            className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider text-[10px] rounded-xl dark:hover:bg-gray-200 transition-all cursor-pointer font-mono shadow-sm"
                          >
                            Close Detail View
                          </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditorDashboard;
