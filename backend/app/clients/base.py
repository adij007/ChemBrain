from typing import Any

import httpx
import os
import asyncio


class ExternalAPIError(RuntimeError):
    def __init__(self, service: str, message: str):
        super().__init__(f"{service}: {message}")
        self.service = service
        self.message = message


async def get_json(
    client: httpx.AsyncClient,
    service: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    attempts = max(1, int(os.getenv("CHEMBRAIN_EXTERNAL_API_RETRIES", "2")))
    backoff = float(os.getenv("CHEMBRAIN_EXTERNAL_API_BACKOFF_SEC", "0.5"))
    last_error: Exception | None = None
    data: Any = None
    for attempt in range(1, attempts + 1):
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            break
        except httpx.TimeoutException as exc:
            last_error = exc
            if attempt == attempts:
                raise ExternalAPIError(service, "request timed out") from exc
        except httpx.HTTPStatusError as exc:
            last_error = exc
            status = exc.response.status_code
            if attempt == attempts or status not in {429, 500, 502, 503, 504}:
                message = "rate limited" if status == 429 else f"HTTP {status}"
                raise ExternalAPIError(service, message) from exc
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            if attempt == attempts:
                raise ExternalAPIError(service, "unavailable or malformed response") from exc
        await asyncio.sleep(backoff * attempt)

    if last_error and data is None:
        raise ExternalAPIError(service, f"request failed after retries ({last_error})")

    if not isinstance(data, dict):
        raise ExternalAPIError(service, "malformed response")
    if data.get("errors"):
        message = data["errors"][0].get("message", "GraphQL error")
        raise ExternalAPIError(service, message)
    return data


async def post_json(
    client: httpx.AsyncClient,
    service: str,
    url: str,
    *,
    json: dict[str, Any],
) -> dict[str, Any]:
    attempts = max(1, int(os.getenv("CHEMBRAIN_EXTERNAL_API_RETRIES", "2")))
    backoff = float(os.getenv("CHEMBRAIN_EXTERNAL_API_BACKOFF_SEC", "0.5"))
    last_error: Exception | None = None
    data: Any = None
    for attempt in range(1, attempts + 1):
        try:
            response = await client.post(url, json=json)
            response.raise_for_status()
            data = response.json()
            break
        except httpx.TimeoutException as exc:
            last_error = exc
            if attempt == attempts:
                raise ExternalAPIError(service, "request timed out") from exc
        except httpx.HTTPStatusError as exc:
            last_error = exc
            status = exc.response.status_code
            if attempt == attempts or status not in {429, 500, 502, 503, 504}:
                message = "rate limited" if status == 429 else f"HTTP {status}"
                raise ExternalAPIError(service, message) from exc
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            if attempt == attempts:
                raise ExternalAPIError(service, "unavailable or malformed response") from exc
        await asyncio.sleep(backoff * attempt)

    if last_error and data is None:
        raise ExternalAPIError(service, f"request failed after retries ({last_error})")

    if not isinstance(data, dict):
        raise ExternalAPIError(service, "malformed response")
    return data
