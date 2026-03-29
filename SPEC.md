# HelloAgents — Specification

## Vision & Overview

HelloAgents is a two-module platform for learning and operationalizing
multi-agent AI systems:

1. **Multi-Agent Customer Support Demo** — A working demo that shows how AI
   agents communicate through orchestration and tool-based delegation. A customer
   writes a message; a Support Orchestrator reads it, decides which specialist to
   call, and delegates work to a Logistics Agent or Payment Agent (or both). The
   frontend visualizes the full orchestration trace in real time.

2. **Agent Migration Workbench** — An interactive module that guides an
   organization through migrating to an agent-based architecture. The workbench
   distinguishes two types of agents:
   - **Agent Operators** wrap legacy systems (SAP, Stripe, CRM, etc.) and expose
     their operations as MCP tools. An operator is a thin translation layer:
     legacy API in, MCP tool interface out.
   - **Agent Orchestrators** are high-level agents that connect to one or more
     operators via MCP, coordinate their tools, and serve end-user use cases.

   The workflow: inventory your operators and orchestrators, document operator
   APIs, define use cases, test agent behavior, and generate production-ready
   code — MCP servers for operators, Claude agents for orchestrators.

---

## Design System & Branding

### Color Palette

```css
:root {
  --tedee-cyan: #34CFFD;    /* Primary action — buttons, links, active states, highlights */
  --tedee-navy: #22345A;    /* Structure — sidebar, headers, primary text */
  --tedee-gray: #A9A9A9;    /* Neutral — borders, secondary text */
  --hover-cyan: #2bb8e0;    /* Hover state for cyan elements */
  --bg-light: #f8fafc;      /* Page background */
  --text-primary: #1e293b;  /* Body text */
}
```

### Typography

- Font family: `'Inter', system-ui, -apple-system, sans-serif`
- Sidebar section labels: 10px, uppercase, tracking-widest, text-gray-400
- Navigation items: text-sm
- Page headers: text-2xl, font-bold
- Body / table text: text-xs to text-sm

### Layout Structure

- **Sidebar:** 260px fixed width, navy (`#22345A`) background, gray-300 text
  - Sections grouped under uppercase labels (e.g. "PLANNING", "REFERENCE DATA")
  - Active nav item: cyan left border + cyan text + bg-white/10 background
  - Inactive nav item: gray-300 text, hover → white text + bg-white/5
  - Footer: version string, muted text
- **Header bar:** 56px height, white background, bottom border gray-200
  - Left: page title (text-xl, bold, navy)
  - Right: AI assistant button (cyan background, navy text)
- **Main content area:** `#f8fafc` background, 24px padding
- **Cards:** white background, rounded-xl, shadow-sm, border gray-100

### Component Patterns

#### Buttons

- **Primary:** `bg-[#34CFFD] text-[#22345A] font-semibold rounded-lg hover:bg-[#2bb8e0]`
- **Secondary/ghost:** `text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg`
- **Danger:** `bg-red-500 text-white hover:bg-red-600 rounded-lg`

### Design Principles

- **AI-first:** Every action possible through natural language via an agent interface
- **Real-time validation:** Data issues flagged immediately, not after the fact
- **No duplication:** Reference data maintained once, referenced everywhere
- **Role-based visibility:** Sensitive data hidden from unauthorized roles
- **Card-based dashboard:** Summary metrics at the top, detail cards below, alerts inline

---

## Tech Stack

| Layer    | Technology                    |
|----------|-------------------------------|
| Frontend | React 19 + TypeScript         |
| Styling  | Tailwind CSS v4               |
| State    | TanStack Query (React Query)  |
| Backend  | Python + FastAPI              |
| Database | MySQL 8 (Docker) via aiomysql |
| AI       | Claude API with tool-use loop |

---

## Data Model

### Orders Table (Customer Support Demo)

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

### Workbench Tables

