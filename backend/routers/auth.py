from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from services.security import authenticate, create_token, get_current_department, DEPT_LABEL

router = APIRouter(prefix="/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    department: str
    password: str


@router.post("/login")
def login(body: LoginRequest):
    dept = body.department.strip().lower()
    if dept not in DEPT_LABEL:
        raise HTTPException(status_code=400, detail="Unknown department.")
    if not authenticate(dept, body.password):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    return {
        "access_token": create_token(dept),
        "department": dept,
        "label": DEPT_LABEL[dept],
        "full_access": dept == "coa",
    }


@router.get("/me")
def me(dept: str = Depends(get_current_department)):
    """Lets the frontend verify a stored token is still valid on page load."""
    return {"department": dept, "label": DEPT_LABEL[dept], "full_access": dept == "coa"}
