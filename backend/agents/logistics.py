"""Logistics Agent — an ORCHESTRATOR that queries multiple backend systems.

This demonstrates the key pattern: the Logistics Agent is itself an agent with tools.
Each tool connects to a different legacy system. Claude decides which systems to query
based on the question, calls them, and composes an answer.

    Support Orchestrator
        └── ask_logistics ──► THIS AGENT (Logistics Orchestrator)
                                  ├── tool: check_warehouse   → SAP WMS
                                  ├── tool: track_shipment    → Carrier API
                                  └── tool: check_customs     → Customs Broker
"""

import json
import anthropic
from db import get_order
from systems.warehouse import check_warehouse
from systems.carrier import track_shipment
from systems.customs import check_customs

client = anthropic.Anthropic()

SYSTEM = """You are the Logistics Agent for an e-commerce company.
You have access to 3 backend systems via tools:

- check_warehouse: SAP Warehouse Management System — pick/pack status, handover times
- track_shipment: Carrier Tracking API (FedEx/UPS/FastShip) — real-time location, delivery scans
- check_customs: Customs Broker API — border clearance status, duties

For each question:
1. Look at the order data to find tracking numbers, carriers, etc.
2. Call the relevant tools (often you need 2-3 for a complete picture)
3. Compose a factual answer using ONLY tool results. Never invent data.

If a shipment hasn't been handed to the carrier yet, don't call track_shipment — just report warehouse status."""

TOOLS = [
    {
        "name": "check_warehouse",
        "description": "Query SAP WMS for warehouse pick/pack status, handover time, and package dimensions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "The order ID (e.g. ORD-001)",
                },
            },
            "required": ["order_id"],
        },
    },
    {
        "name": "track_shipment",
        "description": "Query Carrier Tracking API for real-time shipment location, scan history, and ETA.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tracking_number": {
                    "type": "string",
                    "description": "The tracking number (e.g. TRK-98765)",
                },
            },
            "required": ["tracking_number"],
        },
    },
    {
        "name": "check_customs",
        "description": "Query Customs Broker API for border clearance status and duties.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tracking_number": {
                    "type": "string",
                    "description": "The tracking number",
                },
            },
            "required": ["tracking_number"],
        },
    },
]

TOOL_HANDLERS = {
    "check_warehouse": lambda **kw: check_warehouse(kw["order_id"]),
    "track_shipment": lambda **kw: track_shipment(kw["tracking_number"]),
    "check_customs": lambda **kw: check_customs(kw["tracking_number"]),
}

# Friendly names for the trace
TOOL_SYSTEM_NAMES = {
    "check_warehouse": "SAP WMS",
    "track_shipment": "Carrier API",
    "check_customs": "Customs Broker",
}


async def handle(order_id: str, question: str, trace: list[dict] | None = None) -> str:
    """Process a logistics question by orchestrating across backend systems.

    If trace is provided, appends detailed steps so the UI can show the full hierarchy.
    """
    if trace is None:
        trace = []

    order = await get_order(order_id)
    if order is None:
        return f"Order {order_id} not found in our system."

    order_context = json.dumps(order, default=str)
    messages = [
        {
            "role": "user",
            "content": f"ORDER DATA:\n{order_context}\n\nQUESTION: {question}",
        }
    ]

    # Orchestration loop — same pattern as Support Agent, one level deeper
    while True:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=600,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            result = next((b.text for b in response.content if hasattr(b, "text")), "")
            return result

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            system_name = TOOL_SYSTEM_NAMES.get(block.name, block.name)
            trace.append({
                "agent": "logistics",
                "action": "call_system",
                "tool": block.name,
                "system": system_name,
                "input": block.input,
                "depth": 2,
            })

            handler = TOOL_HANDLERS[block.name]
            result = await handler(**block.input)

            trace.append({
                "agent": "system",
                "action": "system_response",
                "system": system_name,
                "detail": result,
                "depth": 2,
            })

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            })

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
