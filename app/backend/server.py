from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pymongo import ReturnDocument
from datetime import datetime, timezone
from collections import defaultdict
import os
import json
import asyncio
import time
from typing import Optional, List

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "mcp-forge")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

_rate_buckets = defaultdict(list)

def _rate_limit(key: str, limit: int = 10, window_seconds: int = 60) -> bool:
    now = time.time()
    bucket = _rate_buckets[key]
    _rate_buckets[key] = [t for t in bucket if now - t < window_seconds]
    if len(_rate_buckets[key]) >= limit:
        return False
    _rate_buckets[key].append(now)
    return True

def _client_ip(request: Request) -> str:
    return (
        request.headers.get("CF-Connecting-IP")
        or (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response

allowed_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

def _profile_response(profile: dict) -> dict:
    spoc = profile.get("spoc", {})
    return {
        "organization_name": profile.get("organization_name"),
        "customer_name": profile.get("customer_name"),
        "email": profile.get("email"),
        "spoc": {
            "name": spoc.get("emp_name"),
            "email": spoc.get("emp_email"),
            "role": spoc.get("emp_role"),
        },
    }

async def get_current_user(request: Request) -> dict:
    user_id = request.cookies.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        profile = await db.user_profiles.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not profile:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return profile

class SignupRequest(BaseModel):
    organization_name: str
    customer_name: str
    email: EmailStr
    spoc_email: EmailStr

class BatchResponse(BaseModel):
    batch_id: str
    batch_no: int
    training_name: str
    track: str
    start_date: str
    end_date: str
    location: str
    instructor: str
    batch_type: str
    max_capacity: int
    enrolled_count: int
    available_seats: int
    status: str
    nominations_closed: bool

async def _signup(request: SignupRequest, response: Response, http_request: Request):
    ip = _client_ip(http_request)
    if not _rate_limit(f"signup:{ip}", limit=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again shortly.")

    org_name = request.organization_name.strip()
    customer_name = request.customer_name.strip()
    email = request.email.lower().strip()
    spoc_email = request.spoc_email.lower().strip()

    if not org_name or len(org_name) > 300:
        raise HTTPException(status_code=400, detail="Invalid organization name")
    if not customer_name or len(customer_name) > 200:
        raise HTTPException(status_code=400, detail="Invalid customer name")

    spoc = await db.spocDetail.find_one({
        "$or": [
            {"emp_email": spoc_email},
            {"empEmail": spoc_email},
        ]
    })

    if not spoc:
        raise HTTPException(
            status_code=401,
            detail="MongoDB SPOC email is not registered. Please contact your MongoDB representative.",
        )

    spoc_id = str(spoc.get("_id", spoc.get("ID", spoc.get("id", "unknown"))))
    spoc_name = spoc.get("emp_name", spoc.get("empName", "Unknown"))
    spoc_role = spoc.get("emp_role", spoc.get("empRole", "Unknown"))
    now = datetime.now(timezone.utc)

    profile = await db.user_profiles.find_one_and_update(
        {"email": email},
        {
            "$set": {
                "organization_name": org_name,
                "customer_name": customer_name,
                "email": email,
                "spoc": {
                    "spoc_id": spoc_id,
                    "emp_name": spoc_name,
                    "emp_email": spoc_email,
                    "emp_role": spoc_role,
                },
                "updated_at": now,
                "last_login_at": now,
                "last_ip": ip,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    is_https = http_request.url.scheme == "https" or http_request.headers.get("X-Forwarded-Proto") == "https"
    response.set_cookie(
        key="user_id",
        value=str(profile["_id"]),
        httponly=True,
        secure=is_https,
        samesite="lax",
        max_age=28800,
        path="/",
    )

    return _profile_response(profile)

@app.post("/api/auth/signup")
async def signup(request: SignupRequest, response: Response, http_request: Request):
    return await _signup(request, response, http_request)

@app.post("/api/auth/login")
async def login(request: SignupRequest, response: Response, http_request: Request):
    return await _signup(request, response, http_request)

@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="user_id", path="/")
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return _profile_response(user)

@app.get("/api/courses")
async def get_courses(user: dict = Depends(get_current_user)):
    try:
        with open("/app/content/courses.json", "r") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load courses: {str(e)}")

@app.get("/api/batches", response_model=List[BatchResponse])
async def get_batches(
    status: Optional[str] = None,
    location: Optional[str] = None,
    track: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query = {}
    if status:
        query["status"] = status
    if location and location != "all":
        if location == "Others":
            query["location"] = {"$nin": ["Pune"]}
        else:
            query["location"] = location
    if track and track != "all":
        query["track"] = track

    batches = []
    async for batch in db.batches.find(query):
        available_seats = max(0, batch.get("maxCapacity", batch.get("max_capacity", 0)) - batch.get("enrolledCount", batch.get("enrolled_count", 0)))
        batches.append({
            "batch_id": str(batch["_id"]),
            "batch_no": batch.get("batchNo", batch.get("batch_no", 0)),
            "training_name": batch.get("trainingName", batch.get("training_name", "")),
            "track": batch.get("track", ""),
            "start_date": batch.get("startDate", batch.get("start_date", datetime.now(timezone.utc))).isoformat() if isinstance(batch.get("startDate", batch.get("start_date")), datetime) else str(batch.get("startDate", batch.get("start_date", ""))),
            "end_date": batch.get("endDate", batch.get("end_date", datetime.now(timezone.utc))).isoformat() if isinstance(batch.get("endDate", batch.get("end_date")), datetime) else str(batch.get("endDate", batch.get("end_date", ""))),
            "location": batch.get("location", ""),
            "instructor": batch.get("instructor", ""),
            "batch_type": batch.get("batchType", batch.get("batch_type", "")),
            "max_capacity": batch.get("maxCapacity", batch.get("max_capacity", 0)),
            "enrolled_count": batch.get("enrolledCount", batch.get("enrolled_count", 0)),
            "available_seats": available_seats,
            "status": batch.get("status", ""),
            "nominations_closed": batch.get("nominationsClosed", batch.get("nominations_closed", False))
        })

    return batches

@app.get("/api/sse/batches")
async def sse_batches(request: Request, user: dict = Depends(get_current_user)):
    async def event_generator():
        try:
            yield ": keepalive\n\n"

            batches = await get_batches(status="Accepting Nominations", user=user)
            data = json.dumps([batch if isinstance(batch, dict) else batch.dict() for batch in batches])
            yield f"data: {data}\n\n"

            while True:
                if await request.is_disconnected():
                    break

                await asyncio.sleep(30)

                batches = await get_batches(status="Accepting Nominations", user=user)
                data = json.dumps([batch if isinstance(batch, dict) else batch.dict() for batch in batches])
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"SSE error: {e}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream"
        }
    )

@app.get("/api/health")
async def health_check():
    missing = []
    if not MONGO_URL:
        missing.append("MONGO_URL")
    return {
        "status": "ok" if not missing else "degraded",
        "missing": missing,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
