"""Mock Customs & Border Clearance System.

In production this would be an HTTP call to a customs broker API.
"""

import json

_customs_data = {
    "TRK-98765": {
        "status": "cleared",
        "origin_country": "NL",
        "destination_country": "PL",
        "declaration_number": "EU-2026-8834521",
        "clearance_date": "2026-03-27T06:00:00Z",
        "duties_amount": 0.00,
        "notes": "Intra-EU shipment — no customs duties applicable",
    },
    "TRK-11111": {
        "status": "cleared",
        "origin_country": "NL",
        "destination_country": "PL",
        "declaration_number": "EU-2026-7712309",
        "clearance_date": "2026-03-21T10:00:00Z",
        "duties_amount": 0.00,
        "notes": "Intra-EU shipment — no customs duties applicable",
    },
}


async def check_customs(tracking_number: str) -> str:
    """Query customs clearance status."""
    record = _customs_data.get(tracking_number)
    if record is None:
        return json.dumps({"error": f"No customs record for {tracking_number}. Possibly domestic shipment or not yet filed."})
    return json.dumps({"system": "Customs Broker API", "tracking_number": tracking_number, **record})
