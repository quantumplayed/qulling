# QULLING: The Quantum Idea Vetting Oracle 🛰️⚛️

**Qulling** is a high-fidelity scientific analysis platform designed to vet quantum computing concepts, research pitches, and technical papers against the latest peer-reviewed literature. By combining advanced RAG (Retrieval-Augmented Generation) with high-performance LLMs, Qulling provides real-time "Constructive Destruction" or "Accelerative Synthesis" for any quantum idea.

---

## 🚀 Key Features

- **Protocol Selection**:
  - 🔴 **QILL (Constructive Destruction)**: Aggressively searches for flaws, contradictions, and physical impossibilities in your pitch.
  - 🟢 **QROW (Accelerative Synthesis)**: Identifies synergies, potential research paths, and supporting literature to expand your idea.
- **Quantum Knowledge Base**: Real-time integration with **ArXiv** (physics.quant-ph), powered by a 50,000+ chunk **ChromaDB** vector store.
- **Deep Research Integration**: Automated ingestion pipeline that keeps the oracle updated with the latest quantum breakthroughs.
- **Expert Audit Portal**: A secure, manual vetting pipeline for VC-grade scientific fidelity certificates.
- **Modern Brutalist UI**: A high-performance, responsive interface built for speed and scientific clarity.

---

## 🛠 Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Framer Motion.
- **Backend**: FastAPI (Python), ChromaDB (Vector DB).
- **AI/LLM**: Support for **Groq (Llama3)**, **Google Gemini**, and **Anthropic Claude**.
- **Ingestion**: Custom ArXiv ingestion service with PyMuPDF parsing.

---

## 📦 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Python 3.9+
- A Groq, Gemini, or Claude API Key.

### 2. Installation & Setup
Clone the repository and run the setup script:

```bash
git clone https://github.com/your-username/qulling.git
cd qulling

# Use the provided dev script for automatic venv and dependency management
./dev.sh
```

### 3. Configuration
Copy the environment template and add your API keys:

```bash
cp server/.env.example server/.env
# Edit server/.env with your GROQ_API_KEY
```

---

## 🔐 Security & Access
- **Root Token**: The Expert and Editor portals are secured via a terminal-style challenge gate.
- **Default Token**: `QULLING_ROOT_2026` (For development use).

---

## 💎 Institutional Partners
Qulling is proudly associated with the following quantum nodes:
- **aQa** (Applied Quantum Algorithms, Leiden)
- **QuSoft** (Quantum Software Research Center)
- **QuTech** (TUDelft & TNO)

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

*“Verifying the quantum future, one qubit at a time.”*
