from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, EmailStr
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import os
import jwt
import bcrypt
import json
import asyncio
import time
from typing import Optional, List

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# In-memory rate limiter (per-process, best-effort)
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

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str, org_name: str, customer_name: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "org": org_name,
        "name": customer_name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

class LoginRequest(BaseModel):
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

@app.post("/api/auth/login")
async def login(request: LoginRequest, response: Response, http_request: Request):
    # Rate limit login attempts by IP: 10/minute
    ip = _client_ip(http_request)
    if not _rate_limit(f"login:{ip}", limit=10, window_seconds=60):
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
            {"empEmail": spoc_email}
        ]
    })
    
    if not spoc:
        raise HTTPException(status_code=401, detail="MongoDB SPOC email is not registered. Please contact your MongoDB representative.")
    
    spoc_id = str(spoc.get("_id", spoc.get("ID", spoc.get("id", "unknown"))))
    spoc_name = spoc.get("emp_name", spoc.get("empName", "Unknown"))
    spoc_role = spoc.get("emp_role", spoc.get("empRole", "Unknown"))
    
    try:
        await db.customer_logins.insert_one({
            "organization_name": org_name,
            "customer_name": customer_name,
            "email": email,
            "spoc": {
                "spoc_id": spoc_id,
                "emp_name": spoc_name,
                "emp_email": spoc_email,
                "emp_role": spoc_role
            },
            "logged_in_at": datetime.now(timezone.utc),
            "ip": ip,
        })
    except Exception as e:
        print(f"Warning: Failed to log customer login: {e}")
    
    access_token = create_access_token(spoc_id, email, org_name, customer_name)
    
    # Secure cookie: HttpOnly + Secure + SameSite (Lax needed for cross-site login redirect flows)
    is_https = http_request.url.scheme == "https" or http_request.headers.get("X-Forwarded-Proto") == "https"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_https,
        samesite="lax",
        max_age=28800,
        path="/"
    )
    
    return {
        "organization_name": org_name,
        "customer_name": customer_name,
        "email": email,
        "spoc": {
            "name": spoc_name,
            "email": spoc_email,
            "role": spoc_role
        }
    }

@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logged out successfully"}

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "organization_name": user.get("org"),
        "customer_name": user.get("name"),
        "email": user.get("email")
    }

@app.get("/api/courses")
async def get_courses():
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
    track: Optional[str] = None
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
async def sse_batches(request: Request):
    async def event_generator():
        try:
            yield ": keepalive\n\n"
            
            batches = await get_batches(status="Accepting Nominations")
            data = json.dumps([batch if isinstance(batch, dict) else batch.dict() for batch in batches])
            yield f"data: {data}\n\n"
            
            while True:
                if await request.is_disconnected():
                    break
                
                await asyncio.sleep(30)
                
                batches = await get_batches(status="Accepting Nominations")
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
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)