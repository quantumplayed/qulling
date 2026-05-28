import React, { useState, useEffect } from 'react';
import { ArrowLeft, LayoutDashboard, Users, Shield, Zap, Loader, ClipboardList, CheckCircle, Clock, AlertTriangle, Eye, Award, Upload, X, FileText, Link, Trash2, Cpu } from 'lucide-react';
import { getSupabaseClient } from '../services/supabaseClient';
import { getGeminiApiKey } from '../services/geminiService';
import { ingestPaper } from '../services/pdfParser';
import { fetchArxivMetadata, downloadArxivPdfFile } from '../services/arxivService';

const EditorDashboard = ({ currentUser }) => {
    const [papers, setPapers] = useState([]);
    const [reviewers, setReviewers] = useState([]);
    const [allProfiles, setAllProfiles] = useState([]);
    const [updatingRoleId, setUpdatingRoleId] = useState(null);
    const [stats, setStats] = useState({ paper_count: 0, chunk_count: 0 });
    const [activeTab, setActiveTab] = useState('papers'); // papers, pitches, stats, users, skills
    const [loading, setLoading] = useState(true);
    const [assigningId, setAssigningId] = useState(null);
    const [selectedReviewerForPaper, setSelectedReviewerForPaper] = useState({});
    const [selectedPaperDetails, setSelectedPaperDetails] = useState(null);
    
    // AI Skills states
    const [skills, setSkills] = useState([]);
    const [selectedSkill, setSelectedSkill] = useState(null);
    const [isSavingSkill, setIsSavingSkill] = useState(false);
    const [skillId, setSkillId] = useState('');
    const [skillTitle, setSkillTitle] = useState('');
    const [skillContent, setSkillContent] = useState('');
    const [skillIsActive, setSkillIsActive] = useState(true);
    const [isNewSkill, setIsNewSkill] = useState(false);
    
    // Paper Reviews assignments list
    const [paperReviews, setPaperReviews] = useState([]);

    // Helpers for multi-reviewer compatibility
    const getReviewsForPaper = (paper) => {
        const reviews = paperReviews.filter(r => r.paper_id === paper.id);
        if (reviews.length === 0 && paper.assigned_to) {
            return [{
                paper_id: paper.id,
                reviewer_id: paper.assigned_to,
                status: paper.status || 'assigned',
                assessment: paper.assessment
            }];
        }
        return reviews;
    };
    
    // Upload Modal states
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'arxiv'
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState('');
    const [authors, setAuthors] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [arxivQuery, setArxivQuery] = useState('');
    const [arxivFetching, setArxivFetching] = useState(false);
    const [arxivError, setArxivError] = useState('');
    const [arxivPreview, setArxivPreview] = useState(null); // { arxivId, title, authors, year, pdfUrl }

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
                fetchAllProfiles(),
                fetchSkills(),
                fetchPaperReviews()
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

    const fetchSkills = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('skills')
                .select('*')
                .order('id', { ascending: true });
            
            if (error) {
                console.warn("Failed to fetch skills (table might not exist yet):", error.message);
                setSkills([]);
            } else {
                setSkills(data || []);
            }
        } catch (err) {
            console.error("Error reading skills table:", err);
            setSkills([]);
        }
    };

    const fetchPaperReviews = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('paper_reviews')
                .select('*');
            
            if (error) {
                console.warn("Failed to fetch paper_reviews (table might not exist yet):", error.message);
                setPaperReviews([]);
            } else {
                setPaperReviews(data || []);
            }
        } catch (err) {
            console.error("Error reading paper_reviews table:", err);
            setPaperReviews([]);
        }
    };

    const handleSelectSkill = (skill) => {
        if (!skill) {
            setSelectedSkill(null);
            setSkillId('');
            setSkillTitle('');
            setSkillContent('');
            setSkillIsActive(true);
            setIsNewSkill(false);
        } else {
            setSelectedSkill(skill);
            setSkillId(skill.id);
            setSkillTitle(skill.title);
            setSkillContent(skill.content);
            setSkillIsActive(skill.is_active);
            setIsNewSkill(false);
        }
    };

    const handleCreateNewSkill = () => {
        setSelectedSkill({ id: '', title: '', content: '', is_active: true });
        setSkillId('');
        setSkillTitle('');
        setSkillContent('');
        setSkillIsActive(true);
        setIsNewSkill(true);
    };

    const handleSaveSkill = async () => {
        if (!skillId.trim() || !skillTitle.trim() || !skillContent.trim()) {
            alert("All fields are required to save a skill.");
            return;
        }

        const idRegex = /^[a-z0-9-]+$/;
        if (!idRegex.test(skillId)) {
            alert("Skill ID must contain only lowercase letters, numbers, and hyphens (e.g. 'technical-due-diligence').");
            return;
        }

        setIsSavingSkill(true);
        const supabase = getSupabaseClient();
        if (!supabase) {
            setIsSavingSkill(false);
            return;
        }

        try {
            const payload = {
                id: skillId.trim(),
                title: skillTitle.trim(),
                content: skillContent.trim(),
                is_active: skillIsActive,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('skills')
                .upsert(payload);

            if (error) throw error;

            alert(`Skill '${skillTitle}' saved successfully.`);
            await fetchSkills();
            setIsNewSkill(false);
            setSelectedSkill(payload);
        } catch (err) {
            console.error("Error saving skill:", err);
            alert(`Database Error: ${err.message}. Make sure you run the migrations first.`);
        } finally {
            setIsSavingSkill(false);
        }
    };

    const handleDeleteSkill = async (idToDelete) => {
        if (!confirm(`Are you sure you want to delete the skill '${idToDelete}'? This cannot be undone.`)) {
            return;
        }

        const supabase = getSupabaseClient();
        if (!supabase) return;

        try {
            const { error } = await supabase
                .from('skills')
                .delete()
                .eq('id', idToDelete);

            if (error) throw error;

            alert("Skill deleted successfully.");
            setSelectedSkill(null);
            await fetchSkills();
        } catch (err) {
            console.error("Error deleting skill:", err);
            alert(`Database Error: ${err.message}`);
        }
    };

    const handleToggleSkillActive = async (skill, newActiveState) => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        try {
            const { error } = await supabase
                .from('skills')
                .update({ is_active: newActiveState })
                .eq('id', skill.id);

            if (error) throw error;

            setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, is_active: newActiveState } : s));
            if (selectedSkill && selectedSkill.id === skill.id) {
                setSkillIsActive(newActiveState);
            }
        } catch (err) {
            console.error("Error toggling skill active status:", err);
            alert(`Database Error: ${err.message}`);
        }
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
        if (!supabase) return;
        
        try {
            // Check if reviewer is already assigned in paper_reviews
            const { data: existing, error: checkError } = await supabase
                .from('paper_reviews')
                .select('*')
                .eq('paper_id', paperId)
                .eq('reviewer_id', reviewer)
                .maybeSingle();

            if (checkError && checkError.code !== '42P01') {
                throw checkError;
            }

            if (existing) {
                alert("This reviewer is already assigned to this paper.");
                setAssigningId(null);
                return;
            }

            // Attempt to insert assignment in paper_reviews
            const { error: insertError } = await supabase
                .from('paper_reviews')
                .insert({
                    paper_id: paperId,
                    reviewer_id: reviewer,
                    status: 'assigned'
                });

            if (insertError) {
                if (insertError.code === '42P01') {
                    // Fallback to legacy single reviewer assignment
                    console.warn("paper_reviews table missing, falling back to legacy single assignee update...");
                    const { error: legacyError } = await supabase
                        .from('papers')
                        .update({ 
                            assigned_to: reviewer,
                            status: 'assigned' 
                        })
                        .eq('id', paperId);
                    if (legacyError) throw legacyError;
                } else {
                    throw insertError;
                }
            } else {
                // Update master status
                await supabase
                    .from('papers')
                    .update({ status: 'assigned' })
                    .eq('id', paperId);
            }

            alert("Reviewer assigned successfully!");
            await Promise.all([
                fetchPapers(),
                fetchPaperReviews()
            ]);
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

    const handleDeletePaper = async (paperId) => {
        if (!window.confirm("Are you sure you want to delete this paper? This will permanently delete the paper, all extracted text chunks, and all associated reviewer annotations. This action cannot be undone.")) {
            return;
        }

        const supabase = getSupabaseClient();
        if (!supabase) {
            alert("Supabase client is not configured.");
            return;
        }

        try {
            // Delete raw PDF file from storage
            const storagePath = `${paperId}.pdf`;
            await supabase.storage
                .from('pdfs')
                .remove([storagePath]);

            // Delete paper row from database (cascading deletes handle chunks/annotations)
            const { error } = await supabase
                .from('papers')
                .delete()
                .eq('id', paperId);

            if (error) throw error;

            // Refresh UI
            setPapers(prev => prev.filter(p => p.id !== paperId));
            if (typeof fetchStats === 'function') {
                await fetchStats();
            }
            alert("Paper successfully deleted.");
        } catch (err) {
            console.error("Failed to delete paper:", err);
            alert(`Delete failed: ${err.message || err}`);
        }
    };

    const handleFetchArxiv = async () => {
        if (!arxivQuery.trim()) return;
        setArxivFetching(true);
        setArxivError('');
        setArxivPreview(null);
        try {
            const meta = await fetchArxivMetadata(arxivQuery.trim());
            setArxivPreview(meta);
            setTitle(meta.title);
            setAuthors(meta.authors);
            setYear(meta.year);
        } catch (err) {
            setArxivError(err.message || 'Failed to fetch arXiv metadata.');
        } finally {
            setArxivFetching(false);
        }
    };

    const handleUploadPaper = async (e) => {
        e.preventDefault();

        const supabase = getSupabaseClient();
        const geminiKey = getGeminiApiKey();

        if (!supabase) {
            alert("Supabase is not configured. Please set your Supabase URL and Anon Key in Settings.");
            return;
        }

        // Validate inputs
        if (uploadMode === 'file' && !file) {
            alert('Please select a PDF file to upload.');
            return;
        }
        if (uploadMode === 'arxiv' && !arxivPreview) {
            alert('Please look up an arXiv paper first.');
            return;
        }

        setUploading(true);
        setUploadProgress('Initializing...');

        try {
            let pdfFile = file;

            if (uploadMode === 'arxiv') {
                setUploadProgress('Downloading PDF from arXiv...');
                pdfFile = await downloadArxivPdfFile(arxivPreview.pdfUrl, arxivPreview.arxivId);
            }

            await ingestPaper(
                pdfFile,
                title.trim(),
                authors.trim(),
                year,
                supabase,
                geminiKey,
                (progress) => setUploadProgress(progress)
            );

            // Reset all form state
            setFile(null);
            setTitle('');
            setAuthors('');
            setYear(new Date().getFullYear());
            setArxivQuery('');
            setArxivPreview(null);
            setArxivError('');
            setUploadMode('file');
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
            <div className="absolute top-10 left-10 w-[500px] h-[500px] bg-cyan-500/5 dark:bg-cyan-950/20 blur-[120px] rounded-full pointer-events-none" />

            <div className="dashboard-container relative z-10">
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
                              </header>
                <div className="admin-card-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                    {/* Card 1: Research Literature */}
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab('papers')}
                        className={`admin-stat-card w-full group px-8 pt-14 pb-16 sm:px-9 sm:pt-16 sm:pb-20 xl:px-10 xl:pt-20 xl:pb-24 border rounded-3xl transition-all text-center flex flex-col items-center justify-between cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/5 duration-300 outline-none overflow-hidden ${
                            activeTab === 'papers'
                                ? 'border-cyan-500 bg-cyan-50/20 dark:bg-cyan-955/15 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-500/20'
                                : 'border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] hover:border-cyan-500/30'
                        }`}
                    >
                        <div className="flex flex-col items-center w-full">
                            <div className={`p-2.5 rounded-xl transition-all ${activeTab === 'papers' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-100 dark:bg-white/5 text-zinc-400 group-hover:text-cyan-400 group-hover:bg-cyan-500/10'}`}>
                                <ClipboardList className="transition-colors shrink-0" size={18} />
                            </div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm uppercase font-bold tracking-[0.12em] font-mono mt-4 pt-3 text-center w-full break-words">
                                Research Literature
                            </span>
                        </div>
                        <div className="mt-8 w-full flex flex-col items-center text-center">
                            <div className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white truncate">
                                {stats.paper_count} <span className="text-[10px] text-zinc-455 dark:text-zinc-500 font-mono uppercase font-normal">Files</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono uppercase mt-1.5 break-words whitespace-normal leading-relaxed">
                                {stats.chunk_count} Vector Segments
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Startup Audits */}
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab('pitches')}
                        className={`admin-stat-card w-full group px-8 pt-14 pb-16 sm:px-9 sm:pt-16 sm:pb-20 xl:px-10 xl:pt-20 xl:pb-24 border rounded-3xl transition-all text-center flex flex-col items-center justify-between cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/5 duration-300 outline-none overflow-hidden ${
                            activeTab === 'pitches'
                                ? 'border-cyan-500 bg-cyan-50/20 dark:bg-cyan-955/15 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-500/20'
                                : 'border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] hover:border-cyan-500/30'
                        }`}
                    >
                        <div className="flex flex-col items-center w-full">
                            <div className={`p-2.5 rounded-xl transition-all ${activeTab === 'pitches' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-100 dark:bg-white/5 text-zinc-400 group-hover:text-cyan-400 group-hover:bg-cyan-500/10'}`}>
                                <Zap className="transition-colors shrink-0" size={18} />
                            </div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm uppercase font-bold tracking-[0.12em] font-mono mt-4 pt-3 text-center w-full break-words">
                                Startup Audits
                            </span>
                        </div>
                        <div className="mt-8 w-full flex flex-col items-center text-center">
                            <div className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white truncate">
                                {stats.pitch_count || 0} <span className="text-[10px] text-zinc-455 dark:text-zinc-500 font-mono uppercase font-normal">Pitches</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono uppercase mt-1.5 break-words whitespace-normal leading-relaxed">
                                {countStatus('completed')} Completed Reports
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Expert Reviewers */}
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab('stats')}
                        className={`admin-stat-card w-full group px-8 pt-14 pb-16 sm:px-9 sm:pt-16 sm:pb-20 xl:px-10 xl:pt-20 xl:pb-24 border rounded-3xl transition-all text-center flex flex-col items-center justify-between cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/5 duration-300 outline-none overflow-hidden ${
                            activeTab === 'stats'
                                ? 'border-cyan-500 bg-cyan-50/20 dark:bg-cyan-955/15 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-500/20'
                                : 'border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] hover:border-cyan-500/30'
                        }`}
                    >
                        <div className="flex flex-col items-center w-full">
                            <div className={`p-2.5 rounded-xl transition-all ${activeTab === 'stats' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-100 dark:bg-white/5 text-zinc-400 group-hover:text-cyan-400 group-hover:bg-cyan-500/10'}`}>
                                <Users className="transition-colors shrink-0" size={18} />
                            </div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm uppercase font-bold tracking-[0.12em] font-mono mt-4 pt-3 text-center w-full break-words">
                                Expert Reviewers
                            </span>
                        </div>
                        <div className="mt-8 w-full flex flex-col items-center text-center">
                            <div className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white truncate">
                                {reviewers.length} <span className="text-[10px] text-zinc-455 dark:text-zinc-500 font-mono uppercase font-normal">Active</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono uppercase mt-1.5 break-words whitespace-normal leading-relaxed">
                                Reviewer Roster List
                            </div>
                        </div>
                    </div>

                    {/* Card 4: User Directory */}
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab('users')}
                        className={`admin-stat-card w-full group px-8 pt-14 pb-16 sm:px-9 sm:pt-16 sm:pb-20 xl:px-10 xl:pt-20 xl:pb-24 border rounded-3xl transition-all text-center flex flex-col items-center justify-between cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/5 duration-300 outline-none overflow-hidden ${
                            activeTab === 'users'
                                ? 'border-cyan-500 bg-cyan-50/20 dark:bg-cyan-955/15 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-500/20'
                                : 'border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] hover:border-cyan-500/30'
                        }`}
                    >
                        <div className="flex flex-col items-center w-full">
                            <div className={`p-2.5 rounded-xl transition-all ${activeTab === 'users' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-100 dark:bg-white/5 text-zinc-400 group-hover:text-cyan-400 group-hover:bg-cyan-500/10'}`}>
                                <Shield className="transition-colors shrink-0" size={18} />
                            </div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm uppercase font-bold tracking-[0.12em] font-mono mt-4 pt-3 text-center w-full break-words">
                                User Directory
                            </span>
                        </div>
                        <div className="mt-8 w-full flex flex-col items-center text-center">
                            <div className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white truncate">
                                {allProfiles.length} <span className="text-[10px] text-zinc-455 dark:text-zinc-500 font-mono uppercase font-normal">Profiles</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono uppercase mt-1.5 break-words whitespace-normal leading-relaxed">
                                Manage Roles & Access
                            </div>
                        </div>
                    </div>

                    {/* Card 5: AI Skills */}
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab('skills')}
                        className={`admin-stat-card w-full group px-8 pt-14 pb-16 sm:px-9 sm:pt-16 sm:pb-20 xl:px-10 xl:pt-20 xl:pb-24 border rounded-3xl transition-all text-center flex flex-col items-center justify-between cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/5 duration-300 outline-none overflow-hidden ${
                            activeTab === 'skills'
                                ? 'border-cyan-500 bg-cyan-50/20 dark:bg-cyan-955/15 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-500/20'
                                : 'border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014] hover:border-cyan-500/30'
                        }`}
                    >
                        <div className="flex flex-col items-center w-full">
                            <div className={`p-2.5 rounded-xl transition-all ${activeTab === 'skills' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-zinc-100 dark:bg-white/5 text-zinc-400 group-hover:text-cyan-400 group-hover:bg-cyan-500/10'}`}>
                                <Cpu className="transition-colors shrink-0" size={18} />
                            </div>
                            <span className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm uppercase font-bold tracking-[0.12em] font-mono mt-4 pt-3 text-center w-full break-words">
                                AI Skills
                            </span>
                        </div>
                        <div className="mt-8 w-full flex flex-col items-center text-center">
                            <div className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white truncate">
                                {skills.length} <span className="text-[10px] text-zinc-455 dark:text-zinc-500 font-mono uppercase font-normal">Active Skills</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono uppercase mt-1.5 break-words whitespace-normal leading-relaxed">
                                Manage LLM Prompts & Guidelines
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="p-24 flex flex-col items-center justify-center border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl">
                        <Loader className="animate-spin text-cyan-600 dark:text-cyan-400 mb-4" size={36} />
                        <span className="text-xs font-mono text-zinc-400 dark:text-gray-500 uppercase tracking-widest font-bold">Loading Supabase Registry...</span>
                    </div>
                ) : (
                    <>
                        {activeTab === 'papers' && (
                            <div className="admin-section-container relative p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
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
                                </div>                                {/* Mobile View Card List */}
                                <div className="block md:hidden space-y-4">
                                    {filteredPapers.length === 0 ? (
                                        <div className="py-12 text-center text-zinc-400 dark:text-gray-600 italic font-mono text-xs">No papers cataloged in database. Click 'Upload & Index PDF' to add one.</div>
                                    ) : (
                                        filteredPapers.map(paper => (
                                            <div key={paper.id} className="px-7 py-6 border border-zinc-200 dark:border-white/5 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20 text-left">
                                                <div className="flex justify-between items-start gap-4 mb-3">
                                                    <div className="flex-1">
                                                        <div className="font-bold text-zinc-800 dark:text-gray-250 text-sm leading-snug">{paper.title}</div>
                                                        <div className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono mt-1">{paper.authors} ({paper.year})</div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeletePaper(paper.id)}
                                                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer flex-shrink-0"
                                                        title="Delete Paper"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                                <div className="flex flex-col gap-2 border-t border-zinc-100 dark:border-white/5 pt-3 mb-3 text-xs">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono text-zinc-400 dark:text-gray-550 uppercase text-[10px]">Source:</span>
                                                        <span className="font-mono text-zinc-500 dark:text-gray-300 uppercase">{paper.source}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1.5 mt-1">
                                                        <span className="font-mono text-zinc-400 dark:text-gray-550 uppercase text-[10px]">Reviewers & Statuses:</span>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {getReviewsForPaper(paper).length === 0 ? (
                                                                <span className="text-[10px] text-zinc-450 font-mono italic">No reviewers assigned</span>
                                                            ) : (
                                                                getReviewsForPaper(paper).map(r => {
                                                                    const revProfile = reviewers.find(rev => rev.id === r.reviewer_id);
                                                                    const revName = revProfile ? (revProfile.name || revProfile.email.split('@')[0]) : 'Unknown';
                                                                    return (
                                                                        <span key={r.reviewer_id} className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase font-mono tracking-wider border ${
                                                                            r.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                                                            r.status === 'reviewing' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400' :
                                                                            'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                                                                        }`}>
                                                                            {revName} ({r.status})
                                                                        </span>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                    {(() => {
                                                        const assignedReviewerIds = getReviewsForPaper(paper).map(r => r.reviewer_id);
                                                        const availableReviewers = reviewers.filter(r => !assignedReviewerIds.includes(r.id));
                                                        return (
                                                            <div className="flex flex-col gap-1.5 mt-2">
                                                                <span className="font-mono text-zinc-400 dark:text-gray-550 uppercase text-[10px]">Assign Reviewer:</span>
                                                                <div className="flex gap-2 items-center">
                                                                    <select
                                                                        value={selectedReviewerForPaper[paper.id] || ''}
                                                                        onChange={(e) => handleReviewerChange(paper.id, e.target.value)}
                                                                        disabled={assigningId === paper.id || availableReviewers.length === 0}
                                                                        className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-gray-305 font-mono focus:border-cyan-500 outline-none flex-1 cursor-pointer"
                                                                    >
                                                                        {availableReviewers.length === 0 ? (
                                                                            <option value="">All Reviewers Assigned</option>
                                                                        ) : (
                                                                            <>
                                                                                <option value="">-- Choose Reviewer --</option>
                                                                                {availableReviewers.map(r => (
                                                                                    <option key={r.id} value={r.id}>{r.name || r.email}</option>
                                                                                ))}
                                                                            </>
                                                                        )}
                                                                    </select>
                                                                    {availableReviewers.length > 0 && selectedReviewerForPaper[paper.id] && (
                                                                        <button
                                                                            onClick={() => handleAssignReviewer(paper.id)}
                                                                            disabled={assigningId === paper.id}
                                                                            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                                                                        >
                                                                            Confirm
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="pt-2">
                                                    {getReviewsForPaper(paper).some(r => r.status === 'completed') && (
                                                        <button
                                                            onClick={async () => {
                                                                const supabase = getSupabaseClient();
                                                                const { data: annos } = await supabase.from('annotations').select('*').eq('paper_id', paper.id);
                                                                setSelectedPaperDetails({ ...paper, annotations: annos || [] });
                                                            }}
                                                            className="w-full justify-center px-5 py-3 rounded-xl bg-emerald-50 dark:bg-green-500/10 border border-emerald-255 dark:border-green-500/30 hover:bg-emerald-100 dark:hover:bg-green-500/20 text-emerald-700 dark:text-green-400 text-[11px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                                                        >
                                                            <Eye size={12} /> View Evaluation
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Desktop View Table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-200 dark:border-white/10 text-[10px] uppercase text-zinc-555 dark:text-gray-555 tracking-widest font-mono">
                                                <th className="pb-6 font-black">Paper Details</th>
                                                <th className="pb-6 font-black">Source</th>
                                                <th className="pb-6 font-black">Reviewers & Statuses</th>
                                                <th className="pb-6 font-black">Assign Reviewer</th>
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
                                                            <div className="flex flex-wrap gap-2 max-w-xs">
                                                                {getReviewsForPaper(paper).length === 0 ? (
                                                                    <span className="text-xs text-zinc-400 font-mono italic">No reviewers assigned</span>
                                                                ) : (
                                                                    getReviewsForPaper(paper).map(r => {
                                                                        const revProfile = reviewers.find(rev => rev.id === r.reviewer_id);
                                                                        const revName = revProfile ? (revProfile.name || revProfile.email.split('@')[0]) : 'Unknown';
                                                                        return (
                                                                            <span key={r.reviewer_id} className={`text-[9px] font-black px-2.5 py-1 rounded-md uppercase font-mono tracking-wider border whitespace-nowrap ${
                                                                                r.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                                                                r.status === 'reviewing' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400' :
                                                                                'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                                                                            }`}>
                                                                                {revName} ({r.status})
                                                                            </span>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-8">
                                                            {(() => {
                                                                const assignedReviewerIds = getReviewsForPaper(paper).map(r => r.reviewer_id);
                                                                const availableReviewers = reviewers.filter(r => !assignedReviewerIds.includes(r.id));
                                                                return (
                                                                    <div className="flex gap-2 items-center animate-in fade-in duration-300">
                                                                        <select
                                                                            value={selectedReviewerForPaper[paper.id] || ''}
                                                                            onChange={(e) => handleReviewerChange(paper.id, e.target.value)}
                                                                            disabled={assigningId === paper.id || availableReviewers.length === 0}
                                                                            className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs text-zinc-800 dark:text-gray-300 font-mono focus:border-cyan-500 outline-none w-48 cursor-pointer font-medium"
                                                                        >
                                                                            {availableReviewers.length === 0 ? (
                                                                                <option value="">All Reviewers Assigned</option>
                                                                            ) : (
                                                                                <>
                                                                                    <option value="">-- Choose --</option>
                                                                                    {availableReviewers.map(r => (
                                                                                        <option key={r.id} value={r.id}>{r.name || r.email}</option>
                                                                                    ))}
                                                                                </>
                                                                            )}
                                                                        </select>
                                                                        {availableReviewers.length > 0 && selectedReviewerForPaper[paper.id] && (
                                                                            <button
                                                                                onClick={() => handleAssignReviewer(paper.id)}
                                                                                disabled={assigningId === paper.id}
                                                                                className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-md"
                                                                            >
                                                                                {assigningId === paper.id ? <Loader className="animate-spin" size={10} /> : 'Confirm'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="py-8 text-right">
                                                            <div className="flex items-center justify-end gap-3">
                                                                {getReviewsForPaper(paper).some(r => r.status === 'completed') && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            const supabase = getSupabaseClient();
                                                                            const { data: annos } = await supabase.from('annotations').select('*').eq('paper_id', paper.id);
                                                                            setSelectedPaperDetails({ ...paper, annotations: annos || [] });
                                                                        }}
                                                                        className="px-5 py-3 rounded-xl bg-emerald-50 dark:bg-green-500/10 border border-emerald-255 dark:border-green-500/30 hover:bg-emerald-100 dark:hover:bg-green-500/20 text-emerald-700 dark:text-green-400 text-[11px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                                                                    >
                                                                        <Eye size={12} /> View Evaluation
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => handleDeletePaper(paper.id)}
                                                                    className="p-3 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                                                                    title="Delete Paper"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table></div>
                            </div>
                        )}                        {activeTab === 'pitches' && (
                            <div className="admin-section-container p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
                                <div className="flex items-center gap-3 mb-10 border-b border-zinc-100 dark:border-white/5 pb-6">
                                    <ClipboardList className="text-emerald-555 dark:text-emerald-400" size={24} />
                                    <h2 className="text-2xl font-bold uppercase tracking-tight text-zinc-900 dark:text-white">Startup Audit Request Pipelines</h2>
                                </div>

                                {/* Mobile View Card List */}
                                <div className="block md:hidden space-y-4">
                                    {filteredPitches.length === 0 ? (
                                        <div className="py-12 text-center text-zinc-400 dark:text-gray-600 italic font-mono text-xs">No startup pitches submitted for audit.</div>
                                    ) : (
                                        filteredPitches.map(pitch => (
                                            <div key={pitch.id} className="px-7 py-6 border border-zinc-200 dark:border-white/5 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20 text-left">
                                                <div className="mb-3">
                                                    <div className="font-bold text-zinc-800 dark:text-gray-250 text-sm leading-snug">{pitch.title.replace('Audit Request: ', '')}</div>
                                                    <div className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono mt-1.5 italic break-words">"{pitch.pdf_url}"</div>
                                                </div>
                                                <div className="flex flex-col gap-2 border-t border-zinc-100 dark:border-white/5 pt-3 mb-3 text-xs">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono text-zinc-400 dark:text-gray-550 uppercase text-[10px]">Submitted By:</span>
                                                        <span className="font-mono text-zinc-550 dark:text-gray-300">@{pitch.authors}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1.5 mt-1">
                                                        <span className="font-mono text-zinc-400 dark:text-gray-550 uppercase text-[10px]">Reviewers & Statuses:</span>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {getReviewsForPaper(pitch).length === 0 ? (
                                                                <span className="text-[10px] text-zinc-455 font-mono italic">No reviewers assigned</span>
                                                            ) : (
                                                                getReviewsForPaper(pitch).map(r => {
                                                                    const revProfile = reviewers.find(rev => rev.id === r.reviewer_id);
                                                                    const revName = revProfile ? (revProfile.name || revProfile.email.split('@')[0]) : 'Unknown';
                                                                    return (
                                                                        <span key={r.reviewer_id} className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase font-mono tracking-wider border ${
                                                                            r.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                                                            r.status === 'reviewing' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400' :
                                                                            'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                                                                        }`}>
                                                                            {revName} ({r.status})
                                                                        </span>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                    {(() => {
                                                        const assignedReviewerIds = getReviewsForPaper(pitch).map(r => r.reviewer_id);
                                                        const availableReviewers = reviewers.filter(r => !assignedReviewerIds.includes(r.id));
                                                        return (
                                                            <div className="flex flex-col gap-1.5 mt-2">
                                                                <span className="font-mono text-zinc-400 dark:text-gray-550 uppercase text-[10px]">Assign Reviewer:</span>
                                                                <div className="flex gap-2 items-center">
                                                                    <select
                                                                        value={selectedReviewerForPaper[pitch.id] || ''}
                                                                        onChange={(e) => handleReviewerChange(pitch.id, e.target.value)}
                                                                        disabled={assigningId === pitch.id || availableReviewers.length === 0}
                                                                        className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-gray-305 font-mono focus:border-cyan-500 outline-none flex-1 cursor-pointer"
                                                                    >
                                                                        {availableReviewers.length === 0 ? (
                                                                            <option value="">All Reviewers Assigned</option>
                                                                        ) : (
                                                                            <>
                                                                                <option value="">-- Choose Reviewer --</option>
                                                                                {availableReviewers.map(r => (
                                                                                    <option key={r.id} value={r.id}>{r.name || r.email}</option>
                                                                                ))}
                                                                            </>
                                                                        )}
                                                                    </select>
                                                                    {availableReviewers.length > 0 && selectedReviewerForPaper[pitch.id] && (
                                                                        <button
                                                                            onClick={() => handleAssignReviewer(pitch.id)}
                                                                            disabled={assigningId === pitch.id}
                                                                            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                                                                        >
                                                                            Confirm
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="pt-2">
                                                    {getReviewsForPaper(pitch).some(r => r.status === 'completed') && (
                                                        <button
                                                            onClick={async () => {
                                                                const supabase = getSupabaseClient();
                                                                const { data: annos } = await supabase.from('annotations').select('*').eq('paper_id', pitch.id);
                                                                setSelectedPaperDetails({ ...pitch, annotations: annos || [] });
                                                            }}
                                                            className="w-full justify-center px-5 py-3 rounded-xl bg-emerald-50 dark:bg-green-500/10 border border-emerald-250 dark:border-green-500/30 hover:bg-emerald-100 dark:hover:bg-green-500/20 text-emerald-700 dark:text-green-400 text-[11px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                                                        >
                                                            <Eye size={12} /> View Certificate
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Desktop View Table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-zinc-200 dark:border-white/10 text-[10px] uppercase text-zinc-555 dark:text-gray-555 tracking-widest font-mono">
                                                <th className="pb-6 font-black">Requested Audit Pitch</th>
                                                <th className="pb-6 font-black">Submitted By</th>
                                                <th className="pb-6 font-black">Reviewers & Statuses</th>
                                                <th className="pb-6 font-black">Assign Reviewer</th>
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
                                                        <td className="py-8 font-mono text-xs text-zinc-550 dark:text-gray-400">
                                                            @{pitch.authors}
                                                        </td>
                                                        <td className="py-8">
                                                            <div className="flex flex-wrap gap-2 max-w-xs">
                                                                {getReviewsForPaper(pitch).length === 0 ? (
                                                                    <span className="text-xs text-zinc-400 font-mono italic">No reviewers assigned</span>
                                                                ) : (
                                                                    getReviewsForPaper(pitch).map(r => {
                                                                        const revProfile = reviewers.find(rev => rev.id === r.reviewer_id);
                                                                        const revName = revProfile ? (revProfile.name || revProfile.email.split('@')[0]) : 'Unknown';
                                                                        return (
                                                                            <span key={r.reviewer_id} className={`text-[9px] font-black px-2.5 py-1 rounded-md uppercase font-mono tracking-wider border whitespace-nowrap ${
                                                                                r.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                                                                                r.status === 'reviewing' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400' :
                                                                                'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                                                                            }`}>
                                                                                {revName} ({r.status})
                                                                            </span>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-8">
                                                            {(() => {
                                                                const assignedReviewerIds = getReviewsForPaper(pitch).map(r => r.reviewer_id);
                                                                const availableReviewers = reviewers.filter(r => !assignedReviewerIds.includes(r.id));
                                                                return (
                                                                    <div className="flex gap-2 items-center animate-in fade-in duration-300">
                                                                        <select
                                                                            value={selectedReviewerForPaper[pitch.id] || ''}
                                                                            onChange={(e) => handleReviewerChange(pitch.id, e.target.value)}
                                                                            disabled={assigningId === pitch.id || availableReviewers.length === 0}
                                                                            className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs text-zinc-850 dark:text-gray-305 font-mono focus:border-cyan-500 outline-none w-48 cursor-pointer font-medium"
                                                                        >
                                                                            {availableReviewers.length === 0 ? (
                                                                                <option value="">All Reviewers Assigned</option>
                                                                            ) : (
                                                                                <>
                                                                                    <option value="">-- Choose --</option>
                                                                                    {availableReviewers.map(r => (
                                                                                        <option key={r.id} value={r.id}>{r.name || r.email}</option>
                                                                                    ))}
                                                                                </>
                                                                            )}
                                                                        </select>
                                                                        {availableReviewers.length > 0 && selectedReviewerForPaper[pitch.id] && (
                                                                            <button
                                                                                onClick={() => handleAssignReviewer(pitch.id)}
                                                                                disabled={assigningId === pitch.id}
                                                                                className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-md"
                                                                            >
                                                                                {assigningId === pitch.id ? <Loader className="animate-spin" size={10} /> : 'Confirm'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="py-8 text-right">
                                                            {getReviewsForPaper(pitch).some(r => r.status === 'completed') && (
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
                            <div className="admin-section-container p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
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
                                                    <div className="bg-zinc-100/50 dark:bg-[#0c0d10] p-5 border border-zinc-205 dark:border-white/5 rounded-2xl text-center">
                                                        <span className="text-[9px] text-zinc-500 dark:text-gray-500 uppercase font-mono font-bold tracking-wider">Assigned</span>
                                                        <div className="text-2xl font-black font-mono mt-1 text-zinc-800 dark:text-white">{reviewerPapers.length}</div>
                                                    </div>
                                                    <div className="bg-zinc-100/50 dark:bg-[#0c0d10] p-5 border border-zinc-205 dark:border-white/5 rounded-2xl text-center">
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
                            <div className="admin-section-container p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
                                <div className="flex items-center gap-3 mb-10 border-b border-zinc-100 dark:border-white/5 pb-6">
                                    <Users className="text-cyan-600 dark:text-cyan-400" size={24} />
                                    <h2 className="text-2xl font-bold uppercase tracking-tight text-zinc-900 dark:text-white">User Directory & Roles</h2>
                                </div>                                {/* Mobile View Card List */}
                                <div className="block md:hidden space-y-4">
                                    {allProfiles.length === 0 ? (
                                        <div className="py-12 text-center text-zinc-400 dark:text-gray-600 italic font-mono text-xs">No users registered in database.</div>
                                    ) : (
                                        allProfiles.map(profile => (
                                            <div key={profile.id} className="px-7 py-6 border border-zinc-200 dark:border-white/5 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/20 text-left">
                                                <div className="mb-3">
                                                    <div className="font-bold text-zinc-800 dark:text-gray-250 text-base">{profile.name || profile.email.split('@')[0]}</div>
                                                    <div className="text-[11px] text-zinc-550 dark:text-gray-405 font-mono">{profile.email}</div>
                                                </div>
                                                <div className="flex flex-col gap-2 border-t border-zinc-100 dark:border-white/5 pt-3 mb-3 text-xs">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono text-zinc-400 dark:text-gray-500 uppercase text-[10px]">Affiliation:</span>
                                                        <span className="text-zinc-555 dark:text-gray-300">{profile.affiliation || 'N/A'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono text-zinc-400 dark:text-gray-500 uppercase text-[10px]">Current Role:</span>
                                                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase font-mono tracking-wider ${
                                                            profile.role === 'admin' ? 'bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 text-cyan-600 dark:text-cyan-400' :
                                                            profile.role === 'reviewer' ? 'bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400' :
                                                            'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                                        }`}>{profile.role}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center gap-4">
                                                        <span className="font-mono text-zinc-400 dark:text-gray-500 uppercase text-[10px]">Modify Role:</span>
                                                        <select
                                                            value={profile.role}
                                                            disabled={updatingRoleId === profile.id}
                                                            onChange={(e) => handleUpdateUserRole(profile.id, e.target.value)}
                                                            className="bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-gray-255 outline-none focus:border-cyan-500 transition-all cursor-pointer font-bold w-40"
                                                        >
                                                            <option value="user" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold">User (Customer)</option>
                                                            <option value="reviewer" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold">Reviewer (Expert)</option>
                                                            <option value="admin" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold">Platform Admin</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Desktop View Table */}
                                <div className="hidden md:block overflow-x-auto">
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
                                                                <option value="user" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold">User (Customer)</option>
                                                                <option value="reviewer" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold">Reviewer (Expert)</option>
                                                                <option value="admin" className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-bold">Platform Admin</option>
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

                        {activeTab === 'skills' && (
                            <div className="admin-section-container relative p-8 sm:p-12 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-[32px] shadow-2xl animate-in fade-in duration-500 text-left">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10 border-b border-zinc-100 dark:border-white/5 pb-6">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <Cpu className="text-cyan-600 dark:text-cyan-400" size={24} />
                                            <h2 className="text-2xl font-bold uppercase tracking-tight text-zinc-900 dark:text-white">AI Skills & Prompt Manager</h2>
                                        </div>
                                        <p className="text-xs text-zinc-500 dark:text-gray-400 mt-2 max-w-3xl leading-relaxed">
                                            Define and refine the instructions, criteria, and specialized domain guidelines that the LLM uses to evaluate technology pitches. Active skills are automatically injected into the LLM system prompt.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleCreateNewSkill}
                                        className="w-full sm:w-auto px-6 py-3.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase tracking-wider text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/25"
                                    >
                                        <span className="text-sm font-black">+</span> Create Custom Skill
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-[500px]">
                                    {/* Left pane: Skills roster list */}
                                    <div className="lg:col-span-1 border-r border-zinc-250 dark:border-white/5 pr-0 lg:pr-8 flex flex-col gap-4 overflow-y-auto max-h-[600px]">
                                        <h3 className="text-xs font-bold text-zinc-500 dark:text-gray-400 uppercase tracking-widest font-mono mb-2">Available Skills ({skills.length})</h3>
                                        
                                        {skills.length === 0 ? (
                                            <div className="p-8 text-center border border-dashed border-zinc-200 dark:border-white/10 rounded-2xl text-zinc-500 dark:text-zinc-555 font-mono text-xs">
                                                No skills configured. Click the button above to create one.
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {skills.map((s) => {
                                                    const isSelected = selectedSkill && selectedSkill.id === s.id;
                                                    return (
                                                        <div
                                                            key={s.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => handleSelectSkill(s)}
                                                            className={`p-5 rounded-2xl border transition-all text-left cursor-pointer outline-none ${
                                                                isSelected
                                                                    ? 'border-cyan-500 bg-cyan-50/10 dark:bg-cyan-955/10 ring-1 ring-cyan-500/20'
                                                                    : 'border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-[#0c0d10] hover:border-zinc-300 dark:hover:border-white/10'
                                                            }`}
                                                        >
                                                            <div className="flex justify-between items-start gap-3 w-full">
                                                                <h4 className="font-bold text-sm text-zinc-900 dark:text-white line-clamp-1 flex-1">{s.title}</h4>
                                                                <span className={`inline-flex w-2.5 h-2.5 rounded-full shrink-0 ${s.is_active ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-zinc-400'}`} />
                                                            </div>
                                                            <div className="flex items-center justify-between gap-4 mt-3 pt-3 border-t border-zinc-200/50 dark:border-white/5">
                                                                <code className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold bg-cyan-500/5 px-2 py-1 rounded-md">{s.id}</code>
                                                                <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                                                    <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-zinc-400 dark:text-zinc-500">Active</span>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={s.is_active}
                                                                        onChange={(e) => handleToggleSkillActive(s, e.target.checked)}
                                                                        className="w-3.5 h-3.5 accent-cyan-500 cursor-pointer"
                                                                    />
                                                                </label>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right pane: Markdown skill editor workspace */}
                                    <div className="lg:col-span-2 flex flex-col h-full">
                                        {selectedSkill ? (
                                            <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
                                                <div className="flex justify-between items-center pb-4 border-b border-zinc-200/50 dark:border-white/5">
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider font-mono">
                                                        {isNewSkill ? 'Creating New Skill' : 'Editing Skill Profile'}
                                                    </h3>
                                                    {!isNewSkill && (
                                                        <button
                                                            onClick={() => handleDeleteSkill(selectedSkill.id)}
                                                            className="text-xs text-red-505 hover:text-red-400 font-mono font-bold flex items-center gap-1.5 cursor-pointer bg-red-500/5 px-3.5 py-2 rounded-xl border border-red-500/10 hover:bg-red-500/10 transition-all"
                                                        >
                                                            <Trash2 size={13} /> Delete Skill
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase tracking-wider font-mono">Skill ID (Slug)</label>
                                                        <input
                                                            type="text"
                                                            value={skillId}
                                                            onChange={(e) => setSkillId(e.target.value.toLowerCase())}
                                                            disabled={!isNewSkill}
                                                            placeholder="e.g. software-evaluation"
                                                            className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-cyan-500 transition-all font-mono disabled:opacity-50"
                                                        />
                                                        {isNewSkill && <p className="text-[9px] text-zinc-450 dark:text-zinc-500 font-mono">Only lowercase letters, numbers, and hyphens.</p>}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase tracking-wider font-mono">Skill Title</label>
                                                        <input
                                                            type="text"
                                                            value={skillTitle}
                                                            onChange={(e) => setSkillTitle(e.target.value)}
                                                            placeholder="e.g. Software & Architecture evaluation"
                                                            className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-cyan-500 transition-all font-bold"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 bg-zinc-50 dark:bg-black/30 border border-zinc-200/50 dark:border-white/5 rounded-2xl p-4">
                                                    <label className="flex items-center gap-3.5 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={skillIsActive}
                                                            onChange={(e) => setSkillIsActive(e.target.checked)}
                                                            className="w-4 h-4 accent-cyan-500 cursor-pointer"
                                                        />
                                                        <div className="text-left">
                                                            <div className="text-xs font-bold text-zinc-800 dark:text-white">Activate Guideline Card</div>
                                                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">When active, these guidelines are injected directly into the LLM context.</div>
                                                        </div>
                                                    </label>
                                                </div>

                                                <div className="space-y-2 flex-1 flex flex-col min-h-[300px]">
                                                    <label className="block text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase tracking-wider font-mono">Markdown Prompt Instructions</label>
                                                    <textarea
                                                        value={skillContent}
                                                        onChange={(e) => setSkillContent(e.target.value)}
                                                        placeholder="# Guidelines for evaluating software startups...&#10;- Look for code debt and architectural complexity.&#10;- Require API documentation and infrastructure layouts."
                                                        className="w-full flex-1 bg-zinc-50 dark:bg-black border border-zinc-250 dark:border-white/10 rounded-2xl p-5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-cyan-500 transition-all font-mono resize-none leading-relaxed"
                                                    />
                                                </div>

                                                <div className="pt-4 border-t border-zinc-200/50 dark:border-white/5 flex gap-4">
                                                    <button
                                                        onClick={handleSaveSkill}
                                                        disabled={isSavingSkill}
                                                        className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-55 text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20"
                                                    >
                                                        {isSavingSkill ? <Loader className="animate-spin" size={13} /> : 'Save Skill Guidelines'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleSelectSkill(null)}
                                                        className="px-6 py-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-700 dark:text-gray-300 font-bold uppercase tracking-wider text-xs rounded-xl transition-all cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-200 dark:border-white/10 rounded-[24px] p-8 text-center text-zinc-450 dark:text-zinc-500 font-mono text-xs min-h-[400px]">
                                                <Cpu className="text-zinc-300 dark:text-zinc-700 mb-4 animate-pulse" size={48} />
                                                <p className="font-bold text-zinc-650 dark:text-gray-400">AI Skills Editing Workspace</p>
                                                <p className="max-w-md mt-2 text-[10px] text-zinc-500 leading-relaxed">Select an active skill card from the left sidebar to edit, or click "Create Custom Skill" to add a new guideline template.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Paper Ingestion PDF Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-905/30 dark:bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/15 rounded-3xl shadow-2xl overflow-clip text-left animate-in zoom-in-95 duration-200">
                        <header className="p-8 border-b border-zinc-100 dark:border-white/10 flex justify-between items-center bg-gradient-to-r from-cyan-500/5 dark:from-cyan-950/20 to-transparent">
                            <div className="flex items-center gap-2">
                                <Upload className="text-cyan-500 dark:text-cyan-400" size={20} />
                                <h3 className="text-lg font-black uppercase tracking-tight text-zinc-900 dark:text-white">Add Research Paper</h3>
                            </div>
                            <button 
                                onClick={() => !uploading && setShowUploadModal(false)}
                                className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-zinc-550 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
                                disabled={uploading}
                            >
                                <X size={18} />
                            </button>
                        </header>

                        {/* Mode switcher tabs */}
                        <div className="flex border-b border-zinc-100 dark:border-white/5">
                            <button
                                type="button"
                                onClick={() => { setUploadMode('file'); setArxivPreview(null); setArxivError(''); }}
                                disabled={uploading}
                                className={`flex-1 flex items-center justify-center gap-2 py-4 text-[11px] font-black uppercase tracking-wider transition-all ${
                                    uploadMode === 'file'
                                        ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-500 bg-cyan-50/30 dark:bg-cyan-950/10'
                                        : 'text-zinc-500 dark:text-gray-500 hover:text-zinc-800 dark:hover:text-gray-300'
                                }`}
                            >
                                <FileText size={14} /> Local PDF
                            </button>
                            <button
                                type="button"
                                onClick={() => { setUploadMode('arxiv'); setFile(null); }}
                                disabled={uploading}
                                className={`flex-1 flex items-center justify-center gap-2 py-4 text-[11px] font-black uppercase tracking-wider transition-all ${
                                    uploadMode === 'arxiv'
                                        ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-500 bg-cyan-50/30 dark:bg-cyan-950/10'
                                        : 'text-zinc-500 dark:text-gray-500 hover:text-zinc-800 dark:hover:text-gray-300'
                                }`}
                            >
                                <Link size={14} /> arXiv Import
                            </button>
                        </div>

                        <form onSubmit={handleUploadPaper} className="p-8 space-y-6">
                            {uploadMode === 'file' ? (
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase tracking-wider font-mono ml-1">PDF Document</label>
                                    <input
                                        type="file"
                                        accept="application/pdf"
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
                            ) : (
                                <div className="space-y-3">
                                    <label className="block text-xs font-bold text-zinc-700 dark:text-gray-300 uppercase tracking-wider font-mono ml-1">arXiv Identifier or URL</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={arxivQuery}
                                            onChange={(e) => { setArxivQuery(e.target.value); setArxivError(''); setArxivPreview(null); }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFetchArxiv(); } }}
                                            disabled={uploading || arxivFetching}
                                            placeholder="e.g. 2303.08774 or arxiv.org/abs/..."
                                            className="flex-1 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl px-5 py-3.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-700 outline-none focus:border-cyan-500 transition-all font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleFetchArxiv}
                                            disabled={!arxivQuery.trim() || uploading || arxivFetching}
                                            className="px-5 py-3.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-[11px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                                        >
                                            {arxivFetching ? <Loader className="animate-spin" size={13} /> : 'Look Up'}
                                        </button>
                                    </div>

                                    {arxivError && (
                                        <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/20 rounded-xl">
                                            <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                                            <p className="text-xs text-red-600 dark:text-red-400 font-mono">{arxivError}</p>
                                        </div>
                                    )}

                                    {arxivPreview && (
                                        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 rounded-xl space-y-1.5">
                                            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-mono mb-2">
                                                <CheckCircle size={12} /> Paper Found — arXiv:{arxivPreview.arxivId}
                                            </div>
                                            <p className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">{arxivPreview.title}</p>
                                            <p className="text-[11px] text-zinc-500 dark:text-gray-400 font-mono">{arxivPreview.authors} · {arxivPreview.year}</p>
                                        </div>
                                    )}
                                </div>
                            )}

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
                                    disabled={uploading || (uploadMode === 'file' ? !file : !arxivPreview)}
                                    className="flex-1 py-4 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    {uploading ? 'Processing Ingestion...' : 'Ingest & Index Paper'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowUploadModal(false); setArxivQuery(''); setArxivPreview(null); setArxivError(''); setUploadMode('file'); }}
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
                <div className="fixed inset-0 z-[200] overflow-y-auto flex items-center justify-center p-4 bg-zinc-900/30 dark:bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
                    <div className="w-full max-w-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/15 rounded-3xl shadow-2xl overflow-clip max-h-[90vh] sm:max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
                        <header className="p-6 sm:p-8 border-b border-zinc-100 dark:border-white/10 flex justify-between items-start bg-gradient-to-r from-emerald-500/5 dark:from-emerald-955/20 to-transparent">
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
                        <div className="p-8 overflow-y-auto space-y-10 flex-1 text-left">
                          {(() => {
                            const completedReviews = paperReviews.filter(r => r.paper_id === selectedPaperDetails.id && r.status === 'completed');
                            
                            // Fallback to legacy single assignment
                            let displayReviews = completedReviews;
                            if (completedReviews.length === 0 && selectedPaperDetails.status === 'completed' && selectedPaperDetails.assessment) {
                              displayReviews = [{
                                reviewer_id: selectedPaperDetails.assigned_to,
                                status: 'completed',
                                assessment: selectedPaperDetails.assessment
                              }];
                            }

                            if (displayReviews.length === 0) {
                              return (
                                <div className="text-center py-12 text-zinc-500 dark:text-gray-450 italic font-mono text-xs">
                                  No completed reviewer assessments found.
                                </div>
                              );
                            }

                            return displayReviews.map((reviewRecord, rIdx) => {
                              const revProfile = reviewers.find(rev => rev.id === reviewRecord.reviewer_id);
                              const reviewerDisplayName = reviewRecord.assessment?.reviewer_name || revProfile?.name || revProfile?.email || 'Expert Reviewer';
                              const reviewerAffiliationName = reviewRecord.assessment?.reviewer_affiliation || revProfile?.affiliation || 'Expert Partner';
                              const reviewerAnnos = selectedPaperDetails.annotations ? selectedPaperDetails.annotations.filter(ann => {
                                if (!ann.reviewer_id) {
                                  return !reviewRecord.reviewer_id || reviewRecord.reviewer_id === selectedPaperDetails.assigned_to;
                                }
                                return ann.reviewer_id === reviewRecord.reviewer_id;
                              }) : [];

                              return (
                                <div key={reviewRecord.reviewer_id || rIdx} className="space-y-6 border-b border-zinc-200 dark:border-white/10 pb-8 last:border-b-0 last:pb-0">
                                  <div className="flex items-center gap-2 mb-4">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                    <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-550 dark:text-gray-450 font-mono">Assessment by {reviewerDisplayName}</h4>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="p-6 bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-white/5 rounded-2xl">
                                      <span className="text-[9px] uppercase font-bold text-zinc-505 dark:text-gray-505 font-mono">Expert Auditor</span>
                                      <h5 className="font-black text-base text-zinc-800 dark:text-gray-200 mt-1">{reviewerDisplayName}</h5>
                                      <p className="text-[10px] text-zinc-500 dark:text-gray-500 font-mono mt-1">{reviewerAffiliationName}</p>
                                    </div>
                                    <div className="p-6 bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-white/5 rounded-2xl flex justify-between items-center">
                                      <div>
                                        <span className="text-[9px] uppercase font-bold text-zinc-505 dark:text-gray-505 font-mono">Fidelity Score</span>
                                        <h5 className="font-mono font-black text-3xl text-emerald-600 dark:text-emerald-400 mt-1">{reviewRecord.assessment?.score}%</h5>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[9px] uppercase font-bold text-zinc-505 dark:text-gray-505 font-mono">Verdict</span>
                                        <div className="font-black text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mt-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-250 dark:border-emerald-500/20 rounded-lg">
                                          {reviewRecord.assessment?.verdict}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <span className="text-[9px] uppercase font-bold text-zinc-505 dark:text-gray-505 tracking-wider font-mono">Reviewer Assessment Notes</span>
                                    <div className="p-6 bg-zinc-50/50 dark:bg-black/40 border border-zinc-200 dark:border-white/5 rounded-2xl text-sm text-zinc-700 dark:text-gray-300 leading-relaxed font-mono whitespace-pre-line">
                                      {reviewRecord.assessment?.notes}
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <span className="text-[9px] uppercase font-bold text-zinc-505 dark:text-gray-505 tracking-wider font-mono">Highlights & Claims Annotated ({reviewerAnnos.length})</span>
                                    {reviewerAnnos.length > 0 ? (
                                      <div className="space-y-4">
                                        {reviewerAnnos.map((ann, idx) => (
                                          <div key={idx} className="p-6 bg-zinc-50/40 dark:bg-white/[0.01] border border-zinc-200 dark:border-white/5 rounded-2xl flex flex-col gap-3">
                                            <div className="flex justify-between items-center border-b border-zinc-200 dark:border-white/5 pb-2 text-[9px] font-mono text-zinc-500 dark:text-gray-500 uppercase">
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
                                      <div className="text-center py-6 border border-dashed border-zinc-205 dark:border-white/5 rounded-2xl text-zinc-400 dark:text-gray-600 italic text-xs font-mono">
                                        No claims annotations created by this reviewer.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          })()}
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
