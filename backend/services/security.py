"""
RailMind AI — Department Login & Access Control
Four fixed accounts — one per operational department plus COA (Control
Office, which coordinates all three and therefore sees everything). This is
a lightweight, demo-appropriate auth layer: no user-management UI, just
real password hashing (PBKDF2, stdlib only — no C-extension dependency)
and real signed session tokens (JWT) that every protected route actually
checks server-side, not just something the frontend UI hides behind.
"""
import os
import time
import hashlib
import hmac as hmac_mod
from typing import Optional

import jwt
from fastapi import Header, HTTPException, Depends

SECRET_KEY = os.getenv("RAILMIND_SECRET_KEY", "railmind-dev-secret-do-not-use-in-production")
ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 8 * 3600  # one shift

DEPT_LABEL = {
    "engg": "Engineering (TMS)",
    "st": "Signal & Telecom (SMMS)",
    "trd": "Traction (TDMS)",
    "coa": "Control Office (COA)",
}

# The three operational departments, excluding COA — used by routes that are
# shared across every department (Block Planner, Corridor Map, AI Scheduler,
# Reports) so they can open access without hardcoding the list everywhere.
OPERATIONAL_DEPTS = ("engg", "st", "trd")

# Demo credentials — one password per department. Shown on the login page
# itself so a presenter never has to remember them separately.
_DEMO_PASSWORDS = {"engg": "engg123", "st": "st123", "trd": "trd123", "coa": "coa123"}


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"{salt.hex()}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split(":")
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), 100_000)
    return hmac_mod.compare_digest(dk.hex(), hash_hex)


# Hashed once at process start — never stores or compares plaintext.
_ACCOUNTS = {dept: hash_password(pwd) for dept, pwd in _DEMO_PASSWORDS.items()}


def authenticate(department: str, password: str) -> bool:
    stored = _ACCOUNTS.get(department)
    return bool(stored) and verify_password(password, stored)


def create_token(department: str) -> str:
    payload = {"dept": department, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> str:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return payload["dept"]


def get_current_department(authorization: Optional[str] = Header(None)) -> str:
    """FastAPI dependency: resolves the bearer token to a department, or 401s."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    token = authorization[len("Bearer "):]
    try:
        dept = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Your session has expired — sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session.")
    if dept not in DEPT_LABEL:
        raise HTTPException(status_code=401, detail="Invalid session.")
    return dept


def require_department(*allowed: str):
    """Router-level access guard. COA always has full access regardless of
    which departments are listed — every other role is restricted to
    exactly the department(s) named here."""
    allowed_set = set(allowed) | {"coa"}

    def checker(dept: str = Depends(get_current_department)) -> str:
        if dept not in allowed_set:
            raise HTTPException(
                status_code=403,
                detail=f"{DEPT_LABEL.get(dept, dept)} does not have access to this module.",
            )
        return dept

    return checker
