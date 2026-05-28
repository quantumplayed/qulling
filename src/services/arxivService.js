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

// Helper to fetch using multiple CORS proxy fallbacks
const fetchWithProxy = async (url) => {
    const proxies = [
        `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    let lastError = null;
    for (const proxy of proxies) {
        try {
            const response = await fetch(proxy);
            if (response.ok) {
                return response;
            }
            lastError = new Error(`Proxy returned status ${response.status}`);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("All CORS proxies failed to connect.");
};

// Fetch paper metadata from arXiv APIs via a public CORS proxy
export const fetchArxivMetadata = async (query) => {
    const arxivId = extractArxivId(query);
    if (!arxivId || !/^[0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?$/.test(arxivId)) {
        throw new Error("Could not parse a valid arXiv identifier. Use formats like '2303.08774' or 'https://arxiv.org/abs/2303.08774'.");
    }

    const apiUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
    
    try {
        const response = await fetchWithProxy(apiUrl);
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
    } catch (err) {
        throw new Error(`Failed to query the arXiv registry: ${err.message}. Please verify your connection.`);
    }
};

// Download PDF as a File Blob using CORS proxy
export const downloadArxivPdfFile = async (pdfUrl, arxivId) => {
    try {
        const response = await fetchWithProxy(pdfUrl);
        const blob = await response.blob();
        return new File([blob], `${arxivId}.pdf`, { type: 'application/pdf' });
    } catch (err) {
        throw new Error(`Failed to stream PDF data from arXiv: ${err.message}. The file may be temporarily unreachable.`);
    }
};