```sql
CREATE TABLE wb_agents (
    id              CHAR(36) PRIMARY KEY,
    agent_role      VARCHAR(20) NOT NULL DEFAULT 'operator',  -- 'operator' | 'orchestrator'
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50),
    owner_team      VARCHAR(200),
    api_type        VARCHAR(20) DEFAULT 'rest',       -- operator only
    api_base_url    VARCHAR(500),                      -- operator only
    api_docs_url    VARCHAR(500),                      -- operator only
    api_spec        JSON,                              -- operator only
    api_key_enc     VARCHAR(500),                      -- operator only, encrypted
    api_auth_type   VARCHAR(30) DEFAULT 'bearer',      -- operator only
    api_auth_config JSON,                              -- operator only
    status          VARCHAR(30) DEFAULT 'inventoried',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE wb_use_cases (
    id                  CHAR(36) PRIMARY KEY,
    agent_id            CHAR(36) NOT NULL REFERENCES wb_agents(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    trigger_text        TEXT,
    user_input          TEXT,
    expected_output     TEXT,
    frequency           VARCHAR(50),
    is_write            BOOLEAN DEFAULT FALSE,
    priority            VARCHAR(10) DEFAULT 'medium',
    discovered_endpoints JSON,
    discovered_behavior  TEXT,
    test_results        JSON,
    status              VARCHAR(20) DEFAULT 'draft',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE wb_agent_specs (
    id              CHAR(36) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    agent_ids       JSON,               -- array of agent UUIDs
    use_case_ids    JSON,               -- array of use case UUIDs
    spec_markdown   LONGTEXT,
    tools_json      JSON,
    system_prompt   LONGTEXT,
    skeleton_code   LONGTEXT,
    depends_on      JSON,               -- array of other spec UUIDs
    called_by       JSON,               -- array of other spec UUIDs
    status          VARCHAR(20) DEFAULT 'draft',
    generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Seed Data (Customer Support Demo)

| Order   | Customer | Items                       | Status     | Tracking  | Payment          | Amount  |
|---------|----------|-----------------------------|------------|-----------|------------------|---------|
| ORD-001 | Alice    | Wireless Mouse, USB-C Hub   | shipped    | TRK-98765 | paid             | $79.98  |
| ORD-002 | Bob      | Mechanical Keyboard         | processing | —         | pending          | $129.99 |
| ORD-003 | Alice    | Monitor Stand               | delivered  | TRK-11111 | refund_requested | $49.99  |

---

## Module 1: Multi-Agent Customer Support Demo

### Key Concepts Demonstrated

| Concept | Where you'll see it |
|---|---|
| **Agent = LLM + Tools** | Each agent receives context and calls Claude with its own tool definitions |
| **Tool-based communication** | The Support Orchestrator invokes tools (`ask_logistics`, `ask_payment`) that route to sub-agents |
| **Multi-level orchestration** | Logistics Agent is itself an orchestrator with tools that call external systems |
| **Orchestration loop** | Agents call Claude in a loop — tool calls → execute → feed results back → repeat until done |
| **External system integration** | Logistics Agent queries SAP WMS, Carrier API, and Customs Broker (mocked with realistic data) |
| **Write operations** | Payment Agent can initiate refunds (updates MySQL), demonstrating agents that take action |
| **Transparency** | The frontend shows the full hierarchy: orchestrator → agent → system calls with depth indentation |

### Architecture

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

#### Powered by Claude (Anthropic API)

All agents use **Claude Sonnet** via the Anthropic Python SDK with the
**tool_use** feature. Claude receives tool definitions and autonomously decides
which tools to call based on the user's message — no hardcoded routing rules.

The Anthropic API key is loaded from `.env` via `python-dotenv`.

#### MySQL via Docker

Orders are stored in MySQL 8.0 (Docker Compose) with JSON columns for items.
The Payment Agent can write to the database (e.g., set `payment_status` to
`"refunded"`).

### Agent Definitions

#### 1. Support Orchestrator (`backend/agents/support.py`)

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

#### 2. Logistics Agent / Orchestrator (`backend/agents/logistics.py`)

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

#### 3. Payment Agent (`backend/agents/payment.py`)

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

### Trace Format

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

### Chat API

#### `POST /chat`

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

#### `GET /orders`

Returns all orders as JSON array (for UI reference).

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

### Frontend Panels

React single-page app (Vite) with two panels:

#### Left Panel — Customer Chat
- Message list with user/assistant bubbles
- Text input + send button
- Pre-filled example queries as clickable chips with labels:
  - **Simple tracking:** "Where is my order ORD-001?"
  - **Multi-agent:** "What's the delivery status of ORD-001 and can I get the invoice?"
  - **Complex:** "ORD-003 was delivered but I want a refund. Also, where exactly is ORD-001 right now?"
  - **Warehouse status:** "Has order ORD-002 been packed yet? When will it ship?"

#### Right Panel — Agent Orchestration Trace
- Architecture diagram shown when idle
- Stats bar: total steps, AI decisions, system queries
- Vertical timeline with depth-based indentation (`marginLeft: depth * 24px`)
- Color-coded cards: blue (orchestrator), green/orange (agents), purple (systems)
- Animated step-by-step reveal (`fadeSlideIn` with staggered delay)
- System response cards show raw JSON (expandable)
- Legend in the header

---

## Module 2: Agent Migration Workbench

### Objective

An interactive module that guides an organization through migrating to an
agent-based architecture built on **MCP (Model Context Protocol)**.

The workbench models two distinct agent roles:

- **Agent Operators** — wrap a single legacy system and expose its operations as
  MCP tools. Think of an operator as a bridge: it accepts MCP tool calls and
  translates them into REST/GraphQL/SOAP calls to the underlying system.
- **Agent Orchestrators** — high-level Claude agents that connect to one or more
  operators via MCP client sessions. An orchestrator has a persona, behavior
  instructions, and use cases; it coordinates operator tools to serve end users.

The output is **production-ready code**: MCP server implementations for operators
and Claude agent implementations for orchestrators, ready to be handed to an
engineering team (or another AI agent) for deployment.

### Core Workflow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. AGENT    │───►│  2. APIs     │───►│  3. USE      │───►│  4. AGENT    │───►│  5. CODE     │
│  INVENTORY   │    │  & ACCESS    │    │  CASES       │    │  PLAYGROUND  │    │  GENERATION  │
│              │    │              │    │              │    │              │    │              │
│ Operators:   │    │ (Operators)  │    │ (Operators)  │    │ (Operators)  │    │ Operators →  │
│ legacy       │    │ Document how │    │ Define what  │    │ Test agent   │    │ MCP server   │
│ systems      │    │ each system  │    │ humans do    │    │ behavior     │    │              │
│              │    │ is accessed  │    │ with each    │    │ against real │    │ Orchestrators│
│ Orchestrators│    │              │    │ system today │    │ APIs         │    │ → Claude     │
│ coordination │    │ (Orchestrs)  │    │              │    │              │    │   agent      │
│ agents       │    │ Connect      │    │ (Orchestrs)  │    │              │    │              │
│              │    │ operators,   │    │ Define end-  │    │              │    │              │
│              │    │ define       │    │ user use     │    │              │    │              │
│              │    │ behavior     │    │ cases        │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

**Operators** progress through steps 1 → 2 → 3 → 4 → 5: inventory the legacy
system, document its API, define use cases, test discovery against the API, and
generate an MCP server implementation.

**Orchestrators** progress through steps 1 → 2 → 3 → 5: inventory the
orchestrator, connect it to operators and define behavior, define end-user use
cases, and generate a Claude agent implementation. (Step 4 / Use Case discovery
and testing applies to operators only.)

### Workbench Data Model

#### Agent

```
{
    id:             UUID
    agent_role:     string          "operator" | "orchestrator"
    name:           string          "SAP WMS"
    description:    string          "Warehouse management — pick, pack, ship, inventory"
    category:       string          "logistics" | "finance" | "crm" | "hr" | ...
    owner_team:     string          "Logistics & Fulfillment"

    // --- Operator-only fields (null for orchestrators) ---
    api_type:       string          "rest" | "graphql" | "soap" | "grpc" | "database" | "none"
    api_base_url:   string?         "https://api.sapwms.example.com/v1"
    api_docs_url:   string?         "https://docs.sapwms.example.com"
    api_spec:       JSON?           OpenAPI/Swagger spec (uploaded or fetched from URL)
    api_key:        string?         Encrypted, stored server-side, never sent to frontend
    api_auth_type:  string          "bearer" | "api_key_header" | "basic" | "oauth2" | "none"
    api_auth_config: JSON?          { header_name: "X-Api-Key" } or { token_url: "..." }

    status:         string          "inventoried" | "api_documented" | "use_cases_defined" |
                                    "tested" | "spec_generated"
    created_at:     datetime
    updated_at:     datetime
}
```

**`agent_role` meanings:**

- **`"operator"`** — Wraps a single legacy system. Has API connection fields
  (type, URL, key, spec). Generation output is an **MCP server** with
  `@server.tool()` handlers that translate MCP calls into `httpx` requests to
  the legacy API.
- **`"orchestrator"`** — Connects to one or more operators via MCP. Has no API
  fields of its own. Instead it has connected operators, a persona/behavior
  definition, and use cases. Generation output is a **Claude agent** with MCP
  client sessions that connect to operator servers and use the `tool_use` loop.

#### Use Case

```
{
    id:             UUID
    agent_id:       UUID            FK → Agent
    name:           string          "Track package location"
    description:    string          "Customer asks where their package is"

    trigger:        string          "Customer asks 'where is my order?'"
    user_input:     string          "What information the user/agent provides"
    expected_output: string         "What the response should contain"

    frequency:      string?         "~200/day"
    is_write:       boolean         false
    priority:       string          "high" | "medium" | "low"

    // Filled by self-discovery (step 4)
    discovered_endpoints: JSON?     [{ method: "GET", path: "/shipments/{id}", ... }]
    discovered_behavior:  string?   "Agent would call GET /shipments/{id} then format..."
    test_results:         JSON?     [{ timestamp, input, output, success }]

    status:         string          "draft" | "discovered" | "tested" | "validated"
    created_at:     datetime
    updated_at:     datetime
}
```

#### Agent Spec (generated output)

```
{
    id:             UUID
    name:           string          "Logistics Agent"
    agents:         UUID[]          FK → Agents this spec covers
    use_cases:      UUID[]          FK → Use cases this agent handles

    spec_markdown:  text            Full human-readable spec
    tools_json:     JSON            Claude tool definitions
    system_prompt:  text            System prompt
    skeleton_code:  text            Python implementation skeleton

    // Cross-agent dependencies
    depends_on:     UUID[]          Other agent specs this one calls
    called_by:      UUID[]          Agent specs that call this one

    status:         string          "draft" | "reviewed" | "approved"
    generated_at:   datetime
}
```

### Module Pages

#### Page 1: Dashboard

**Route:** `/workbench`

The landing page showing all operators and orchestrators.

**Layout — two sections:**

```
┌────────────────────────────────────────────────────────────────┐
│  Agent Migration Workbench                                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stats:  Operators: 8   Orchestrators: 2   Use Cases: 30       │
│                                                                 │
│  [+ Add Agent]  ← opens form with role toggle                  │
│                                                                 │
│  OPERATORS                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ SAP WMS  │  │ Carrier  │  │ Stripe   │  │ CRM      │       │
│  │ logistics│  │ logistics│  │ finance  │  │ crm      │       │
│  │ tested   │  │ documented│ │ inventoried│ │ inventoried│     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  ORCHESTRATORS                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Support Agent     │  │ Logistics Agent   │                   │
│  │ 3 operators       │  │ 2 operators       │                   │
│  │ 5 use cases       │  │ 3 use cases       │                   │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Creation form** (modal or inline, triggered by "+ Add Agent"):
- **Role toggle:** Operator / Orchestrator (default: Operator)
- **Operator fields:** name, description, category, api_type, api_base_url,
  api_key, test connection button
