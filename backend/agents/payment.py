"""Payment Agent — answers payment, invoice, and refund questions.

This agent can also take actions: it can initiate refunds by updating the DB.
"""

import json
import anthropic
from db import get_order, update_order

client = anthropic.Anthropic()

SYSTEM = """You are the Payment Agent for an e-commerce company.
You will receive order data and a customer question about payment/invoices/refunds.
Answer concisely using ONLY the data provided.

You have one tool available:
- initiate_refund: call this when the customer explicitly requests a refund and the
  payment_status is "paid" or "refund_requested". Do NOT call it if already "refunded".

If no tool is needed, just answer the question directly."""

TOOLS = [
    {
        "name": "initiate_refund",
        "description": "Initiate a refund for the given order. Only call when customer requests a refund.",
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "The order ID to refund",
                },
                "reason": {
                    "type": "string",
                    "description": "Brief reason for the refund",
                },
            },
            "required": ["order_id"],
        },
    }
]


async def _execute_refund(order_id: str, reason: str = "") -> str:
    order = await get_order(order_id)
    if order is None:
        return json.dumps({"error": "Order not found"})
    if order["payment_status"] == "refunded":
        return json.dumps({"error": "Order already refunded"})
    await update_order(order_id, payment_status="refunded")
    return json.dumps({
        "success": True,
        "order_id": order_id,
        "refunded_amount": float(order["amount"]),
        "reason": reason,
    })


async def handle(order_id: str, question: str) -> str:
    order = await get_order(order_id)
    if order is None:
        return f"Order {order_id} not found in our system."

    order_context = (
        f"Order: {order['order_id']}\n"
        f"Items: {', '.join(order['items'])}\n"
        f"Amount: ${order['amount']}\n"
        f"Payment status: {order['payment_status']}\n"
        f"Invoice: {order['invoice'] or 'Not yet issued'}"
    )

    messages = [
        {
            "role": "user",
            "content": f"ORDER DATA:\n{order_context}\n\nCUSTOMER QUESTION: {question}",
        }
    ]

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        system=SYSTEM,
        tools=TOOLS,
        messages=messages,
    )

    # If Claude wants to use the refund tool, execute it and get final answer
    if response.stop_reason == "tool_use":
        tool_block = next(b for b in response.content if b.type == "tool_use")
        tool_result = await _execute_refund(
            tool_block.input.get("order_id", order_id),
            tool_block.input.get("reason", ""),
        )

        messages.append({"role": "assistant", "content": response.content})
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_block.id,
                    "content": tool_result,
                }
            ],
        })

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
        )

    return next(b.text for b in response.content if hasattr(b, "text"))
