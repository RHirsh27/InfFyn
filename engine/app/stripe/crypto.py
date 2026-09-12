"""Symmetric encryption for the Stripe App read-only refresh token at rest.

The refresh token is the long-lived credential the app grant issues. It is stored
encrypted in `stripe_connections.refresh_token_encrypted`; the key lives only in the
engine's Render env (`STRIPE_TOKEN_ENC_KEY`), never in the repo or the database.

Generate a key once with:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from app.config import settings


def _fernet() -> Fernet:
    key = settings.stripe_token_enc_key
    if not key:
        raise HTTPException(status_code=500, detail="STRIPE_TOKEN_ENC_KEY not configured")
    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=500, detail="STRIPE_TOKEN_ENC_KEY is not a valid Fernet key") from exc


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token for storage. Returns urlsafe base64 ciphertext."""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a stored token. Raises 500 if the key can't open the ciphertext."""
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(status_code=500, detail="Stored Stripe refresh token could not be decrypted") from exc
