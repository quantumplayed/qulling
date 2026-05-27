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

// Call Gemini 2.5 Flash to perform startup pitch analysis
export const generateAnalysis = async (pitch, context, apiKey, modality) => {
    if (!apiKey) throw new Error("Gemini API key is not configured.");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const contextStr = context && context.length > 0
        ? context.join('\n\n---\n\n')
        : "No context papers found.";
        
    const roleDescription = "You are a professional Deep Tech Scientific Due Diligence Analyst. Your goal is to provide a rigorous, objective, and evidence-based analysis of the user's technology proposal. First, evaluate engineering feasibility and physical viability, identifying any physics law violations, mathematical flaws, or state-of-the-art contradictions. Second, identify scaling bottlenecks and suggest alternative scientifically viable materials, methodologies, or research directions. Combine both critical engineering risks and constructive development paths.";

    const verdictOptions = '["Sound & Scalable", "Plausible with Risks", "Unrealistic", "Infeasible"]';

    const prompt = `
    ${roleDescription}
    
    Analyze the following startup pitch for scientific feasibility and growth potential.
    Use the provided CONTEXT to ground your analysis. Each context block is a passage from a scientific paper.
    Some blocks also contain [EXPERT ANNOTATION] sections — these are critique notes written by human domain experts
    who have reviewed the paper. Treat these annotations as high-confidence domain signals: they represent expert
    judgment about the significance or validity of a specific passage. Weight them accordingly in your assessment.
    
    CONTEXT:
    ${contextStr}
    
    STARTUP PITCH:
    "${pitch}"
    
    Your task is to provide a structured analysis in VALID JSON format.
    The JSON must have these exact keys:
    - "score": An integer from 0 to 100 (0 = Impossible/Scam, 100 = Scientifically Sound & Groundbreaking).
    - "verdict": One of the values in ${verdictOptions}.
    - "summary": A concise technical explanation (max 3 sentences) of specific physics violations or confirmations.
    - "assessment": A unified due diligence assessment (1-2 paragraphs) detailing both the critical engineering risks/feasibility and the recommended growth/scaling paths or alternatives.
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
        throw new Error("Gemini returned invalid JSON structure.");
    }
};
