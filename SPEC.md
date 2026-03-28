# HelloAgents — Multi-Agent Customer Support System

## Goal

A multi-agent system that demonstrates **how AI agents communicate through
orchestration and tool-based delegation**. A customer writes a message; a
**Support Orchestrator** reads it, decides which specialist to call, and
delegates work to a **Logistics Agent** or **Payment Agent** (or both).
The Logistics Agent itself is an orchestrator — it queries multiple backend
systems (warehouse, carrier, customs) before composing its answer. The frontend
visualizes the full orchestration trace in real time.

---

## Key Concepts Demonstrated

| Concept | Where you'll see it |
|---|---|
| **Agent = LLM + Tools** | Each agent receives context and calls Claude with its own tool definitions |
| **Tool-based communication** | The Support Orchestrator invokes tools (`ask_logistics`, `ask_payment`) that route to sub-agents |
| **Multi-level orchestration** | Logistics Agent is itself an orchestrator with tools that call external systems |
| **Orchestration loop** | Agents call Claude in a loop — tool calls → execute → feed results back → repeat until done |
| **External system integration** | Logistics Agent queries SAP WMS, Carrier API, and Customs Broker (mocked with realistic data) |
| **Write operations** | Payment Agent can initiate refunds (updates MySQL), demonstrating agents that take action |
| **Transparency** | The frontend shows the full hierarchy: orchestrator → agent → system calls with depth indentation |

---

## Architecture

```
┌─────────────────┐         ┌────────────────────────────────────────────────┐
│   React UI      │◄──JSON──►│  Python Backend (FastAPI)                      │
│                 │  REST    │                                                │
│  Left:  Chat    │         │  POST /chat                                    │
│  Right: Trace   │         │    │                                           │
│         Timeline│         │    ▼                                           │
│                 │         │  ┌──────────────────────┐                      │
│  - depth=0 blue │         │  │  Support Orchestrator │  (Claude + tools)   │
│  - depth=1 green│         │  │  ask_logistics        │                     │
│  - depth=2 purple         │  │  ask_payment          │                     │
│                 │         │  └──┬───────────────┬───┘                      │
│                 │         │     │               │                           │
│                 │         │     ▼               ▼                           │
│                 │         │  ┌──────────────┐ ┌──────────────┐             │
│                 │         │  │  Logistics    │ │  Payment     │             │
│                 │         │  │  Agent        │ │  Agent       │             │
│                 │         │  │  (orchestrator│ │  (leaf agent)│             │
│                 │         │  │   with tools) │ │              │             │
│                 │         │  └─┬────┬────┬──┘ └──────────────┘             │
│                 │         │    │    │    │                                  │
│                 │         │    ▼    ▼    ▼                                  │
│                 │         │  ┌───┐┌───┐┌───┐                               │
│                 │         │  │WMS││📡 ││🛃 │  (mock external systems)      │
│                 │         │  └───┘└───┘└───┘                               │
│                 │         │  SAP  Carrier Customs                           │
└─────────────────┘         └────────────────────────────────────────────────┘
```

### Powered by Claude (Anthropic API)

All agents use **Claude Sonnet** via the Anthropic Python SDK with the
**tool_use** feature. Claude receives tool definitions and autonomously decides
which tools to call based on the user's message — no hardcoded routing rules.

The Anthropic API key is loaded from `.env` via `python-dotenv`.

### MySQL via Docker

Orders are stored in MySQL 8.0 (Docker Compose) with JSON columns for items.
The Payment Agent can write to the database (e.g., set `payment_status` to
`"refunded"`).

---

## Data Model

### Order Database (MySQL)

```sql
CREATE TABLE orders (
    order_id        VARCHAR(20) PRIMARY KEY,
    customer        VARCHAR(100) NOT NULL,
    items           JSON NOT NULL,
    status          VARCHAR(30) NOT NULL,    -- processing | shipped | delivered
    tracking        VARCHAR(50),
    carrier         VARCHAR(50),
    eta             DATE,
    payment_status  VARCHAR(30) NOT NULL,    -- pending | paid | refund_requested | refunded
    amount          DECIMAL(10,2) NOT NULL,
    invoice         VARCHAR(30)
);
```

### Seed Data

| Order   | Customer | Items                       | Status     | Tracking  | Payment          | Amount  |
|---------|----------|-----------------------------|------------|-----------|------------------|---------|
| ORD-001 | Alice    | Wireless Mouse, USB-C Hub   | shipped    | TRK-98765 | paid             | $79.98  |
| ORD-002 | Bob      | Mechanical Keyboard         | processing | —         | pending          | $129.99 |
| ORD-003 | Alice    | Monitor Stand               | delivered  | TRK-11111 | refund_requested | $49.99  |

### Mock External Systems

The Logistics Agent queries three simulated backend systems (`backend/systems/`):