- **Orchestrator fields:** name, description only

#### Page 2a: Operator Detail

**Route:** `/workbench/agents/:id` (where `agent_role = "operator"`)

All information about a single operator: its API connection, use cases, and
generation config.

**Header:**
```
┌────────────────────────────────────────────────────────────────┐
│  ← Back                                                         │
│  SAP WMS  (operator)        [Save] [Generate MCP Server] [Delete]│
│  Warehouse management — pick, pack, ship, inventory              │
└──────────────────────────────────────────────────────────────────┘
```

##### Section A: API Connection
```
┌────────────────────────────────────────────────────────────────┐
│  API Connection                                                  │
│                                                                   │
│  API Type: [REST ▼]  Auth: [Bearer ▼]                            │
│  Base URL: [https://api.sapwms.example.com/v1            ]       │
│  API Key:  [●●●●●●  Set Key]                                    │
│  API Spec: [Upload OpenAPI]  Status: ✓ Loaded (42 endpoints)    │
│                                                                   │
│  [Test Connection]  → 200 OK (142ms)                             │
└──────────────────────────────────────────────────────────────────┘
```

##### Section B: Use Cases
```
┌────────────────────────────────────────────────────────────────┐
│  Use Cases (8)                                   [+ Add Use Case]│
│  (card list with priority/status/actions — click to open         │
│   Use Case detail at /workbench/agents/:id/usecases/:ucId)       │
└──────────────────────────────────────────────────────────────────┘
```

