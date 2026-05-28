# QULLING: The Quantum Idea Vetting Oracle 🛰️⚛️

**Qulling** is a high-fidelity scientific analysis platform designed to vet quantum computing concepts, research pitches, and technical papers against peer-reviewed literature. By combining browser-side RAG (Retrieval-Augmented Generation) with Google Gemini and Supabase, Qulling enables real-time vetting of quantum ideas enriched by expert reviewer annotations.

---

## 🚀 Key Features

- **Double-Agent Analysis**:
  - 🔴 **QILL (Constructive Destruction)**: Aggressively searches for flaws, contradictions, and physical impossibilities.
  - 🟢 **QROW (Accelerative Synthesis)**: Identifies synergies, potential research paths, and supporting literature.
- **ArXiv & Local PDF Ingestion**: Directly import papers from arXiv URLs/IDs or upload local PDFs. Text is extracted, chunked, and parsed entirely in the browser using `pdfjs-dist`.
- **Expert Review Portal**: Domain experts can highlight text directly inside ingested papers, attach precise critiques (annotations), and submit structured VC-grade assessments.
- **Annotation-Enriched RAG**: At analysis time, matched scientific paper chunks are fuzzy-joined with expert annotations and formatted into the LLM prompt to weight human critiques as high-confidence domain signals.

---

## 🛠 Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons
- **Backend & Database**: Supabase (Database, Auth, and Storage)
- **Vector Search**: Supabase pgvector (`match_paper_chunks` RPC)
- **AI Integration**: Google Gemini API (`gemini-2.5-flash` or newer for analysis, `text-embedding-004` for vector embeddings)
- **PDF Extraction**: `pdfjs-dist` (browser-side text extraction and chunking)

---

## 📦 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- A Supabase project with `pgvector` enabled and tables for `papers`, `paper_chunks`, and `annotations`
- A Google Gemini API Key (optional for uploading papers; required for generating vector embeddings and running pitch analyses)

### 2. Configuration
Create a `.env` file in the root directory based on `.env.example`:
```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Installation
```bash
npm install
```

### 4. Running Locally
```bash
npm run dev
```

---

## 🔐 Supabase Database Setup

Create the following tables in your Supabase database:

1. **`papers`**:
   `id` (uuid, PK), `title` (text), `authors` (text), `year` (int), `source` (text), `pdf_url` (text), `status` (text), `assigned_to` (uuid), `assessment` (jsonb)
2. **`paper_chunks`**:
   `id` (uuid, PK), `paper_id` (uuid, FK), `content` (text), `embedding` (vector(768), nullable), `metadata` (jsonb)
3. **`annotations`**:
   `id` (uuid, PK), `paper_id` (uuid, FK), `text` (text), `comment` (text), `page` (int)

Include the `match_paper_chunks` RPC for cosine similarity search:
```sql
CREATE OR REPLACE FUNCTION match_paper_chunks (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  paper_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    paper_chunks.id,
    paper_chunks.paper_id,
    paper_chunks.content,
    paper_chunks.metadata,
    1 - (paper_chunks.embedding <=> query_embedding) AS similarity
  FROM paper_chunks
  WHERE 1 - (paper_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY paper_chunks.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;
```

---

## 📜 License
Distributed under the MIT License.

*“Verifying the quantum future, one qubit at a time.”*
