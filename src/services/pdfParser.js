import * as pdfjsLib from 'pdfjs-dist';
import { embedText } from './geminiService';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker to Vite-bundled asset, falling back to a version-matching CDN link
const pdfjsVersion = pdfjsLib.version || '5.7.284';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker || `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;


// Extract page-by-page text from PDF file ArrayBuffer
export const parsePdfPages = async (arrayBuffer) => {
    try {
        // Validate magic bytes: PDF files must start with "%PDF-"
        const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
        const header = String.fromCharCode(...headerBytes);
        if (header !== "%PDF-") {
            const sampleDecoder = new TextDecoder("utf-8");
            const sampleText = sampleDecoder.decode(new Uint8Array(arrayBuffer.slice(0, 500)));
            console.error("Expected PDF file, but received header:", header, "Sample content:", sampleText);
            throw new Error("The file downloaded is not a valid PDF document. The CORS proxy may have returned an HTML block page or error screen.");
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const pages = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Sanitize null characters (\u0000) which PostgreSQL does not support in text/jsonb fields
            const cleanItems = textContent.items.map(item => ({
                ...item,
                str: (item.str || '').replace(/\u0000/g, '')
            }));
            
            // Simple reconstruction of lines
            let lastY = null;
            let paragraphs = [];
            let currentLine = "";

            for (const item of cleanItems) {
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
            const fullText = cleanItems.map(item => item.str).join(" ");
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
        const cleanTitle = (title || file.name.replace('.pdf', '')).replace(/\u0000/g, '');
        const cleanAuthors = (authors || 'Unknown Author').replace(/\u0000/g, '');
        const { error: paperDbError } = await supabase
            .from('papers')
            .insert({
                id: paperId,
                title: cleanTitle,
                authors: cleanAuthors,
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
                    title: cleanTitle,
                    author: cleanAuthors,
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