**SAP WMS (warehouse.py)** — warehouse pick/pack status, handover times, package dimensions
- ORD-001: packed, handed to carrier 2026-03-26, Station B-12, Rotterdam
- ORD-002: picking in progress, not yet packed
- ORD-003: packed, handed to carrier 2026-03-20

**Carrier API (carrier.py)** — real-time tracking with full scan history
- TRK-98765: in transit, last scanned at Berlin Hub, ETA March 30
- TRK-11111: delivered, signed by A. Smith in Warsaw

**Customs Broker (customs.py)** — clearance status, duties
- Both shipments: cleared (intra-EU, no duties)

---

## Agent Definitions

### 1. Support Orchestrator (`backend/agents/support.py`)

**Role:** Receives customer messages, delegates to specialist agents, composes
unified replies. This is the top-level orchestrator.

**LLM:** Claude Sonnet with tool_use

**Tools:**

| Tool | Description | Parameters |
|---|---|---|
| `ask_logistics` | Delegate to Logistics Agent | `order_id`, `question` |
| `ask_payment` | Delegate to Payment Agent | `order_id`, `question` |

**Orchestration loop:**
1. Send user message + tool definitions to Claude
2. If Claude returns `tool_use` blocks → execute each tool (call sub-agent)
3. Feed tool results back to Claude as `tool_result` messages
4. Repeat until Claude returns `stop_reason: "end_turn"` with final text
5. Collect all steps in a `trace` array with `depth` field for the UI

### 2. Logistics Agent / Orchestrator (`backend/agents/logistics.py`)

**Role:** Answers shipping, tracking, and delivery questions by orchestrating
across three backend systems. This agent is itself an orchestrator.

**LLM:** Claude Sonnet with tool_use

**Tools:**

| Tool | Description | Routes to |
|---|---|---|
| `check_warehouse` | Pick/pack status, handover time | `systems/warehouse.py` |
| `track_shipment` | Real-time carrier tracking, scan history | `systems/carrier.py` |
| `check_customs` | Border clearance status, duties | `systems/customs.py` |

**Interface:** `handle(order_id, question, trace) → str`

Claude decides which systems to query based on the question. For "where is my
package?" it might call `check_warehouse` + `track_shipment`. For "is it stuck
in customs?" it calls `check_customs` + `track_shipment`. All system call steps
are appended to the shared `trace` array at `depth=2`.

### 3. Payment Agent (`backend/agents/payment.py`)

**Role:** Answers payment, invoice, and refund questions. Can take write actions.

**LLM:** Claude Sonnet with tool_use

**Tools:**

| Tool | Description | Write? |
|---|---|---|
| `initiate_refund` | Update payment_status to "refunded" in MySQL | Yes |

**Interface:** `handle(order_id, question) → str`

For read-only questions (invoice lookup, payment status), Claude answers directly
from the order data. For refund requests, Claude calls `initiate_refund` which
updates the database, then composes a confirmation message.

---

## Trace Format

Every step in the orchestration is captured with a `depth` field showing the
hierarchy level:

| Depth | What | Color in UI |
|---|---|---|
| 0 | Support Orchestrator actions | Blue |
| 1 | Sub-agent activation and responses | Green (logistics) / Orange (payment) |
| 2 | External system queries and responses | Purple |

Example trace for "Where is ORD-001?":

```json
[
    {"depth": 0, "agent": "support",   "action": "received_message", "detail": "Where is ORD-001?"},
    {"depth": 0, "agent": "support",   "action": "call_tool",        "tool": "ask_logistics"},
    {"depth": 1, "agent": "logistics", "action": "agent_start",      "detail": "Logistics Agent received: ..."},
    {"depth": 2, "agent": "logistics", "action": "call_system",      "system": "SAP WMS"},
    {"depth": 2, "agent": "system",    "action": "system_response",  "system": "SAP WMS", "detail": "{...}"},
    {"depth": 2, "agent": "logistics", "action": "call_system",      "system": "Carrier API"},
    {"depth": 2, "agent": "system",    "action": "system_response",  "system": "Carrier API", "detail": "{...}"},
    {"depth": 1, "agent": "logistics", "action": "agent_response",   "detail": "Package is in transit..."},
    {"depth": 0, "agent": "support",   "action": "final_reply",      "detail": "Your order ORD-001..."}
]
```

---

## API

### `POST /chat`

**Request:**
```json
{
    "message": "Where is my order ORD-001 and can I get the invoice?"
}
```

**Response:**
```json
{
    "reply": "Your order ORD-001 is in transit via FastShip...",
    "trace": [ ... ]
}
```

### `GET /orders`

Returns all orders as JSON array (for UI reference).

---

## Frontend

React single-page app (Vite) with two panels:

