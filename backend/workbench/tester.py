"""Live API test executor — runs discovered endpoint chains against real APIs."""

import json
import time
import re
import anthropic
import httpx

client = anthropic.Anthropic()


def _resolve_params(params: dict, user_input: dict, previous_responses: list[dict]) -> dict:
    """Replace parameter placeholders with actual values."""
    resolved = {}
    for key, source in params.items():
        source_str = str(source).lower()
        if "user input" in source_str or "from user" in source_str:
            # Try to find in user_input
            resolved[key] = user_input.get(key, source)
        elif "step" in source_str:
            # Extract step number and field
            match = re.search(r'step\s*(\d+)', source_str)
            if match:
                step_idx = int(match.group(1)) - 1
                if step_idx < len(previous_responses):
                    prev = previous_responses[step_idx]
                    # Try to find the key in the previous response
                    resolved[key] = _deep_get(prev, key) or source
                else:
                    resolved[key] = source
            else:
                resolved[key] = source
        else:
            resolved[key] = user_input.get(key, source)
    return resolved


def _deep_get(data: dict, key: str):
    """Search for a key in a nested dict."""
    if key in data:
        return data[key]
    for v in data.values():
        if isinstance(v, dict):
            result = _deep_get(v, key)
            if result is not None:
                return result
    return None


async def run_test(
    base_url: str,
    api_key: str,
    auth_type: str,
    auth_config: dict | None,
    endpoints: list[dict],
    user_input: dict,
    use_case: dict,
) -> dict:
    """Execute a chain of API calls and compose the agent response.

    Returns:
        {
            "steps": [{ endpoint, status_code, latency_ms, response, extracted }],
            "agent_response": "...",
            "total_latency_ms": int
        }
    """
    # Auto-detect auth header (try multiple methods)
    auth_headers_to_try = [{}]
    if api_key:
        auth_headers_to_try = [
            {"Authorization": f"Bearer {api_key}"},
            {"apikey": api_key},
            {"X-Api-Key": api_key},
            {"Api-Key": api_key},
        ]
        # If auth_config specifies a header name, prioritize it
        if auth_config and auth_config.get("header_name"):
            auth_headers_to_try.insert(0, {auth_config["header_name"]: api_key})

    # Find working auth by testing base URL
    headers = {}
    async with httpx.AsyncClient(timeout=10.0) as http:
        for candidate in auth_headers_to_try:
            try:
                resp = await http.get(base_url.rstrip("/"), headers=candidate)
                if resp.status_code < 400:
                    headers = candidate
                    break
            except Exception:
                continue

    steps = []
    previous_responses = []
    total_latency = 0

    async with httpx.AsyncClient(timeout=15.0) as http:
        for ep in endpoints:
            method = ep.get("method", "GET").upper()
            path = ep.get("path", "")
            params = ep.get("parameters", {})
            extracts = ep.get("extracts", [])

            # Resolve parameters
            resolved = _resolve_params(params, user_input, previous_responses)

            # Substitute path parameters, collect remaining as query params
            url = base_url.rstrip("/") + path
            query_params = {}
            for k, v in resolved.items():
                placeholder = f"{{{k}}}"
                if placeholder in url:
                    url = url.replace(placeholder, str(v))
                else:
                    query_params[k] = v

            # Execute
            t0 = time.time()
            try:
                if method in ("POST", "PUT", "PATCH"):
                    resp = await http.request(method, url, json=resolved, headers=headers, params=query_params if query_params else None)
                else:
                    resp = await http.request(method, url, headers=headers, params=query_params if query_params else None)
                latency = int((time.time() - t0) * 1000)
                total_latency += latency

                try:
                    body = resp.json()
                except Exception:
                    body = {"raw": resp.text[:2000]}

                # Extract fields
                extracted = {}
                for field in extracts:
                    val = _deep_get(body, field) if isinstance(body, dict) else None
                    if val is not None:
                        extracted[field] = val

                steps.append({
                    "endpoint": f"{method} {path}",
                    "url": url,
                    "status_code": resp.status_code,
                    "latency_ms": latency,
                    "response": body,
                    "extracted": extracted,
                    "success": 200 <= resp.status_code < 300,
                })
                previous_responses.append(body)

            except Exception as e:
                latency = int((time.time() - t0) * 1000)
                total_latency += latency
                steps.append({
                    "endpoint": f"{method} {path}",
                    "url": url,
                    "status_code": 0,
                    "latency_ms": latency,
                    "response": {"error": str(e)},
                    "extracted": {},
                    "success": False,
                })
                previous_responses.append({})

    # Ask Claude to compose a response from the results
    agent_response = await _compose_response(steps, use_case)

    return {
        "steps": steps,
        "agent_response": agent_response,
        "total_latency_ms": total_latency,
    }


async def _compose_response(steps: list[dict], use_case: dict) -> str:
    """Use Claude to compose a natural-language response from API call results."""
    step_summary = []
    for i, s in enumerate(steps):
        step_summary.append(f"Step {i+1}: {s['endpoint']} → {s['status_code']}\nResponse: {json.dumps(s['response'], default=str)[:1000]}")

    prompt = f"""Given these API call results, compose a customer-friendly response.

Use case: {use_case.get('name', '')}
Expected output: {use_case.get('expected_output', '')}

API Results:
{chr(10).join(step_summary)}

Write a concise, helpful response using the data from the API results. If any call failed, mention that gracefully."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",  # Fast, simple response composition
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text
