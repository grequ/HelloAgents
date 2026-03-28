# HelloAgents — Multi-Agent Customer Support Demo

A working example of multi-agent orchestration using **Claude's tool_use** feature.
A Support Agent delegates to specialist Logistics and Payment agents, and the frontend
visualizes the entire orchestration trace in real time.

See [SPEC.md](SPEC.md) for the full design.

## Architecture

```
User → React UI → FastAPI → Support Agent (Claude + tools)
                                ├── ask_logistics → Logistics Agent (Claude)
                                └── ask_payment  → Payment Agent (Claude)
```

## Prerequisites

- Docker (for PostgreSQL)
- Python 3.11+
- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable set

## Quick Start

### 1. Start the database

```bash
docker compose up -d
```

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — the frontend proxies API calls to the backend.

## Sample Orders

| Order   | Customer | Status     | Payment          |
|---------|----------|------------|------------------|
| ORD-001 | Alice    | shipped    | paid             |
| ORD-002 | Bob      | processing | pending          |
| ORD-003 | Alice    | delivered  | refund_requested |

## Try These Queries

- "Where is my order ORD-001?"
- "I need the invoice for ORD-001"
- "What's the status of ORD-002 and can I get a refund for ORD-003?"
- "Has ORD-003 been delivered? I want a refund."
