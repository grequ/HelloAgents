# HelloAgents — Multi-Agent Customer Support System

## Goal

A minimal but complete multi-agent system that demonstrates **how agents communicate
through a central orchestrator** using tool-based message passing (the same pattern
MCP uses). A customer writes a message; a **Support Agent** reads it, decides which
specialist to call, and delegates work to a **Logistics Agent** or **Payment Agent**
(or both), then composes a final answer.

---

## Key Concepts Demonstrated

| Concept | Where you'll see it |
|---|---|
| **Agent = LLM + Tools** | Each agent is a function that receives context and returns a structured response |
| **Tool-based communication** | Agents don't call each other directly — the Support Agent invokes *tools* (`ask_logistics`, `ask_payment`) that route to other agents |
| **Orchestration loop** | The Support Agent may call tools multiple times before producing a final answer |
| **Structured I/O** | Every agent returns JSON with a fixed schema — like MCP tool results |
| **Transparency** | The frontend shows the full chain: user message → agent calls → tool calls → sub-agent responses → final answer |

---

## Architecture

```
┌─────────────┐         ┌──────────────────────────────────┐
│   React UI  │◄──JSON──►│  Python Backend (FastAPI)         │
│             │  REST    │                                    │
│  - chat     │         │  POST /chat                        │
│  - trace    │         │    │                                │
│  timeline   │         │    ▼                                │
│             │         │  ┌────────────────┐                 │
│             │         │  │  Support Agent  │                │
│             │         │  │  (orchestrator) │                │
│             │         │  └──┬──────────┬──┘                 │
│             │         │     │tools     │tools               │
│             │         │     ▼          ▼                    │
│             │         │  ┌────────┐ ┌─────────┐            │
│             │         │  │Logistics│ │ Payment │            │
│             │         │  │ Agent   │ │  Agent  │            │
│             │         │  └────────┘ └─────────┘            │
└─────────────┘         └──────────────────────────────────┘
```

### Powered by Claude (Anthropic API)

All three agents use **Claude claude-sonnet-4-20250514** via the Anthropic Python SDK.
The Support Agent uses Claude's **tool_use** feature — it receives tool definitions
for `ask_logistics` and `ask_payment`, and Claude decides which tools to call based
on the user's message. Sub-agents receive order data as context and use Claude to
formulate natural-language responses.

### MySQL

Orders are stored in MySQL so the system behaves like a real application with
persistent state. The Payment Agent can actually update records (e.g., initiate
a refund).

---

## Data Model

### Order Database (MySQL)

```python
orders = {
    "ORD-001": {
        "customer": "Alice",
        "items": ["Wireless Mouse", "USB-C Hub"],
        "status": "shipped",
        "tracking": "TRK-98765",
        "carrier": "FastShip",
        "eta": "2026-03-30",
        "payment_status": "paid",
        "amount": 79.98,
        "invoice": "INV-1001"
    },
    "ORD-002": {
        "customer": "Bob",
        "items": ["Mechanical Keyboard"],
        "status": "processing",
        "tracking": None,
        "carrier": None,
        "eta": None,
        "payment_status": "pending",
        "amount": 129.99,
        "invoice": None
    },
    "ORD-003": {
        "customer": "Alice",
        "items": ["Monitor Stand"],
        "status": "delivered",
        "tracking": "TRK-11111",
        "carrier": "FastShip",
        "eta": "2026-03-25",
        "payment_status": "refund_requested",
        "amount": 49.99,
        "invoice": "INV-1003"
    }
}
```

---

## Agent Definitions

### 1. Support Agent (Orchestrator)

**Role:** Receives the customer message, understands intent, delegates to specialist
agents, and composes a unified reply.

**Tools available:**

| Tool | Description | Parameters |
|---|---|---|
| `ask_logistics` | Ask the Logistics Agent a question | `order_id`, `question` |
| `ask_payment` | Ask the Payment Agent a question | `order_id`, `question` |

**Behavior:**
1. Parse the user message for order IDs and intent keywords.
2. If the message is about shipping/tracking/delivery → call `ask_logistics`.
3. If the message is about payment/invoice/refund → call `ask_payment`.
4. If both → call both tools (demonstrate multi-tool use).
5. Compose a friendly customer-facing response from the tool results.

