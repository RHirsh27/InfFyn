"""Pseudonymous visitor quotas. Forwarded identity requires a signed app request."""

import hashlib
import hmac
import time
from fastapi import HTTPException


def visitor_bucket(request, secret):
    if not secret or len(secret) < 32:
        raise HTTPException(
            503, "Public preview is awaiting secure proxy configuration."
        )
    visitor = request.headers.get("x-inffyn-visitor", "")
    timestamp = request.headers.get("x-inffyn-time", "")
    signature = request.headers.get("x-inffyn-signature", "")
    try:
        recent = abs(time.time() - int(timestamp)) <= 60
    except ValueError:
        recent = False
    expected = hmac.new(
        secret.encode(), f"{timestamp}:{visitor}".encode(), hashlib.sha256
    ).hexdigest()
    if len(visitor) != 64 or not recent or not hmac.compare_digest(expected, signature):
        raise HTTPException(403, "Start the preview from the InfFyn application.")
    return "visitor:" + visitor


def quota(repo, bucket, limit):
    if not repo.consume_quota(bucket, limit):
        raise HTTPException(
            429,
            "Audit request limit reached. Retry in an hour; your saved reports remain available.",
        )
