import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ShieldCheck, FileText, CheckCircle, Clock, User, Zap, BookOpen, FileCode, Plus, Trash2, Award, ChevronRight, AlertTriangle, Loader } from 'lucide-react';
import { getSupabaseClient } from '../services/supabaseClient';
import { parsePdfPages } from '../services/pdfParser';
import PdfReviewer from './PdfReviewer';

const ExpertPortal = ({ currentUser }) => {
    const [papers, setPapers] = useState([]);
    const [selectedPaperId, setSelectedPaperId] = useState(null);
    const [paperContent, setPaperContent] = useState(null);
    const [activePaneTab, setActivePaneTab] = useState('reader'); // reader, pdf
    const [selectedText, setSelectedText] = useState('');
    const [selectedPageNum, setSelectedPageNum] = useState(1);
    const [critiqueComment, setCritiqueComment] = useState('');
    const [selectedRects, setSelectedRects] = useState(null);
    
    // Assessment form state
    const [score, setScore] = useState(75);
    const [verdict, setVerdict] = useState('Plausible & Sound');
    const [assessmentNotes, setAssessmentNotes] = useState('');
    
    const [loadingQueue, setLoadingQueue] = useState(true);
    const [loadingContent, setLoadingContent] = useState(false);
    const [submittingAssessment, setSubmittingAssessment] = useState(false);
    const [savingAnnotation, setSavingAnnotation] = useState(false);

    const readerContainerRef = useRef(null);

    useEffect(() => {
        fetchQueue();
    }, [currentUser]);

    const fetchQueue = async () => {
        setLoadingQueue(true);
        const supabase = getSupabaseClient();
        if (!supabase) {
            setLoadingQueue(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('paper_reviews')
                .select('*, papers(*)')
                .eq('reviewer_id', currentUser.id)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.code === '42P01') {
                    // Fallback to legacy structure if table isn't created yet
                    console.warn("paper_reviews table missing, falling back to papers direct query...");
                    const { data: legacyData, error: legacyError } = await supabase
                        .from('papers')
                        .select('*')
                        .eq('assigned_to', currentUser.id)
                        .order('created_at', { ascending: false });
                    if (legacyError) throw legacyError;
                    setPapers(legacyData || []);
                } else {
                    throw error;
                }
            } else {
                const formatted = (data || []).map(r => {
                    if (!r.papers) return null;
                    return {
                        ...r.papers,
                        status: r.status,
                        assessment: r.assessment,
                        review_id: r.id
                    };
                }).filter(Boolean);
                setPapers(formatted);
            }
        } catch (error) {
            console.error("Failed to fetch reviewer queue from Supabase:", error);
        } finally {
            setLoadingQueue(false);
        }
    };

    const handleSelectPaper = async (paperId) => {
        setSelectedPaperId(paperId);
        setPaperContent(null);
        setSelectedText('');
        setCritiqueComment('');
        setLoadingContent(true);
        
        const supabase = getSupabaseClient();
        if (!supabase) {
            setLoadingContent(false);
            return;
        }

        try {
            const paper = papers.find(p => p.id === paperId);
            if (!paper) throw new Error("Paper metadata not found in memory.");

            let pages = [];
            
            // If the source is 'pitch', it is a raw text startup audit request (stored in pdf_url)
            if (paper.source === 'pitch') {
                pages = [{
                    page_number: 1,
                    text: paper.pdf_url || "No pitch text saved",
                    paragraphs: [paper.pdf_url || "No pitch text saved"]
                }];
                setActivePaneTab('reader');
            } else if (paper.pdf_url) {
                // If it is an academic paper PDF, parse it in the browser
                const response = await fetch(paper.pdf_url);
                if (!response.ok) throw new Error("Failed to download PDF binary from storage");
                
                const arrayBuffer = await response.arrayBuffer();
                pages = await parsePdfPages(arrayBuffer);
                setActivePaneTab('pdf'); // Default to interactive PDF view for PDF papers
            } else {
                pages = [{
                    page_number: 1,
                    text: "No text content available.",
                    paragraphs: ["This is a mock paper record seeded from database. No original PDF file is associated."]
                }];
            }

            // Fetch annotations from database (isolate comments to active reviewer)
            let annos = [];
            const { data: filteredAnnos, error: annoErr } = await supabase
                .from('annotations')
                .select('*')
                .eq('paper_id', paperId)
                .eq('reviewer_id', currentUser.id);

            if (annoErr) {
                if (annoErr.code === '42703' || annoErr.message?.includes('reviewer_id')) {
                    // Fallback to legacy/unfiltered queries if database hasn't been migrated yet
                    console.warn("reviewer_id column missing on annotations, falling back to unfiltered query...");
                    const { data: fallbackAnnos, error: fbAnnoErr } = await supabase
                        .from('annotations')
                        .select('*')
                        .eq('paper_id', paperId);
                    if (fbAnnoErr) throw fbAnnoErr;
                    annos = fallbackAnnos || [];
                } else {
                    throw annoErr;
                }
            } else {
                annos = filteredAnnos || [];
            }

            setPaperContent({
                id: paper.id,
                title: paper.title,
                authors: paper.authors,
                year: paper.year,
                pdf_url: paper.pdf_url,
                source: paper.source,
                pages: pages,
                annotations: annos || []
            });
            
            // Set overall assessment default fields if they exist
            if (paper.assessment) {
                setScore(paper.assessment.score || 75);
                setVerdict(paper.assessment.verdict || 'Plausible & Sound');
                setAssessmentNotes(paper.assessment.notes || '');
            } else {
                setScore(75);
                setVerdict('Plausible & Sound');
                setAssessmentNotes('');
            }
        } catch (error) {
            console.error("Failed to load/parse paper content:", error);
            alert(`Error loading paper content: ${error.message || 'Check network connection'}`);
            setSelectedPaperId(null);
        } finally {
            setLoadingContent(false);
        }
    };

    const handleTextSelection = (pageNum) => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text.length > 3) {
            setSelectedText(text);
            setSelectedPageNum(pageNum);
        }
    };

    const clearSelection = () => {
        setSelectedText('');
        setCritiqueComment('');
        setSelectedRects(null);
        window.getSelection()?.removeAllRanges();
    };

    const handleSaveAnnotation = async () => {
        if (!selectedText || !critiqueComment.trim()) return;
        setSavingAnnotation(true);

        const supabase = getSupabaseClient();
        if (!supabase) return;

        try {
            // Save annotation record to database
            const payload = {
                paper_id: selectedPaperId,
                reviewer_id: currentUser.id,
                text: selectedText,
                comment: critiqueComment.trim(),
                page: selectedPageNum,
                bounding_rects: selectedRects || null
            };

            let { data, error } = await supabase
                .from('annotations')
                .insert(payload)
                .select()
                .single();

            if (error) {
                // If it fails because reviewer_id or bounding_rects doesn't exist, try safe fallback
                console.warn("Insert failed, trying safe fallback payload...", error.message);
                const fallbackPayload = {
                    paper_id: selectedPaperId,
                    text: selectedText,
                    comment: critiqueComment.trim(),
                    page: selectedPageNum
                };
                
                // If reviewer_id column is supported, keep it
                if (!error.message?.includes('reviewer_id') && !error.code?.includes('42703')) {
                    fallbackPayload.reviewer_id = currentUser.id;
                }
                
                const { data: fbData, error: fbError } = await supabase
                    .from('annotations')
                    .insert(fallbackPayload)
                    .select()
                    .single();
                
                if (fbError) throw fbError;
                data = fbData;
            }

            // Update local paper state
            setPaperContent(prev => ({
                ...prev,
                annotations: [...(prev.annotations || []), data]
            }));

            // Automatically set status to "reviewing" if it was just "assigned"
            const paper = papers.find(p => p.id === selectedPaperId);
            if (paper && paper.status === 'assigned') {
                const { error: statusErr } = await supabase
                    .from('paper_reviews')
                    .update({ status: 'reviewing' })
                    .eq('paper_id', selectedPaperId)
                    .eq('reviewer_id', currentUser.id);

                if (statusErr && statusErr.code === '42P01') {
                    // Fallback to updating papers table
                    await supabase.from('papers').update({ status: 'reviewing' }).eq('id', selectedPaperId);
                }
                await fetchQueue();
            }

            clearSelection();
        } catch (error) {
            console.error("Error saving annotation:", error);
            alert("Database Error: Failed to save annotation.");
        } finally {
            setSavingAnnotation(false);
        }
    };

    const handleDeleteAnnotation = async (annoId) => {
        if (!confirm("Are you sure you want to delete this comment?")) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;

        try {
            const { error } = await supabase
                .from('annotations')
                .delete()
                .eq('id', annoId);

            if (error) throw error;

            // Remove from local paper state
            setPaperContent(prev => ({
                ...prev,
                annotations: prev.annotations.filter(a => a.id !== annoId)
            }));
        } catch (error) {
            console.error("Error deleting annotation:", error);
            alert("Database Error: Failed to delete annotation.");
        }
    };

    const handleSubmitAssessment = async () => {
        if (!assessmentNotes.trim()) {
            alert("Please fill in overall assessment notes before submitting.");
            return;
        }
        
        setSubmittingAssessment(true);
        const supabase = getSupabaseClient();
        
        try {
            const assessment_data = {
                score: score,
                verdict: verdict,
                notes: assessmentNotes.trim(),
                submitted_at: new Date().toISOString(),
                reviewer_name: currentUser.name || currentUser.email || 'Anonymous Reviewer',
                reviewer_affiliation: currentUser.affiliation || 'Expert Partner'
            };

            let { error } = await supabase
                .from('paper_reviews')
                .update({
                    assessment: assessment_data,
                    status: 'completed'
                })
                .eq('paper_id', selectedPaperId)
                .eq('reviewer_id', currentUser.id);

            if (error) {
                if (error.code === '42P01') {
                    // Fallback to papers legacy table
                    console.warn("paper_reviews table missing, falling back to papers direct update...");
                    const { error: papersErr } = await supabase
                        .from('papers')
                        .update({
                            assessment: assessment_data,
                            status: 'completed'
                        })
                        .eq('id', selectedPaperId);
                    if (papersErr) throw papersErr;
                } else {
                    throw error;
                }
            }
            
            alert("Audit Completed & Certificate Issued!");
            setSelectedPaperId(null);
            setPaperContent(null);
            await fetchQueue();
        } catch (error) {
            console.error("Error submitting assessment:", error);
            alert("Database Error: Failed to save assessment.");
        } finally {
            setSubmittingAssessment(false);
        }
    };

    // Helper to render paragraph with highlighted annotations inline
    const renderParagraphWithHighlights = (paraText, annotations, pageNum) => {
        const pageAnnotations = annotations.filter(a => a.page === pageNum);
        if (pageAnnotations.length === 0) return paraText;

        let elements = [paraText];
        
        pageAnnotations.forEach(ann => {
            const searchText = ann.text;
            const nextElements = [];
            
            elements.forEach(item => {
                if (typeof item === 'string' && item.includes(searchText)) {
                    const parts = item.split(searchText);
                    for (let i = 0; i < parts.length; i++) {
                        nextElements.push(parts[i]);
                        if (i < parts.length - 1) {
                            nextElements.push(
                                <mark 
                                    key={`${ann.id}-${i}`} 
                                    className="bg-violet-200 dark:bg-purple-500/30 text-violet-800 dark:text-purple-200 border-b-2 border-violet-400 dark:border-purple-500 px-1 cursor-pointer font-sans rounded"
                                    title={ann.comment}
                                >
                                    {searchText}
                                </mark>
                            );
                        }
                    }
                } else {
                    nextElements.push(item);
                }
            });
            elements = nextElements;
        });
        
        return elements;
    };

    const activePaper = papers.find(p => p.id === selectedPaperId);

    const statusBadge = (status) => {
        const styles = {
            completed: 'bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400',
            reviewing: 'bg-blue-100 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/20 text-blue-700 dark:text-blue-400',
            assigned: 'bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 text-amber-700 dark:text-amber-400',
        };
        return styles[status] || styles.assigned;
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white py-16 px-6 sm:px-12 font-sans relative overflow-hidden">
            {/* Background neon glows */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.03)_0%,transparent_70%)] pointer-events-none" />
            <div className="absolute top-20 left-20 w-[600px] h-[600px] bg-purple-500/5 blur-[130px] rounded-full pointer-events-none" />

            <div className="dashboard-container relative z-10 max-w-7xl mx-auto">
                {/* Header */}
                <header className="pb-8 border-b border-zinc-200 dark:border-white/10 mb-12">
                    {selectedPaperId ? (
                        <div>
                            <div className="flex justify-between items-start md:items-center gap-4 flex-col md:flex-row">
                                <button
                                    onClick={() => { setSelectedPaperId(null); setPaperContent(null); }}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/50 hover:bg-zinc-150 dark:hover:bg-zinc-900/80 text-xs font-bold text-zinc-650 dark:text-gray-300 transition-all cursor-pointer shadow-sm"
                                >
                                    <ArrowLeft size={14} /> Back to Overview
                                </button>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full font-mono ${statusBadge(activePaper?.status)}`}>
                                    {activePaper?.status || 'reviewing'}
                                </span>
                            </div>
                            <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white mt-6 leading-snug">
                                {paperContent?.title || activePaper?.title || "Loading Document..."}
                            </h1>
                            <p className="text-xs text-zinc-550 dark:text-gray-500 font-mono mt-2">
                                {paperContent?.source === 'pitch' ? 'Startup Audit Pitch' : 'Scientific Literature'} — By {paperContent?.authors || activePaper?.authors || "Unknown"}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-purple-100 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-500/10">
                                    <ShieldCheck className="text-purple-600 dark:text-purple-400" size={26} />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-black tracking-tighter uppercase text-zinc-900 dark:text-white">
                                        Expert Audit Workspace
                                    </h1>
                                    <p className="text-[10px] text-zinc-550 dark:text-gray-550 uppercase tracking-widest font-mono mt-1">
                                        Reviewer: <span className="font-bold text-purple-600 dark:text-purple-400">{currentUser.name || currentUser.email}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </header>

                {/* Dashboard View (No selected paper) */}
                {!selectedPaperId ? (
                    <div className="max-w-5xl mx-auto">
                        <div className="flex items-center gap-2 mb-8 ml-1">
                            <Clock size={15} className="text-zinc-400 dark:text-gray-500" />
                            <h2 className="text-xs font-black text-zinc-500 dark:text-gray-550 uppercase tracking-[0.2em] font-mono">
                                Assigned Audits Queue
                            </h2>
                        </div>

                        {loadingQueue ? (
                            <div className="p-24 text-center border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-3xl shadow-sm">
                                <Loader className="animate-spin text-purple-500 dark:text-purple-400 mx-auto" size={32} />
                            </div>
                        ) : papers.length === 0 ? (
                            <div className="p-24 text-center border border-dashed border-zinc-200 dark:border-white/10 bg-white dark:bg-transparent rounded-3xl text-zinc-405 dark:text-gray-650 text-sm italic font-mono">
                                No audits currently assigned to your account.
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-2 gap-6">
                                {papers.map(paper => (
                                    <div
                                        key={paper.id}
                                        onClick={() => handleSelectPaper(paper.id)}
                                        className="p-8 cursor-pointer transition-all border border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0f1014]/60 hover:border-purple-400 dark:hover:border-purple-500/50 hover:bg-purple-500/[0.01] rounded-3xl text-left hover:translate-y-[-4px] shadow-sm hover:shadow-xl flex flex-col justify-between min-h-48 group"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start gap-3 mb-4">
                                                <span className="text-[10px] font-mono text-purple-500 dark:text-purple-400 font-bold tracking-wider">
                                                    #{String(paper.id).slice(0, 8).toUpperCase()}
                                                </span>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full font-mono ${statusBadge(paper.status)}`}>
                                                    {paper.status}
                                                </span>
                                            </div>
                                            <h3 className="font-bold text-base text-zinc-850 dark:text-white group-hover:text-purple-650 dark:group-hover:text-purple-400 leading-snug transition-colors line-clamp-2">
                                                {paper.title.replace('Audit Request: ', '')}
                                            </h3>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-zinc-100 dark:border-white/5 pt-4 mt-6">
                                            <p className="text-[11px] text-zinc-500 dark:text-gray-500 truncate font-mono max-w-[200px]">
                                                {paper.source === 'pitch' ? `@${paper.authors}` : paper.authors}
                                            </p>
                                            <span className="text-purple-600 dark:text-purple-400 group-hover:translate-x-1.5 transition-transform flex items-center gap-1 font-bold text-xs uppercase tracking-wider font-mono">
                                                Review Audit <ChevronRight size={14} />
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Review Workspace (A paper is selected) */
                    <div>
                        {loadingContent ? (
                            <div className="flex flex-col items-center justify-center min-h-[550px] border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-3xl shadow-xl">
                                <Loader className="animate-spin text-purple-500 dark:text-purple-400 mb-4" size={32} />
                                <span className="text-xs font-bold text-zinc-400 dark:text-gray-500 uppercase tracking-[0.25em] font-mono">
                                    Loading workspace…
                                </span>
                            </div>
                        ) : paperContent ? (
                            <div className="grid lg:grid-cols-12 gap-8">
                                {/* Left Pane - Reader / PDF Toggle */}
                                <div className="lg:col-span-7 flex flex-col h-[55vh] lg:h-[78vh] border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-3xl overflow-clip shadow-2xl">
                                    <header className="px-8 py-6 border-b border-zinc-100 dark:border-white/5 flex justify-between items-center bg-zinc-50 dark:bg-black/40">
                                        <div className="flex items-center gap-2">
                                            <BookOpen size={16} className="text-purple-500 dark:text-purple-400" />
                                            <span className="text-xs font-bold text-zinc-650 dark:text-gray-400 uppercase tracking-wider font-mono">
                                                {paperContent.source === 'pitch' ? 'Pitch Claims Reader' : 'Document Reader'}
                                            </span>
                                        </div>
                                        {paperContent.pdf_url && paperContent.source !== 'pitch' && (
                                            <div className="flex bg-zinc-100 dark:bg-black p-0.5 border border-zinc-200 dark:border-white/10 rounded-xl">
                                                <button
                                                    onClick={() => setActivePaneTab('reader')}
                                                    className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${activePaneTab === 'reader' ? 'bg-white dark:bg-purple-600 text-purple-700 dark:text-white shadow-sm' : 'text-zinc-400 dark:text-gray-500 hover:text-zinc-700 dark:hover:text-white'}`}
                                                >
                                                    Reader
                                                </button>
                                                <button
                                                    onClick={() => setActivePaneTab('pdf')}
                                                    className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${activePaneTab === 'pdf' ? 'bg-white dark:bg-purple-600 text-purple-700 dark:text-white shadow-sm' : 'text-zinc-400 dark:text-gray-500 hover:text-zinc-700 dark:hover:text-white'}`}
                                                >
                                                    PDF
                                                </button>
                                            </div>
                                        )}
                                    </header>

                                    <div className="flex-1 overflow-y-auto p-8" ref={readerContainerRef}>
                                        {activePaneTab === 'pdf' && paperContent.pdf_url && paperContent.source !== 'pitch' ? (
                                            <PdfReviewer
                                                pdfUrl={paperContent.pdf_url}
                                                annotations={paperContent.annotations}
                                                onTextSelected={(text, pageNum, rects) => {
                                                    setSelectedText(text);
                                                    setSelectedPageNum(pageNum);
                                                    setSelectedRects(rects);
                                                }}
                                                onAnnotationClick={(anno) => {
                                                    // Highlight clicked commentary box
                                                    const annoEl = document.getElementById(`anno-card-${anno.id}`);
                                                    if (annoEl) {
                                                        annoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        annoEl.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'dark:ring-offset-black');
                                                        setTimeout(() => {
                                                            annoEl.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'dark:ring-offset-black');
                                                        }, 2500);
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <div className="space-y-8 max-w-2xl mx-auto">
                                                {paperContent.pages.map(page => (
                                                    <div
                                                        key={page.page_number}
                                                        className="p-10 bg-zinc-50/50 dark:bg-[#0c0d10] border border-zinc-200 dark:border-white/5 rounded-[20px] relative shadow-sm select-text"
                                                        onMouseUp={() => handleTextSelection(page.page_number)}
                                                    >
                                                        <div className="absolute top-4 right-5 text-[9px] font-mono text-zinc-400 dark:text-zinc-650 uppercase select-none font-bold">
                                                            Page {page.page_number}
                                                        </div>
                                                        <div className="space-y-4 text-zinc-800 dark:text-zinc-100 text-sm leading-relaxed text-left font-serif pt-4">
                                                            {page.paragraphs.map((p, idx) => (
                                                                <p key={idx}>
                                                                    {renderParagraphWithHighlights(p, paperContent.annotations, page.page_number)}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Pane - Annotations & Assessment */}
                                <div className="lg:col-span-5 flex flex-col h-auto lg:h-[78vh] overflow-y-auto space-y-6">
                                    
                                    {/* New Annotation Form */}
                                    {selectedText && (
                                        <div className="p-7 sm:p-9 border border-purple-250 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-950/5 rounded-3xl shadow-md text-left animate-in slide-in-from-top-4 duration-300">
                                            <div className="flex justify-between items-center mb-4">
                                                <span className="text-xs font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 font-mono">
                                                    Add Commentary
                                                </span>
                                                <span className="text-[10px] text-zinc-405 dark:text-gray-500 font-mono font-bold">
                                                    Page {selectedPageNum}
                                                </span>
                                            </div>
                                            <div className="p-4 bg-white dark:bg-black/50 border border-zinc-200 dark:border-white/5 rounded-xl text-xs text-zinc-550 dark:text-gray-400 italic mb-4 max-h-24 overflow-y-auto select-text font-serif leading-relaxed">
                                                "{selectedText}"
                                            </div>
                                            <textarea
                                                value={critiqueComment}
                                                onChange={(e) => setCritiqueComment(e.target.value)}
                                                placeholder="Add critique or fact-check comment..."
                                                className="w-full h-24 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl p-4 text-xs text-zinc-800 dark:text-gray-300 placeholder-zinc-400 dark:placeholder-zinc-700 focus:border-purple-500 outline-none resize-none mb-4 transition-colors"
                                            />
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={handleSaveAnnotation}
                                                    disabled={savingAnnotation || !critiqueComment.trim()}
                                                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-purple-500/10"
                                                >
                                                    {savingAnnotation ? 'Saving…' : 'Save Comment'}
                                                </button>
                                                <button
                                                    onClick={clearSelection}
                                                    className="px-4 py-3 border border-zinc-200 dark:border-white/10 bg-white dark:bg-transparent hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-550 dark:text-gray-450 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Annotations List */}
                                    <div className="p-7 sm:p-9 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-3xl shadow-lg text-left">
                                        <h3 className="text-[10px] font-bold text-zinc-500 dark:text-gray-400 uppercase tracking-[0.25em] mb-4 pb-3 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2 font-mono">
                                            <FileText size={14} />
                                            Comments ({paperContent.annotations?.length || 0})
                                        </h3>
                                        
                                        {paperContent.annotations?.length === 0 ? (
                                            <div className="py-8 text-center text-zinc-400 dark:text-gray-650 text-xs italic font-mono">
                                                Select text in the reader to add comments.
                                            </div>
                                        ) : (
                                            <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                                                {paperContent.annotations.map(anno => (
                                                    <div key={anno.id} id={`anno-card-${anno.id}`} className="p-5 bg-zinc-50 dark:bg-black/40 border border-zinc-150 dark:border-white/5 rounded-2xl flex gap-3 items-start justify-between group transition-all duration-300">
                                                        <div className="flex-1 text-left min-w-0">
                                                            <div className="text-[9px] font-mono text-zinc-400 dark:text-gray-550 font-bold uppercase mb-1.5">
                                                                Page {anno.page}
                                                            </div>
                                                            <p className="text-[11px] text-zinc-500 dark:text-gray-450 italic truncate mb-2 font-serif">"{anno.text}"</p>
                                                            <div className="p-3 bg-purple-500/5 dark:bg-purple-950/10 border border-purple-200/50 dark:border-purple-500/10 rounded-xl text-[11px] text-purple-750 dark:text-purple-300 leading-relaxed font-sans font-medium">
                                                                {anno.comment}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteAnnotation(anno.id)}
                                                            className="text-zinc-350 dark:text-zinc-650 hover:text-red-500 dark:hover:text-red-405 transition-colors p-1 rounded-lg ml-1 cursor-pointer shrink-0"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Assessment Form */}
                                    <div className="p-7 sm:p-9 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0f1014] rounded-3xl shadow-xl text-left flex-1 flex flex-col justify-between">
                                        <div>
                                            <h3 className="text-[10px] font-bold text-purple-650 dark:text-purple-400 uppercase tracking-[0.25em] mb-6 pb-3 border-b border-zinc-100 dark:border-white/5 flex items-center gap-2 font-mono">
                                                <Award size={14} />
                                                Evaluation Summary
                                            </h3>
                                            
                                            <div className="space-y-6">
                                                {/* Score slider */}
                                                <div>
                                                    <div className="flex justify-between text-xs font-bold mb-2">
                                                        <span className="text-zinc-500 dark:text-gray-450">Feasibility Score</span>
                                                        <span className="font-bold text-purple-650 dark:text-purple-400 font-mono text-sm">{score}%</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0" max="100"
                                                        value={score}
                                                        onChange={(e) => setScore(parseInt(e.target.value))}
                                                        className="w-full accent-purple-600 dark:accent-purple-400 cursor-pointer h-2 bg-zinc-100 dark:bg-zinc-950 rounded-lg appearance-none"
                                                    />
                                                    <div className="flex justify-between text-[8px] text-zinc-400 dark:text-gray-600 mt-1.5 uppercase font-mono font-bold">
                                                        <span>0 — Flawed</span>
                                                        <span>100 — Sound</span>
                                                    </div>
                                                </div>

                                                {/* Verdict select */}
                                                <div>
                                                    <label className="block text-xs font-bold text-zinc-500 dark:text-gray-455 mb-2 font-mono uppercase tracking-wider">Scientific Verdict</label>
                                                    <select
                                                        value={verdict}
                                                        onChange={(e) => setVerdict(e.target.value)}
                                                        className="w-full bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl p-3.5 text-sm text-zinc-800 dark:text-zinc-300 focus:border-purple-500 outline-none transition-colors cursor-pointer font-medium"
                                                    >
                                                        <option value="Plausible & Sound">Plausible &amp; Sound</option>
                                                        <option value="Debatable / Highly Speculative">Debatable / Speculative</option>
                                                        <option value="Flawed / Physical Violations">Flawed / Physics Violations</option>
                                                        <option value="Unrealistic Qubit/Gate Requirements">Unrealistic Engineering</option>
                                                    </select>
                                                </div>

                                                {/* Notes textarea */}
                                                <div>
                                                    <label className="block text-xs font-bold text-zinc-500 dark:text-gray-455 mb-2 font-mono uppercase tracking-wider">Assessment Notes</label>
                                                    <textarea
                                                        value={assessmentNotes}
                                                        onChange={(e) => setAssessmentNotes(e.target.value)}
                                                        placeholder="State critical findings, caveats, and reasoning behind this paper's score..."
                                                        className="w-full h-32 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-white/10 rounded-xl p-4 text-xs text-zinc-800 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-700 focus:border-purple-500 outline-none resize-none transition-colors"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleSubmitAssessment}
                                            disabled={submittingAssessment || !assessmentNotes.trim()}
                                            className="w-full py-4 mt-6 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.2em] text-xs transition-all rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {submittingAssessment ? (
                                                <Loader className="animate-spin" size={15} />
                                            ) : (
                                                <ShieldCheck size={15} />
                                            )}
                                            {activePaper?.status === 'completed' ? 'Update Evaluation' : 'Complete & Sign Review'}
                                        </button>
                                    </div>

                                </div>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExpertPortal;
