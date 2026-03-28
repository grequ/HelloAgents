"""Mock Carrier Tracking API (simulates FedEx/UPS/DHL tracking).

In production this would be an HTTP call to the carrier's API gateway.
"""

import json

_tracking_data = {
    "TRK-98765": {
        "carrier": "FastShip",
        "status": "in_transit",
        "origin": "Rotterdam, NL",
        "destination": "Warsaw, PL",
        "estimated_delivery": "2026-03-30",
        "last_scan": {
            "location": "Berlin Hub, DE",
            "timestamp": "2026-03-27T22:10:00Z",
            "event": "Departed facility",
        },
        "history": [
            {"location": "Rotterdam, NL", "timestamp": "2026-03-26T14:45:00Z", "event": "Picked up from warehouse"},
            {"location": "Rotterdam, NL", "timestamp": "2026-03-26T18:00:00Z", "event": "Departed facility"},
            {"location": "Berlin Hub, DE", "timestamp": "2026-03-27T20:30:00Z", "event": "Arrived at facility"},
            {"location": "Berlin Hub, DE", "timestamp": "2026-03-27T22:10:00Z", "event": "Departed facility"},
        ],
    },
    "TRK-11111": {
        "carrier": "FastShip",
        "status": "delivered",
        "origin": "Rotterdam, NL",
        "destination": "Warsaw, PL",
        "estimated_delivery": "2026-03-25",
        "last_scan": {
            "location": "Warsaw, PL",
            "timestamp": "2026-03-25T11:20:00Z",
            "event": "Delivered — signed by: A. Smith",
        },
        "history": [
            {"location": "Rotterdam, NL", "timestamp": "2026-03-20T09:30:00Z", "event": "Picked up from warehouse"},
            {"location": "Berlin Hub, DE", "timestamp": "2026-03-21T14:00:00Z", "event": "In transit"},
            {"location": "Poznan, PL", "timestamp": "2026-03-24T08:00:00Z", "event": "At local depot"},
            {"location": "Warsaw, PL", "timestamp": "2026-03-25T11:20:00Z", "event": "Delivered — signed by: A. Smith"},
        ],
    },
}


async def track_shipment(tracking_number: str) -> str:
    """Query carrier tracking API for real-time shipment status."""
    record = _tracking_data.get(tracking_number)
    if record is None:
        return json.dumps({"error": f"No tracking data for {tracking_number}"})
    return json.dumps({"system": "Carrier API (FastShip)", "tracking_number": tracking_number, **record})
