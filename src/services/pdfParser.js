import * as pdfjsLib from 'pdfjs-dist';
import { embedText } from './geminiService';

// Dynamically set PDFJS worker to CDN to avoid complex Vite build configurations
const pdfjsVersion = pdfjsLib.version || '4.2.67';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;

// Extract page-by-page text from PDF file ArrayBuffer
export const parsePdfPages = async (arrayBuffer) => {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Simple reconstruction of lines
            let lastY = null;
            let paragraphs = [];
            let currentLine = "";

            for (const item of textContent.items) {
                // If y coordinate changes significantly, treat as new paragraph/line
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 12) {
                    if (currentLine.trim()) {
                        paragraphs.push(currentLine.trim());
                    }
                    currentLine = item.str;
                } else {
                    currentLine += (currentLine ? " " : "") + item.str;
                }
                lastY = item.transform[5];
            }
            if (currentLine.trim()) {
                paragraphs.push(currentLine.trim());
            }

            // Fallback if formatting extraction returned empty list
            const fullText = textContent.items.map(item => item.str).join(" ");
            if (paragraphs.length === 0 && fullText.trim()) {
                paragraphs = [fullText.trim()];
            }

            pages.push({
                page_number: i,
                text: fullText,
                paragraphs: paragraphs
            });
        }
        return pages;
    } catch (e) {
        console.error("PDF.js extraction failed:", e);
        throw new Error("Failed to parse PDF document text layer. Ensure the file is not corrupted.");
    }
};

// Split text into sliding-window chunks
export const chunkText = (text, size = 1000, overlap = 200) => {
    const chunks = [];
    if (!text) return chunks;
    
    for (let i = 0; i < text.length; i += (size - overlap)) {
        const chunk = text.substring(i, i + size).trim();
        if (chunk.length > 50) { // filter out tiny trailing chunks
            chunks.push(chunk);
        }
        if (i + size >= text.length) break;
    }
    return chunks;
};

// Ingests PDF file: uploads to Storage, extracts text, optionally generates embeddings, and saves to database
// geminiApiKey is optional — if absent, chunks are stored without vector embeddings
export const ingestPaper = async (file, title, authors, year, supabase, geminiApiKey, onProgress) => {
    if (!supabase) throw new Error("Supabase client is not configured.");

    const paperId = `doc_${Math.random().toString(36).substring(2, 10)}`;
    const fileExt = file.name.split('.').pop() || 'pdf';
    const storagePath = `${paperId}.${fileExt}`;

    try {
        // 1. Upload raw PDF to Supabase Storage bucket 'pdfs'
        onProgress?.("Uploading PDF file to storage...");
        
        // Ensure bucket exists in Supabase (or fails gracefully if public bucket is pre-configured)
        const { error: uploadError } = await supabase.storage
            .from('pdfs')
            .upload(storagePath, file, { cacheControl: '3600', upsert: true });

        if (uploadError) {
            console.warn("Storage upload error:", uploadError);
            throw new Error(`Failed to upload PDF to Supabase Storage: ${uploadError.message}. Make sure the 'pdfs' storage bucket exists and is public.`);
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('pdfs')
            .getPublicUrl(storagePath);

        // 2. Read array buffer to parse PDF text
        onProgress?.("Extracting text contents from PDF...");
        const arrayBuffer = await file.arrayBuffer();
        const pages = await parsePdfPages(arrayBuffer);

        // 3. Compile full text and chunk it
        onProgress?.("Generating text chunks for vector index...");
        const fullText = pages.map(p => p.text).join(" ");
        const chunks = chunkText(fullText, 1000, 200);

        if (chunks.length === 0) {
            throw new Error("No text content could be extracted from PDF.");
        }

        // 4. Save paper record in public.papers
        onProgress?.("Saving paper catalog record...");
        const { error: paperDbError } = await supabase
            .from('papers')
            .insert({
                id: paperId,
                title: title || file.name.replace('.pdf', ''),
                authors: authors || 'Unknown Author',
                year: parseInt(year) || new Date().getFullYear(),
                source: 'upload',
                pdf_url: publicUrl,
                status: 'unassigned'
            });

        if (paperDbError) throw new Error(`Database error saving paper: ${paperDbError.message}`);

        // 5. Optionally generate embeddings and save to paper_chunks table
        const hasEmbeddingKey = !!geminiApiKey;
        if (hasEmbeddingKey) {
            onProgress?.("Generating vector embeddings (Gemini API)...");
        } else {
            onProgress?.("Skipping embeddings (no Gemini key) — storing chunks as plain text...");
        }

        const chunkInserts = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunkTextContent = chunks[i];

            // Get vector embedding (768 dimensions) if a key is available
            let vector = null;
            if (hasEmbeddingKey) {
                onProgress?.(`Embedding chunk ${i + 1}/${chunks.length}...`);
                try {
                    vector = await embedText(chunkTextContent, geminiApiKey);
                } catch (err) {
                    console.error(`Failed to embed chunk ${i}:`, err);
                    throw new Error(`Embedding model call failed: ${err.message}`);
                }
            }

            chunkInserts.push({
                paper_id: paperId,
                content: chunkTextContent,
                embedding: vector,
                metadata: {
                    id: paperId,
                    title: title || file.name,
                    author: authors || 'Unknown Author',
                    year: parseInt(year) || new Date().getFullYear(),
                    source: 'upload',
                    chunk_index: i
                }
            });
        }

        // Batch insert chunks
        onProgress?.("Indexing chunks in Supabase vector store...");
        const { error: chunkDbError } = await supabase
            .from('paper_chunks')
            .insert(chunkInserts);

        if (chunkDbError) throw new Error(`Database error indexing chunks: ${chunkDbError.message}`);

        onProgress?.("Ingestion completed successfully!");
        return { paperId, pdfUrl: publicUrl, pagesCount: pages.length };
    } catch (e) {
        console.error("Ingestion failed:", e);
        // Attempt cleanup if paper was partially created
        await supabase.from('papers').delete().eq('id', paperId);
        await supabase.storage.from('pdfs').remove([storagePath]);
        throw e;
    }
};