### Left Panel — Customer Chat
- Message list with user/assistant bubbles
- Text input + send button
- Pre-filled example queries as clickable chips with labels:
  - **Simple tracking:** "Where is my order ORD-001?"
  - **Multi-agent:** "What's the delivery status of ORD-001 and can I get the invoice?"
  - **Complex:** "ORD-003 was delivered but I want a refund. Also, where exactly is ORD-001 right now?"
  - **Warehouse status:** "Has order ORD-002 been packed yet? When will it ship?"

### Right Panel — Agent Orchestration Trace
- Architecture diagram shown when idle
- Stats bar: total steps, AI decisions, system queries
- Vertical timeline with depth-based indentation (`marginLeft: depth * 24px`)
- Color-coded cards: blue (orchestrator), green/orange (agents), purple (systems)
- Animated step-by-step reveal (`fadeSlideIn` with staggered delay)
- System response cards show raw JSON (expandable)
- Legend in the header

---

## Project Structure

```
HelloAgents/
├── SPEC.md
├── README.md
├── .env                         # ANTHROPIC_API_KEY + MySQL credentials (gitignored)
├── .env.example                 # Template
├── .gitignore
├── docker-compose.yml           # MySQL 8.0 with seed data
├── db/
│   └── init.sql                 # Schema + seed data (MySQL syntax)
├── backend/
│   ├── requirements.txt         # fastapi, uvicorn, anthropic, aiomysql, pydantic, python-dotenv
│   ├── main.py                  # FastAPI app — POST /chat, GET /orders, loads .env
│   ├── db.py                    # aiomysql connection pool, get/update order helpers
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── support.py           # Support Orchestrator — Claude tool_use with ask_logistics, ask_payment
│   │   ├── logistics.py         # Logistics Orchestrator — Claude tool_use with 3 system tools
│   │   └── payment.py           # Payment Agent — Claude tool_use with initiate_refund
│   └── systems/
│       ├── __init__.py
│       ├── warehouse.py         # Mock SAP WMS — pick/pack/handover data
│       ├── carrier.py           # Mock Carrier API — tracking + scan history
│       └── customs.py           # Mock Customs Broker — clearance data
├── frontend/
│   ├── package.json
│   ├── vite.config.js           # Proxies /chat, /orders to localhost:8000
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              # Two-panel layout with header legend
│       ├── App.css              # Full styling with depth-based indentation
│       ├── Chat.jsx             # Chat panel with labeled example chips
│       └── Trace.jsx            # Trace timeline with hierarchy, stats, architecture diagram
└── generator/
    ├── requirements.txt         # anthropic, pyyaml
    ├── generate_agent_spec.py   # CLI tool: use cases YAML + OpenAPI → agent spec
    ├── examples/
    │   ├── logistics_usecases.yaml   # Example input: 8 use cases for logistics domain
    │   └── fastship_openapi.json     # Example OpenAPI spec for carrier API
    └── output/                       # Generated output (example)
        ├── logistics_agent_spec.md   # Human-readable spec with decision logic + safety rules
        ├── logistics_agent_tools.json # Ready-to-use Claude tool definitions
        ├── logistics_agent_prompt.txt # System prompt
        └── logistics_agent.py        # Python skeleton with HTTP placeholders
```

---

## How to Run

```bash
# 1 — Start MySQL (skip if you have your own instance)
docker compose up -d

# 2 — Configure
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY and MySQL credentials

# 3 — Seed the database
docker exec -i <mysql-container> mysql -u root -p < db/init.sql

# 4 — Backend
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000

# 5 — Frontend
cd frontend
npm install
npm run dev

# Open http://localhost:5173
```

---

## Agent Spec Generator

A CLI tool for generating agent specifications from business use cases and API documentation.

**Input:**
- YAML file describing use cases (goal, trigger, input, steps, output, systems, frequency)
- OpenAPI / Postman collection JSON for each legacy system

**Output:**
- `*_spec.md` — human-readable agent specification with decision logic, safety rules, escalation rules
- `*_tools.json` — Claude tool definitions (paste directly into Anthropic API `tools` parameter)
- `*_prompt.txt` — system prompt for the agent
- `*.py` — Python implementation skeleton with real API endpoint placeholders

**Usage:**
```bash
cd generator
pip install -r requirements.txt
python generate_agent_spec.py examples/logistics_usecases.yaml -o output/
```

---

## What This Teaches

1. **Agents are functions with structured I/O** — `handle(params) → response`, no magic framework.
2. **Tools are the communication protocol** — the orchestrator calls tools that route to sub-agents (decoupled, like MCP).
3. **Orchestrators nest** — the Logistics Agent is both a sub-agent (to Support) and an orchestrator (over systems).
4. **Claude decides the routing** — the LLM chooses which tools to call based on the question, not hardcoded `if/else`.
5. **The trace makes it debuggable** — you can see every decision, every system call, every response at every level.
6. **Agent specs can be generated** — use cases + API docs → complete agent definition, automated via the generator.
