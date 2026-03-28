"""API key encryption/decryption using Fernet symmetric encryption."""

import os
import base64
import hashlib
from cryptography.fernet import Fernet


def _get_fernet() -> Fernet:
    secret = os.getenv("WORKBENCH_SECRET_KEY", "default-dev-key-change-in-production")
    # Derive a valid Fernet key from the secret
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_api_key(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()
