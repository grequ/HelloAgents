"""Support Agent — the orchestrator.

This is the heart of the multi-agent system. It uses Claude with tool_use to decide
which specialist agents to call. The tools (ask_logistics, ask_payment) are the
communication channels to sub-agents — this is exactly the pattern MCP uses.

Flow:
  1. User message comes in
  2. Claude sees the available tools and decides what to call
  3. We execute the tool (which calls the sub-agent)
  4. We feed the result back to Claude
  5. Repeat until Claude produces a final text response
"""

import json
import anthropic
from agents import logistics, payment

client = anthropic.Anthropic()

SYSTEM = """You are a friendly customer support agent for TechShop, an electronics store.
You help customers with their orders. You have two specialist tools:

- ask_logistics: for shipping, tracking, delivery, and package status questions
- ask_payment: for payment status, invoices, and refund questions

When a customer asks about an order:
1. Identify the order ID(s) mentioned (format: ORD-XXX)
2. Call the appropriate tool(s) to get information
3. If the question covers both shipping AND payment topics, call BOTH tools
4. Compose a helpful, friendly response based on the tool results

If no order ID is mentioned, ask the customer to provide one.
Keep your final responses concise and customer-friendly."""

TOOLS = [
    {
        "name": "ask_logistics",
        "description": "Ask the Logistics Agent about shipping, tracking, delivery status, or package location for an order.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "The order ID (e.g. ORD-001)",
                },
                "question": {
                    "type": "string",
                    "description": "The specific logistics question to ask",
                },
            },
            "required": ["order_id", "question"],
        },
    },
    {
        "name": "ask_payment",
        "description": "Ask the Payment Agent about payment status, invoices, or refunds for an order.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "The order ID (e.g. ORD-001)",
                },
                "question": {
                    "type": "string",
                    "description": "The specific payment question to ask",
                },
            },
            "required": ["order_id", "question"],
        },
    },
]


async def handle(user_message: str) -> tuple[str, list[dict]]:
    """Process a user message through the support agent orchestration loop.

    Returns (final_reply, trace) where trace is a list of steps for visualization.
    """
    trace = []
    trace.append({
        "agent": "support",
        "action": "received_message",
        "detail": user_message,
        "depth": 0,
    })

    messages = [{"role": "user", "content": user_message}]

    # Orchestration loop: keep calling Claude until it produces a final text response
    while True:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
        )

        # If Claude is done (no more tool calls), extract final text
        if response.stop_reason == "end_turn":
            final_text = next(
                (b.text for b in response.content if hasattr(b, "text")), ""
            )
            trace.append({
                "agent": "support",
                "action": "final_reply",
                "detail": final_text,
                "depth": 0,
            })
            return final_text, trace

        # Process tool calls
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            tool_name = block.name
            tool_input = block.input
            order_id = tool_input["order_id"]
            question = tool_input["question"]

            trace.append({
                "agent": "support",
                "action": "call_tool",
                "tool": tool_name,
                "input": {"order_id": order_id, "question": question},
                "depth": 0,
            })

            # Route to the appropriate sub-agent
            if tool_name == "ask_logistics":
                trace.append({
                    "agent": "logistics",
                    "action": "agent_start",
                    "detail": f"Logistics Agent received: \"{question}\"",
                    "depth": 1,
                })
                result = await logistics.handle(order_id, question, trace=trace)
                trace.append({
                    "agent": "logistics",
                    "action": "agent_response",
                    "detail": result,
                    "depth": 1,
                })
            elif tool_name == "ask_payment":
                trace.append({
                    "agent": "payment",
                    "action": "agent_start",
                    "detail": f"Payment Agent received: \"{question}\"",
                    "depth": 1,
                })
                result = await payment.handle(order_id, question)
                trace.append({
                    "agent": "payment",
                    "action": "agent_response",
                    "detail": result,
                    "depth": 1,
                })
            else:
                result = f"Unknown tool: {tool_name}"

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            })

        # Feed tool results back to Claude for the next iteration
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