##### Section C: Generation Config (collapsible)
```
┌────────────────────────────────────────────────────────────────┐
│  ▶ Generation Config                                             │
│                                                                   │
│  Technology Stack: [Python 3.11 ▼]   Framework: [FastAPI + ...]  │
│  Deployment: [Docker ...]  Error Handling: [Retry once on 5xx...]│
│  Auth Notes: [bearer — API key from env var]                     │
└──────────────────────────────────────────────────────────────────┘
```

**Generate** produces an MCP server spec: Python code using the `mcp` SDK with
`@server.tool()` handlers, each handler making `httpx` calls to the legacy API.

#### Page 2b: Orchestrator Detail

**Route:** `/workbench/agents/:id` (where `agent_role = "orchestrator"`)

Configuration for an orchestrator: which operators it connects to, its behavior,
and its end-user use cases.

**Header:**
```
┌────────────────────────────────────────────────────────────────┐
│  ← Back                                                         │
│  Support Agent  (orchestrator)  [Save] [Generate Agent] [Delete] │
│  Top-level customer support orchestrator                         │
└──────────────────────────────────────────────────────────────────┘
```

##### Section A: Connected Operators
```
┌────────────────────────────────────────────────────────────────┐
│  Connected Operators                                             │
│                                                                   │
│  [+ Connect Operator ▼]  (dropdown of all operators)             │
│                                                                   │
│  ┌─ SAP WMS ──────────────────────────────────────────────┐     │
│  │  Tools: track_package, check_inventory, get_handover    │     │
│  │                                             [Disconnect]│     │
│  └────────────────────────────────────────────────────────┘     │
│  ┌─ Stripe ───────────────────────────────────────────────┐     │
│  │  Tools: initiate_refund, check_invoice                  │     │
│  │                                             [Disconnect]│     │
│  └────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

Each connected operator card shows the tools (use case names) that the
orchestrator can invoke. Tools are derived from the operator's use cases.

##### Section B: Behavior
```
┌────────────────────────────────────────────────────────────────┐
│  Behavior                                                        │
│                                                                   │
│  Agent Name: [Support Agent                                 ]    │
│  Agent Role & Persona: (auto-sized textarea, shows full text)    │
│  Additional Context: (auto-sized textarea, shows full text)      │
└──────────────────────────────────────────────────────────────────┘
```

##### Section C: Use Cases
```
┌────────────────────────────────────────────────────────────────┐
│  Use Cases (5)                                   [+ Add Use Case]│
│  (end-user scenarios — e.g. "Customer asks for refund status")   │
│  (card list with priority/status)                                │
└──────────────────────────────────────────────────────────────────┘
```

**Generate** produces a Claude agent spec: Python code with MCP client sessions
connecting to each operator's MCP server, using the `tool_use` loop to
coordinate across operators.

#### Page 3: Use Case Detail

**Route:** `/workbench/agents/:id/usecases/:ucId`

For **operators**, this is the Use Case editor with self-discovery and live testing (two-column layout).
For **orchestrators**, this is a focused single-column Use Case editor
(no discovery, no testing) that goes straight from draft to completed.

**Layout — 2 columns:**

```
┌──────────────────────────────┬───────────────────────────────────┐
│  USE CASE DEFINITION         │  AGENT PLAYGROUND                  │
│                              │                                    │
│  Name: Track package location│  ┌──────────────────────────────┐ │
│                              │  │  SELF-DISCOVERY               │ │
│  Trigger:                    │  │                                │ │
│  [Customer asks 'where is    │  │  Based on your use case and   │ │
│   my order?']                │  │  the API spec, the agent      │ │
│                              │  │  would:                       │ │
│  User provides:              │  │                                │ │
│  [Order ID (e.g. ORD-001)]   │  │  1. GET /orders/{id}          │ │
│                              │  │     → get tracking number     │ │
│  Expected response:          │  │                                │ │
│  [Current location, carrier, │  │  2. GET /shipments/{tracking} │ │
│   tracking number, ETA]      │  │     → get location + ETA      │ │
│                              │  │                                │ │
│  Frequency: [~200/day]       │  │  Mapped endpoints:            │ │
│  Write operation: [ ] No     │  │  ┌────────────────────────┐  │ │
│  Priority: [HIGH ▼]         │  │  │ GET /orders/{id}       │  │ │
│                              │  │  │ GET /shipments/{track} │  │ │
│  [Save]                      │  │  └────────────────────────┘  │ │
│                              │  │                                │ │
│                              │  │  [🔍 Run Discovery]           │ │
│                              │  └──────────────────────────────┘ │
│                              │                                    │
│                              │  ┌──────────────────────────────┐ │
│                              │  │  LIVE TEST                    │ │
│                              │  │                                │ │
│                              │  │  Test input:                  │ │
│                              │  │  Order ID: [ORD-001    ]      │ │
│                              │  │  Question: [Where is my       │ │
│                              │  │            package?    ]      │ │
│                              │  │                                │ │
│                              │  │  [▶ Run Test]                 │ │
│                              │  │                                │ │
│                              │  │  ── Test Results ──           │ │
│                              │  │                                │ │
│                              │  │  Step 1: GET /orders/ORD-001  │ │
│                              │  │  Status: 200 OK (142ms)       │ │
│                              │  │  Response: { tracking:        │ │
│                              │  │    "TRK-98765", ... }         │ │
│                              │  │                                │ │
│                              │  │  Step 2: GET /shipments/      │ │
│                              │  │          TRK-98765            │ │
│                              │  │  Status: 200 OK (89ms)        │ │
│                              │  │  Response: { status:          │ │
│                              │  │    "in_transit", ... }        │ │
│                              │  │                                │ │
│                              │  │  Agent would answer:          │ │
│                              │  │  "Your package TRK-98765 is   │ │
│                              │  │  currently in transit via      │ │
│                              │  │  FastShip. Last scanned at     │ │
│                              │  │  Berlin Hub. ETA: March 30."  │ │
│                              │  │                                │ │
│                              │  │  ✅ Matches expected output   │ │
│                              │  │                                │ │
│                              │  │  [Save Result] [Run Again]    │ │
│                              │  └──────────────────────────────┘ │
└──────────────────────────────┴───────────────────────────────────┘
```

#### Page 4: Agent Spec Review + Export

**Route:** `/workbench/specs/:id`

Review generated agent spec, edit, set cross-agent dependencies, export.

```
┌────────────────────────────────────────────────────────────────┐
│  Logistics Agent Spec                      [Regenerate] [Export]│
│                                                                  │
│  Tabs: [Spec] [Tools JSON] [System Prompt] [Python Code]        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  # Logistics Agent Specification                          │   │
│  │                                                           │   │
│  │  (rendered markdown — editable)                           │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Cross-Agent Dependencies:                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  This agent is called by:                                 │   │
│  │  • Support Orchestrator (via ask_logistics tool)          │   │
│  │                                                           │   │
│  │  This agent calls:                                        │   │
│  │  • (none — leaf orchestrator, calls systems directly)     │   │
│  │                                                           │   │
│  │  [+ Add Dependency]                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

#### Page 5: Agent Architecture Map

**Route:** `/workbench/map`

A visual, read-only map showing all operators and orchestrators, their tools /
connected operators, and how they relate. The goal is a high-level "at a glance"
view so a human can understand the full agent architecture.

```
┌────────────────────────────────────────────────────────────────┐
│  Agent Architecture Map                                         │
│                                                                  │
│  ┌─ ORCHESTRATOR (purple top bar) ─┐                            │
│  │  Support Agent                   │                            │
│  │                                  │                            │
│  │  Connected Operators:            │                            │
│  │  • SAP WMS Operator              │                            │
│  │  • Carrier Operator              │                            │
│  │  • Stripe Operator               │                            │
│  └──────┬──────────┬──────────┬────┘                            │
│         │          │          │                                   │
│         ▼          ▼          ▼                                   │
│  ┌─ OPERATOR ─┐ ┌─ OPERATOR ─┐ ┌─ OPERATOR ─┐                  │
│  │ (cyan bar) │ │ (cyan bar) │ │ (cyan bar) │                   │
│  │ SAP WMS    │ │ Carrier    │ │ Stripe     │                   │
│  │            │ │            │ │            │                    │
│  │ Tools:     │ │ Tools:     │ │ Tools:     │                   │
│  │ • track_   │ │ • track_   │ │ • initiate_│                   │
│  │   package  │ │   shipment │ │   refund   │                   │
│  │ • check_   │ │            │ │ • check_   │                   │
│  │   inventory│ │            │ │   invoice  │                   │
│  └────────────┘ └────────────┘ └────────────┘                   │
│                                                                  │
│  Click any card to open its detail page.                        │
└────────────────────────────────────────────────────────────────┘
```

**Visual differentiation:**
- **Operators:** cyan (`#34CFFD`) top bar, show TOOLS (from use cases)
- **Orchestrators:** purple top bar, show CONNECTED OPERATORS
- **Arrows:** orchestrator → operator (call direction)

**Data sources:**
- Agent list + roles from `GET /workbench/agents`
- Operator tools from use cases
- Orchestrator connections from connected_operators field

**Layout:** SVG canvas with agent cards as nodes, arrows showing call direction.

---

### Frontend Routes

```
/workbench                              Dashboard (operators + orchestrators)
/workbench/agents/:id                   Operator or Orchestrator detail (based on role)
/workbench/agents/:id/usecases/:ucId    Use Case detail (operator: with discovery+testing / orchestrator: definition only)
/workbench/specs                        Generated specs list
/workbench/specs/:id                    Spec detail/editor
/workbench/map                          Agent architecture map
/workbench/demo                         Customer support demo
```

### Self-Discovery Engine

The core intelligence of the Use Case page. When a user clicks **"Run Discovery"**,
the backend:

1. Takes the **use case** (trigger, input, expected output) + **API spec** (OpenAPI JSON)
2. Sends them to Claude with a specialized prompt
3. Claude analyzes the API spec and maps use case steps to specific endpoints
4. Returns: which endpoints to call, in what order, with what parameters, and how
   to compose the response

#### Discovery API

**`POST /workbench/discover`**

```json
{
    "agent_id": "uuid",
    "use_case": {
        "name": "Track package location",
        "trigger": "Customer asks where their package is",
        "user_input": "Order ID (e.g. ORD-001)",
        "expected_output": "Current location, carrier, tracking number, ETA"
    }
}
```

**Response:**
```json
{
    "endpoints": [
        {
            "method": "GET",
            "path": "/orders/{order_id}",
            "purpose": "Retrieve order details including tracking number",
            "parameters": { "order_id": "from user input" },
            "extracts": ["tracking_number", "carrier"]
        },
        {
            "method": "GET",
            "path": "/shipments/{tracking_number}",
            "purpose": "Get real-time tracking status from carrier",
            "parameters": { "tracking_number": "from step 1 response" },
            "extracts": ["status", "last_scan.location", "estimated_delivery"]
        }
    ],
    "behavior": "Agent calls /orders/{id} to get the tracking number, then calls /shipments/{tracking} to get current location. Composes response with location, carrier name, and ETA.",
    "tool_definition": {
        "name": "track_package_status",
        "description": "...",
        "input_schema": { ... }
    },
    "suggested_response_template": "Your package {tracking_number} is currently {status} via {carrier}. Last scanned at {location}. ETA: {eta}."
}
```

### Live Test API

**`POST /workbench/test`**

Actually executes the discovered endpoint chain against the real API (using
the stored API key).

```json
{
    "agent_id": "uuid",
    "use_case_id": "uuid",
    "test_input": {
        "order_id": "ORD-001"
    }
}
```

**Response:**
```json
{
    "steps": [
        {
            "endpoint": "GET /orders/ORD-001",
            "status_code": 200,
            "latency_ms": 142,
            "response": { "tracking_number": "TRK-98765", "carrier": "FastShip" },
            "extracted": { "tracking_number": "TRK-98765" }
        },
        {
            "endpoint": "GET /shipments/TRK-98765",
            "status_code": 200,
            "latency_ms": 89,
            "response": { "status": "in_transit", "last_scan": { "location": "Berlin Hub" } },
            "extracted": { "status": "in_transit", "location": "Berlin Hub", "eta": "2026-03-30" }
        }
    ],
    "agent_response": "Your package TRK-98765 is currently in transit via FastShip. Last scanned at Berlin Hub. ETA: March 30, 2026.",
    "matches_expected": true,
    "total_latency_ms": 231
}
```

### Spec Generation API

**`POST /workbench/generate-spec`**

```json
{
    "agent_id": "uuid",
    "include_use_cases": ["uuid1", "uuid2", "uuid3"]
}
```

Generation produces different output depending on the agent's role:

**Operator → MCP Server Implementation:**
- Python code using the `mcp` SDK (`from mcp.server import Server`)
- Each use case becomes a `@server.tool()` handler
- Handlers make `httpx` calls to the legacy API (base URL, auth from agent config)
- Includes error handling, input validation, response formatting

**Orchestrator → Claude Agent Implementation:**
- Python code with MCP client sessions (one per connected operator)
- Uses the Anthropic SDK `tool_use` loop to coordinate across operator tools
- System prompt generated from persona/behavior fields
- Includes the orchestrator's use cases as example interactions

Both output types include: `spec_markdown`, `tools_json`, `system_prompt`,
`skeleton_code`. (Note: `system_prompt` refers to the standard AI term.)

### Backend API Summary

#### Agents CRUD
```
GET    /workbench/agents                     List all agents
POST   /workbench/agents                     Create an agent
GET    /workbench/agents/:id                 Get agent detail
PUT    /workbench/agents/:id                 Update agent
DELETE /workbench/agents/:id                 Delete agent
POST   /workbench/agents/:id/upload-spec     Upload OpenAPI spec
POST   /workbench/agents/:id/test-connection Test API connectivity
```

#### Use Cases CRUD
```
GET    /workbench/agents/:id/usecases        List use cases for an agent
POST   /workbench/agents/:id/usecases        Create use case
GET    /workbench/usecases/:id               Get use case detail
PUT    /workbench/usecases/:id               Update use case
DELETE /workbench/usecases/:id               Delete use case
```

#### Discovery & Testing
```
POST   /workbench/discover                   Run self-discovery (Claude analyzes API spec + use case)
POST   /workbench/test                       Run live test against real API
```

#### Agent Specs
```
POST   /workbench/generate-spec              Generate agent spec from agents + use cases
GET    /workbench/specs                      List generated specs
GET    /workbench/specs/:id                  Get spec detail
PUT    /workbench/specs/:id                  Update spec (edit, set dependencies)
GET    /workbench/specs/:id/export           Download spec files as ZIP
```

#### Dashboard
```
GET    /workbench/dashboard                  Migration progress stats + agent map data
```

---

## Shared Infrastructure

### Project Structure

```
HelloAgents/
├── SPEC.md
├── README.md
├── .env                         # ANTHROPIC_API_KEY + MySQL credentials (gitignored)
├── .env.example                 # Template
├── .gitignore
├── docker-compose.yml           # MySQL 8.0 with seed data
├── db/
│   ├── init.sql                 # Schema + seed data (MySQL syntax)
│   └── workbench.sql            # Workbench tables (wb_agents, wb_use_cases, wb_agent_specs)
├── backend/
│   ├── requirements.txt         # fastapi, uvicorn, anthropic, aiomysql, pydantic, python-dotenv
│   ├── main.py                  # FastAPI app — POST /chat, GET /orders, loads .env
│   ├── db.py                    # aiomysql connection pool, get/update order helpers
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── support.py           # Support Orchestrator — Claude tool_use with ask_logistics, ask_payment
│   │   ├── logistics.py         # Logistics Orchestrator — Claude tool_use with 3 system tools
│   │   └── payment.py           # Payment Agent — Claude tool_use with initiate_refund
│   ├── systems/
│   │   ├── __init__.py
│   │   ├── warehouse.py         # Mock SAP WMS — pick/pack/handover data
│   │   ├── carrier.py           # Mock Carrier API — tracking + scan history
│   │   └── customs.py           # Mock Customs Broker — clearance data
│   └── workbench/
│       ├── __init__.py
│       ├── routes.py            # All /workbench/* FastAPI routes
│       ├── models.py            # Pydantic models for request/response
│       ├── db.py                # wb_agents, wb_use_cases, wb_agent_specs queries
│       ├── discovery.py         # Self-discovery engine (Claude + API spec analysis)
│       ├── tester.py            # Live API test executor (httpx calls)
│       ├── spec_generator.py    # Agent spec generation (evolved from generator/)
│       └── crypto.py            # API key encryption/decryption
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts           # Tailwind plugin + proxies to localhost:8000
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── index.css            # Tailwind imports + @theme (brand colors)
│       ├── types.ts             # Shared TypeScript interfaces
│       ├── App.tsx              # Routing for / and /workbench/*
│       ├── DemoPage.tsx         # Customer support demo (chat + trace)
│       ├── Chat.tsx             # Chat panel with labeled example chips
│       ├── Trace.tsx            # Trace timeline with hierarchy, stats
│       ├── components/
│       │   └── WorkbenchLayout.tsx  # Sidebar + header shell for /workbench/*
│       └── workbench/
│           ├── api.ts           # Typed API client
│           ├── queries.ts       # TanStack Query hooks
│           ├── Dashboard.tsx    # Agent list + stats
│           ├── OperatorDetail.tsx   # Operator: API connection + use cases + gen config
│           ├── OrchestratorDetail.tsx # Orchestrator: connected operators + behavior + use cases
│           ├── Playground.tsx   # Use case detail: operator (discovery + live test) / orchestrator (definition only)
│           ├── AgentSpecList.tsx # List of generated specs
│           ├── AgentSpecView.tsx # Spec review + export
│           └── AgentMap.tsx     # Visual agent architecture map
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

### Key Technical Decisions

#### API Key Security
- API keys are encrypted at rest using Fernet (symmetric encryption)
- Encryption key from environment variable `WORKBENCH_SECRET_KEY`
- Keys are never sent to the frontend — only a masked indicator (`●●●●●●`)
- Keys are decrypted only server-side when making test API calls

#### Self-Discovery Prompt Design
The discovery engine sends Claude:
1. The OpenAPI spec (or relevant portions for large specs)
2. The use case definition (trigger, input, expected output)
3. Instructions to map the use case to specific API endpoints

Claude returns structured JSON with the endpoint chain, not free text.
This is validated before storing.

#### Live Test Execution
- Uses `httpx` async client with configurable timeouts
- Each step is executed sequentially (output of step N feeds into step N+1)
- All requests/responses are logged for the test results
- Rate limiting: max 1 test per second per agent to avoid overloading APIs
- Sensitive data (API keys, auth tokens) is redacted from stored test results

#### Spec Generation
The workbench generator produces two types of output:

**For operators (MCP server):**
- Uses **tested endpoint data** (not just OpenAPI spec) — it knows which endpoints actually work
- Includes **real response examples** from test runs
- Generates `@server.tool()` handlers with `httpx` calls to the legacy API
- Generates **error handling** based on observed error responses during testing

**For orchestrators (Claude agent):**
- Generates MCP client sessions connecting to each operator's MCP server
- Builds system prompt from persona, behavior, and additional context fields
- Includes use cases as example interaction patterns
- Uses the `tool_use` loop to coordinate across connected operator tools

### Database Tables

All SQL DDL statements for the complete system:

```sql
-- Customer Support Demo
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

-- Agent Migration Workbench
CREATE TABLE wb_agents (
    id              CHAR(36) PRIMARY KEY,
    agent_role      VARCHAR(20) NOT NULL DEFAULT 'operator',  -- 'operator' | 'orchestrator'
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50),
    owner_team      VARCHAR(200),
    api_type        VARCHAR(20) DEFAULT 'rest',       -- operator only
    api_base_url    VARCHAR(500),                      -- operator only
    api_docs_url    VARCHAR(500),                      -- operator only
    api_spec        JSON,                              -- operator only
    api_key_enc     VARCHAR(500),                      -- operator only, encrypted
    api_auth_type   VARCHAR(30) DEFAULT 'bearer',      -- operator only
    api_auth_config JSON,                              -- operator only
    status          VARCHAR(30) DEFAULT 'inventoried',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE wb_use_cases (
    id                  CHAR(36) PRIMARY KEY,
    agent_id            CHAR(36) NOT NULL REFERENCES wb_agents(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    trigger_text        TEXT,
    user_input          TEXT,
    expected_output     TEXT,
    frequency           VARCHAR(50),
    is_write            BOOLEAN DEFAULT FALSE,
    priority            VARCHAR(10) DEFAULT 'medium',
    discovered_endpoints JSON,
    discovered_behavior  TEXT,
    test_results        JSON,
    status              VARCHAR(20) DEFAULT 'draft',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE wb_agent_specs (
    id              CHAR(36) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    agent_ids       JSON,               -- array of agent UUIDs
    use_case_ids    JSON,               -- array of use case UUIDs
    spec_markdown   LONGTEXT,
    tools_json      JSON,
    system_prompt   LONGTEXT,
    skeleton_code   LONGTEXT,
    depends_on      JSON,               -- array of other spec UUIDs
    called_by       JSON,               -- array of other spec UUIDs
    status          VARCHAR(20) DEFAULT 'draft',
    generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
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

## Runtime Layer — Deployable Agent Projects

### Problem

AgentForge designs agents and generates specs, but there is no standard path from
spec to running agent. Teams take the generated code and figure out deployment
independently, leading to inconsistent project structures, missing configs, and
agents that can't easily connect to each other.

### Solution: Level 1 — Standardized Deployable Output

When a team clicks **"Export Project"** on a generated spec, AgentForge produces a
complete, runnable project — not a skeleton that needs heavy editing, but a real
service that starts with one command.

### Exported Project Structure

**For operators (MCP server):**

```
{agent-slug}/
├── server.py              # Complete MCP server — @server.tool() handlers with httpx calls
├── requirements.txt       # mcp, httpx, python-dotenv, etc. (pinned versions)
├── Dockerfile             # Python 3.12 slim, installs deps, runs server.py
├── docker-compose.yml     # Single service, port mapping, env_file reference
├── .env.example           # LEGACY_API_BASE_URL, LEGACY_API_KEY, MCP_PORT=8100
├── README.md              # What this agent does, how to run, how to test, env vars reference
└── tests/
    └── test_tools.py      # Smoke tests calling each tool with sample input
```

**For orchestrators (Claude agent):**

```
{agent-slug}/
├── orchestrator.py        # Claude tool_use loop, MCP client sessions to operators
├── requirements.txt       # anthropic, mcp, python-dotenv, etc. (pinned versions)
├── Dockerfile             # Python 3.12 slim, installs deps, runs orchestrator.py
├── docker-compose.yml     # Orchestrator service + references to operator services
├── .env.example           # ANTHROPIC_API_KEY, operator MCP URIs, ports
├── README.md              # Architecture, connected operators, use cases, how to run
└── tests/
    └── test_orchestration.py  # Sample conversation flows testing routing logic
```

### What Gets Generated

Each file in the project is generated from workbench data — not generic templates:

| File | Generated From |
|---|---|
| `server.py` / `orchestrator.py` | `skeleton_code` field from spec (already complete Python) |
| `requirements.txt` | Extracted from code imports + org settings tech stack |
| `Dockerfile` | Standard template, parameterized by Python version from org settings |
| `docker-compose.yml` | Service name from agent name, port from convention, env_file |
| `.env.example` | Extracted from code (API URLs, keys referenced in the implementation) |
| `README.md` | Agent name, description, use cases, connected operators, tool list |
| `tests/` | Generated from use case sample conversations + test results data |

### Export Flow

```
Spec View → [Export Project] → Backend generates ZIP → Browser downloads
```

**Backend endpoint:** `GET /workbench/specs/{spec_id}/export-project`

Returns a ZIP file containing the complete project directory.

### Docker Compose Convention

All agents follow a standard port and naming convention so they can find each other:

```yaml
# Operator MCP servers
services:
  product-catalog:
    build: ./product-catalog
    ports: ["8101:8100"]

  order-management:
    build: ./order-management
    ports: ["8102:8100"]

  # Orchestrator connects to operators via MCP
  support-orchestrator:
    build: ./support-orchestrator
    ports: ["8200:8200"]
    environment:
      - PRODUCT_CATALOG_MCP_URI=http://product-catalog:8100
      - ORDER_MANAGEMENT_MCP_URI=http://order-management:8100
```

### One Command to Run

```bash
# After export and unzip:
cd my-agent/
cp .env.example .env
# Fill in API keys
docker compose up
```

The agent is running. MCP tools are live. Orchestrators can connect.

### External Agent Discovery

Agents built outside AgentForge (by other teams, platforms, or vendors) can be
registered into the workbench so orchestrators can connect to them.

**Dashboard → External Agent tab:**

1. Select type: **MCP Server** or **REST API**
2. Enter the running agent's URL
3. Click **Discover Tools** — for MCP servers, AgentForge connects via SSE,
   establishes a `ClientSession`, calls `list_tools()`, and displays all
   discovered tools with names, descriptions, and input schemas
4. Review discovered tools → click **Register Agent**
5. The agent is created as an operator with the URL and tool definitions saved

**Backend endpoint:** `POST /workbench/discover-mcp`
- Connects to an MCP server URL using `mcp.client.sse.sse_client`
- Initializes a session and calls `list_tools()`
- Returns tool definitions (name, description, inputSchema)

**Interoperability:** Any MCP-compatible agent — whether built by AgentForge,
deployed from LobeHub, or hand-coded — can be registered this way. The
orchestrator doesn't care where the MCP server came from; it connects via
the standard protocol and calls `session.call_tool()`.

### Orchestrator-to-Orchestrator Connections

Orchestrators can connect to other orchestrators, not just operators. This
enables hierarchical agent architectures:

```
Top-Level Orchestrator
  ├── Sub-Orchestrator A (handles product domain)
  │     ├── Product Catalog Operator
  │     └── Inventory Operator
  ├── Sub-Orchestrator B (handles customer domain)
  │     ├── Customer Management Operator
  │     └── Support Tickets Operator
  └── Payment Operator (direct connection)
```

The "Connected Agents" section in orchestrator detail shows all agents
(operators and orchestrators) with role badges, and the spec generator
produces code that handles both connection types.

### Future: Level 2 — Agent Registry (not built yet)

Running agents register themselves with AgentForge, enabling:
- Live status on the Map view (green = running, red = down)
- Orchestrators auto-discover operator URLs from registry
- Health monitoring and dependency tracking
- This is the next step after Level 1 is stable

---

## Implementation Priority

### Phase 1 — Foundation
1. Database tables + migration
2. Agents CRUD (backend routes + frontend forms)
3. Use Cases CRUD
4. Basic dashboard with agent list

### Phase 2 — Discovery
5. API spec upload + parsing
6. Self-discovery engine (Claude analyzes spec + use case)
7. Use Case UI (discovery panel)

### Phase 3 — Testing
8. API key storage with encryption
9. Live test executor
10. Test results display + history

### Phase 4 — Generation
11. Spec generation from workbench data
12. Spec review + edit UI
13. Cross-agent dependency mapping

### Phase 5 — Runtime (Level 1)
14. Project export engine (ZIP with complete runnable project)
15. Dockerfile + docker-compose.yml generation
16. README generation from workbench data
17. Smoke test generation from use case test results
18. Export UI button on Spec View page

### Phase 6 — Polish
19. Migration map visualization (graph/diagram)
20. Progress tracking + dashboard stats
21. Bulk import (CSV/YAML for agents + use cases)

---

## What This Teaches

1. **Agents are functions with structured I/O** — `handle(params) → response`, no magic framework.
2. **Tools are the communication protocol** — the orchestrator calls tools that route to sub-agents (decoupled, like MCP).
3. **Orchestrators nest** — the Logistics Agent is both a sub-agent (to Support) and an orchestrator (over systems).
4. **Claude decides the routing** — the LLM chooses which tools to call based on the question, not hardcoded `if/else`.
5. **The trace makes it debuggable** — you can see every decision, every system call, every response at every level.
6. **Agent specs can be generated** — use cases + API docs → complete agent definition, automated via the generator.
