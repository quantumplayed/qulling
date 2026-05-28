import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Loader, AlertTriangle } from 'lucide-react';
import 'pdfjs-dist/web/pdf_viewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const PdfReviewer = ({ pdfUrl, annotations = [], onTextSelected, onAnnotationClick }) => {
    const [pdf, setPdf] = useState(null);
    const [numPages, setNumPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const containerRef = useRef(null);

    useEffect(() => {
        if (!pdfUrl) return;
        setLoading(true);
        setError('');

        const loadPdf = async () => {
            try {
                const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
                const pdfDoc = await loadingTask.promise;
                setPdf(pdfDoc);
                setNumPages(pdfDoc.numPages);
            } catch (err) {
                console.error("PDF loading failed:", err);
                setError(`Failed to load PDF document: ${err.message || err}`);
            } finally {
                setLoading(false);
            }
        };

        loadPdf();
    }, [pdfUrl]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-zinc-400">
                <Loader className="animate-spin text-purple-500 mb-4" size={28} />
                <span className="text-xs font-mono tracking-widest uppercase">Loading PDF document...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-red-500 bg-red-500/5 border border-red-500/20 rounded-3xl">
                <AlertTriangle className="mb-4" size={32} />
                <span className="text-sm font-semibold">{error}</span>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex flex-col items-center space-y-10 bg-zinc-100 dark:bg-zinc-950 p-8 overflow-y-auto h-full select-text">
            {Array.from({ length: numPages }, (_, index) => (
                <PdfPage
                    key={index + 1}
                    pdf={pdf}
                    pageNum={index + 1}
                    annotations={annotations.filter(a => a.page === index + 1)}
                    onTextSelected={onTextSelected}
                    onAnnotationClick={onAnnotationClick}
                />
            ))}
        </div>
    );
};

// Sub-component for individual PDF Page rendering
const PdfPage = ({ pdf, pageNum, annotations = [], onTextSelected, onAnnotationClick }) => {
    const canvasRef = useRef(null);
    const textLayerRef = useRef(null);
    const pageWrapperRef = useRef(null);
    const [renderComplete, setRenderComplete] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        let isCurrent = true;

        const renderPage = async () => {
            try {
                const page = await pdf.getPage(pageNum);
                if (!isCurrent) return;

                // Adjust scale for readable width (e.g. 1.25x scale)
                const viewport = page.getViewport({ scale: 1.25 });
                setDimensions({ width: viewport.width, height: viewport.height });

                // Render Canvas
                const canvas = canvasRef.current;
                if (!canvas) return;
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                };
                await page.render(renderContext).promise;

                if (!isCurrent) return;

                // Render Text Layer for selections
                const textLayerDiv = textLayerRef.current;
                if (textLayerDiv) {
                    textLayerDiv.innerHTML = '';
                    const textContent = await page.getTextContent();
                    
                    const textLayer = new pdfjsLib.TextLayer({
                        container: textLayerDiv,
                        textContentSource: textContent,
                        viewport: viewport,
                    });
                    await textLayer.render();
                }

                setRenderComplete(true);
            } catch (err) {
                console.error(`Page ${pageNum} render error:`, err);
            }
        };

        renderPage();

        return () => {
            isCurrent = false;
        };
    }, [pdf, pageNum]);

    // Handles user text selections on the text layer overlay
    const handleMouseUp = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const text = selection.toString().trim();
        if (text.length <= 3) return;

        // Verify the selection is actually inside this page wrapper
        const range = selection.getRangeAt(0);
        if (!pageWrapperRef.current.contains(range.commonAncestorContainer)) return;

        // Calculate highlights bounding rects relative to the page div wrapper
        const pageRect = pageWrapperRef.current.getBoundingClientRect();
        const clientRects = range.getClientRects();
        const bounding_rects = Array.from(clientRects).map(r => ({
            left: ((r.left - pageRect.left) / pageRect.width) * 100,
            top: ((r.top - pageRect.top) / pageRect.height) * 100,
            width: (r.width / pageRect.width) * 100,
            height: (r.height / pageRect.height) * 100
        }));

        if (bounding_rects.length > 0) {
            onTextSelected(text, pageNum, bounding_rects);
        }
    };

    return (
        <div
            ref={pageWrapperRef}
            className="pdf-page-wrapper relative border border-zinc-200 dark:border-white/5 shadow-md bg-white dark:bg-[#0c0d10] flex-shrink-0 select-text"
            style={{
                width: dimensions.width ? `${dimensions.width}px` : 'auto',
                height: dimensions.height ? `${dimensions.height}px` : 'auto',
            }}
            onMouseUp={handleMouseUp}
        >
            <canvas ref={canvasRef} className="block select-none pointer-events-none" />
            
            {/* Transparent Text Layer Overlay */}
            <div
                ref={textLayerRef}
                className="textLayer absolute inset-0 opacity-10 dark:opacity-20 hover:opacity-15 cursor-text select-text"
                style={{
                    width: dimensions.width ? `${dimensions.width}px` : '100%',
                    height: dimensions.height ? `${dimensions.height}px` : '100%',
                }}
            />

            {/* Highlights Overlay Layer */}
            {renderComplete && (
                <div className="absolute inset-0 pointer-events-none z-10">
                    {annotations.map((anno) => {
                        const rects = anno.bounding_rects || [];
                        return rects.map((rect, rIdx) => (
                            <div
                                key={`${anno.id}-${rIdx}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAnnotationClick(anno);
                                }}
                                style={{
                                    position: 'absolute',
                                    left: `${rect.left}%`,
                                    top: `${rect.top}%`,
                                    width: `${rect.width}%`,
                                    height: `${rect.height}%`,
                                }}
                                className="bg-purple-500/25 dark:bg-purple-500/35 border-b-2 border-purple-500 cursor-pointer pointer-events-auto hover:bg-purple-500/40 transition-colors rounded-sm"
                                title={anno.comment}
                            />
                        ));
                    })}
                </div>
            )}
            
            {/* Page number badge */}
            <div className="absolute top-4 right-5 text-[9px] font-mono text-zinc-400 dark:text-zinc-650 uppercase select-none font-bold bg-white/80 dark:bg-black/80 px-2 py-0.5 rounded shadow-sm z-20">
                Page {pageNum}
            </div>
        </div>
    );
};

export default PdfReviewer;
