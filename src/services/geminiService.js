// Load Gemini API Key from browser localStorage or environment variables
export const getGeminiApiKey = () => {
    return localStorage.getItem('qulling_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
};

// Call Google Gemini API to generate embeddings using text-embedding-004
export const embedText = async (text, apiKey) => {
    if (!apiKey) throw new Error("Gemini API key is not configured.");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            content: {
                parts: [{ text: text }]
            }
        })
    });
    
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Failed to generate text embedding");
    }
    
    const data = await response.json();
    return data.embedding?.values; // Array of 768 float values
};

// Call Gemini 2.5 Flash to generate initial pitch draft and academic citations (Turn 1)
export const generateInitialDraft = async (pitch, apiKey, skillsText) => {
    if (!apiKey) throw new Error("Gemini API key is not configured.");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const roleDescription = `You are a professional Deep Tech Scientific Due Diligence Analyst. Your goal is to analyze the user's technology proposal and identify the 2-3 most relevant academic papers, preprints, or key scientific studies that are critical to verifying or validating the claims in this proposal.
    
    Please incorporate the following specific guidelines if applicable:
    ${skillsText || '- Identify key scientific references.\n- Highlight engineering risks and physical limits.'}`;

    const prompt = `
    ${roleDescription}
    
    Startup Technical Pitch:
    "${pitch}"
    
    Your task is to analyze the pitch based on your scientific knowledge and identify the 2-3 most relevant publications (by exact title and author if possible, or major research papers/proceedings) that are critical to checking this technology.
    
    You must respond in a VALID JSON format with these exact keys:
    - "draft_assessment": A preliminary tech feasibility assessment (1-2 paragraphs).
    - "citations": An array of objects, where each object has:
      - "title": The precise title of the paper.
      - "authors": The authors of the paper (comma-separated).
      - "year": The year of publication (integer).
    `;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Failed to generate initial draft");
    }

    const data = await response.json();
    try {
        const jsonText = data.candidates[0].content.parts[0].text;
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse initial draft JSON:", e);
        throw new Error("Gemini returned invalid JSON structure in draft phase.");
    }
};

// Call Gemini 2.5 Flash to perform refined startup pitch analysis incorporating human annotations (Turn 2)
export const generateAnalysis = async (pitch, initialDraft, matchedAnnotations, apiKey, skillsText) => {
    if (!apiKey) throw new Error("Gemini API key is not configured.");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
    const roleDescription = `You are a professional Deep Tech Scientific Due Diligence Analyst. Your goal is to provide a rigorous, objective, and evidence-based analysis of the user's technology proposal by refining a preliminary draft assessment based on expert human reviews from our database.
    
    In addition, you must incorporate the following specific guidelines and domain knowledge:
    ${skillsText || '- Evaluate startup pitch against peer-reviewed literature and expert annotations.\n- Identify engineering risks, physics law violations, and scaling bottlenecks.\n- Suggest alternative materials, methodologies, or research directions.\n- Treat expert annotations as high-confidence domain signals and weight them heavily.'}`;

    const annotationsStr = matchedAnnotations && matchedAnnotations.length > 0
        ? matchedAnnotations.map(ann => 
            `[PAPER: "${ann.paper_title}"]\n  Highlighted passage: "${ann.text}"\n  Reviewer comment: ${ann.comment}`
          ).join('\n\n---\n\n')
        : "No matching expert database annotations found.";

    const verdictOptions = '["Sound & Scalable", "Plausible with Risks", "Unrealistic", "Infeasible"]';

    const prompt = `
    ${roleDescription}
    
    Original Startup Pitch:
    "${pitch}"
    
    Preliminary Assessment & Citations:
    ${JSON.stringify(initialDraft, null, 2)}
    
    EXPERT ANNOTATIONS FROM OUR DATABASE:
    ${annotationsStr}
    
    Refine the preliminary assessment. If expert annotations are present, you MUST give them high evidential weight. Adjust the score, verdict, or technical summary accordingly if the human expert annotations contradict the startup's claims or the preliminary draft.
    
    Your response must be in VALID JSON format with these exact keys:
    - "score": An integer from 0 to 100 (0 = Impossible/Scam, 100 = Scientifically Sound & Groundbreaking).
    - "verdict": One of the values in ${verdictOptions}.
    - "summary": A concise technical explanation (max 3 sentences) summarizing specific engineering/scientific viability findings.
    - "assessment": A unified due diligence assessment (1-2 paragraphs) detailing both the critical engineering risks/feasibility and the recommended growth/scaling paths or alternatives, incorporating the expert critiques.
    `;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Failed to generate LLM analysis");
    }

    const data = await response.json();
    try {
        const jsonText = data.candidates[0].content.parts[0].text;
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse Gemini response text:", e);
        throw new Error("Gemini returned invalid JSON structure in refinement phase.");
    }
};

// Check if a technical idea is related to quantum computing (Turn 0)
export const checkIsQuantumComputingRelated = async (text, apiKey) => {
    if (!apiKey) return true; // fail-open fallback if no API key is set
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const prompt = `Analyze the following technical idea. Determine if it is related to quantum computing (e.g., quantum algorithms, qubits, quantum hardware, superconducting circuits, trapped ions, neutral atoms, quantum error correction, quantum cryptography, quantum simulation, or quantum sensing).
    
    You MUST respond in VALID JSON format with a single key "is_quantum" which is a boolean (true or false).
    
    IDEA:
    "${text}"`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        if (response.ok) {
            const data = await response.json();
            const result = JSON.parse(data.candidates[0].content.parts[0].text);
            return !!result.is_quantum;
        }
    } catch (e) {
        console.error("Quantum check failed:", e);
    }
    return true; // fallback
};
