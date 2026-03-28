"""Mock Warehouse Management System (simulates SAP WMS).

In production this would be an HTTP call to your WMS API.
"""

import json

# Simulated WMS records
_warehouse_data = {
    "ORD-001": {
        "warehouse": "EU-West-1 (Rotterdam)",
        "pick_status": "completed",
        "pack_status": "completed",
        "handover_to_carrier": "2026-03-26T14:30:00Z",
        "handler": "Station B-12",
        "weight_kg": 0.45,
        "dimensions": "30x20x10 cm",
    },
    "ORD-002": {
        "warehouse": "EU-West-1 (Rotterdam)",
        "pick_status": "in_progress",
        "pack_status": "pending",
        "handover_to_carrier": None,
        "handler": "Station A-04",
        "weight_kg": 1.2,
        "dimensions": "50x25x15 cm",
    },
    "ORD-003": {
        "warehouse": "EU-West-1 (Rotterdam)",
        "pick_status": "completed",
        "pack_status": "completed",
        "handover_to_carrier": "2026-03-20T09:15:00Z",
        "handler": "Station B-12",
        "weight_kg": 2.1,
        "dimensions": "45x40x20 cm",
    },
}


async def check_warehouse(order_id: str) -> str:
    """Query the Warehouse Management System for pick/pack status."""
    record = _warehouse_data.get(order_id)
    if record is None:
        return json.dumps({"error": f"No warehouse record for {order_id}"})
    return json.dumps({"system": "SAP WMS", "order_id": order_id, **record})