### 2. Logistics Agent

**Role:** Answers questions about parcel delivery, tracking, and shipping.

**Data access:** reads from the order database (shipping fields).

**Responds to questions like:**
- "Where is my package?" → returns tracking number, carrier, ETA
- "Has it shipped?" → returns status
- "When will it arrive?" → returns ETA

### 3. Payment Agent

**Role:** Answers questions about payments, invoices, and refunds.

**Data access:** reads from the order database (payment fields).

**Responds to questions like:**
- "Has my payment gone through?" → returns payment status
- "Send me my invoice" → returns invoice number
- "I want a refund" → initiates refund (updates status)

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
    "reply": "Your order ORD-001 was shipped via FastShip (tracking: TRK-98765) and should arrive by March 30. Your invoice number is INV-1001.",
    "trace": [
        {
            "agent": "support",
            "action": "received_message",
            "detail": "Where is my order ORD-001 and can I get the invoice?"
        },
        {
            "agent": "support",
            "action": "call_tool",
            "tool": "ask_logistics",
            "input": {"order_id": "ORD-001", "question": "where is my package"}
        },
        {
            "agent": "logistics",
            "action": "response",
            "detail": "Order ORD-001 shipped via FastShip. Tracking: TRK-98765. ETA: 2026-03-30."
        },
        {
            "agent": "support",
            "action": "call_tool",
            "tool": "ask_payment",
            "input": {"order_id": "ORD-001", "question": "invoice"}
        },
        {
            "agent": "payment",
            "action": "response",
            "detail": "Order ORD-001 is paid. Invoice: INV-1001."
        },
        {
            "agent": "support",
            "action": "compose_reply",
            "detail": "Combined logistics + payment info into final answer."
        }
    ]
}
```

### `GET /orders`

Returns the list of orders (for the UI to show sample data).

---

## Frontend

A single-page React app with two panels:

### Left Panel — Chat
- Simple chat input + message list
- Pre-filled example questions as clickable chips:
  - "Where is my order ORD-001?"
  - "I need the invoice for ORD-001"
  - "What's the status of ORD-002 and can I get a refund for ORD-003?"

### Right Panel — Agent Trace Timeline
- Shows the `trace` array as a vertical timeline
- Each step is a card with:
  - Agent icon/color (Support=blue, Logistics=green, Payment=orange)
  - Action type (received, tool_call, response, compose)
  - Detail text
- Animates in step-by-step so you can *see* the orchestration happen

---

## Project Structure

```
HelloAgents/
├── SPEC.md                  # this file
├── backend/
│   ├── requirements.txt     # fastapi, uvicorn, anthropic, aiomysql, pydantic
│   ├── main.py              # FastAPI app, /chat and /orders endpoints
│   ├── db.py                # MySQL connection + seed data
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── support.py       # Support Agent (orchestrator) — uses Claude tool_use
│   │   ├── logistics.py     # Logistics Agent — uses Claude for responses
│   │   └── payment.py       # Payment Agent — uses Claude for responses
├── docker-compose.yml       # PostgreSQL + seed data
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   │   ├── App.jsx          # Main layout (two panels)
│   │   ├── Chat.jsx         # Chat panel component
│   │   ├── Trace.jsx        # Trace timeline component
│   │   ├── App.css          # Styles
│   │   └── main.jsx         # Entry point
│   └── index.html
└── README.md                # How to run
```

---

## How to Run (target)

```bash
# 1 — Start MySQL
docker compose up -d

# 2 — Backend (needs ANTHROPIC_API_KEY env var)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 3 — Frontend
cd frontend
npm install
npm run dev
```

---

## What This Teaches

1. **Agents are just functions with structured I/O** — no magic framework needed.
2. **Tools are the communication protocol** — the orchestrator doesn't import sub-agents, it calls tools that happen to route to them (decoupled, like MCP).
3. **The trace makes it debuggable** — you can see exactly what happened and why.
4. **Claude's tool_use is the magic** — the LLM itself decides which agents to call and when, based on the conversation.
