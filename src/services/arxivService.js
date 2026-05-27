/**
 * Service to retrieve metadata and PDF files from arXiv
 */

// Helper to extract arXiv ID from standard identifier formats or URLs
export const extractArxivId = (query) => {
    if (!query) return null;
    
    // Regular expression matching:
    // - Standard URLs: https://arxiv.org/abs/2303.08774
    // - PDF URLs: https://arxiv.org/pdf/2303.08774.pdf
    // - Identifiers: arXiv:2303.08774, 2303.08774v2
    const arxivIdRegex = /(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:)?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i;
    const match = query.match(arxivIdRegex);
    return match ? match[1] : query.trim();
};

// Fetch paper metadata from arXiv APIs via a public CORS proxy
export const fetchArxivMetadata = async (query) => {
    const arxivId = extractArxivId(query);
    if (!arxivId || !/^[0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?$/.test(arxivId)) {
        throw new Error("Could not parse a valid arXiv identifier. Use formats like '2303.08774' or 'https://arxiv.org/abs/2303.08774'.");
    }

    const apiUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(apiUrl)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error("Failed to query the arXiv registry. Please verify your connection.");
    }
    
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const entry = xmlDoc.querySelector("entry");
    if (!entry) {
        throw new Error(`No documents indexed under arXiv identifier: ${arxivId}`);
    }
    
    // Clean up title text formatting (remove newlines and excessive whitespace)
    const title = entry.querySelector("title")?.textContent?.trim()?.replace(/\s+/g, ' ') || "";
    
    // Retrieve authors
    const authors = Array.from(xmlDoc.querySelectorAll("entry > author > name"))
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .join(", ");
        
    const published = entry.querySelector("published")?.textContent || "";
    const year = published ? new Date(published).getFullYear() : new Date().getFullYear();
    
    // Construct standard direct PDF URL
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    
    return {
        arxivId,
        title,
        authors,
        year,
        pdfUrl
    };
};

// Download PDF as a File Blob using CORS proxy
export const downloadArxivPdfFile = async (pdfUrl, arxivId) => {
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(pdfUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error("Failed to stream PDF data from arXiv. The file may be temporarily unreachable.");
    }
    
    const blob = await response.blob();
    return new File([blob], `${arxivId}.pdf`, { type: 'application/pdf' });
};
