"""
METROPOLIA TRANSPORT EMISSIONS — FASTAPI BACKEND
=================================================
Endpoints:
  POST /api/calculate          → single record calculation
  POST /api/calculate/batch    → bulk calculation (CSV/JSON)
  GET  /api/records            → paginated record list
  GET  /api/summary            → aggregated totals by mode
  GET  /api/factors            → emission factor reference table
  GET  /health                 → health check (used by Docker + Azure)

Stack:
  FastAPI + SQLAlchemy (PostgreSQL) + Redis cache + Pydantic v2
"""

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import redis.asyncio as aioredis
import json
import csv
import io
import uuid
from datetime import date, datetime
from typing import Optional
from contextlib import asynccontextmanager

from database import get_db, engine
from models import Base, TransportRecord
from schemas import (
    CalculateRequest, CalculateResponse,
    BatchSummary, RecordOut, SummaryByMode
)
from calculator import calculate_emission, EMISSION_FACTORS
from config import settings
from sqlalchemy.orm import Session
from sqlalchemy import func

# ── STARTUP / SHUTDOWN ────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all DB tables on startup
    Base.metadata.create_all(bind=engine)
    # Connect Redis — optional, skip caching if unavailable
    try:
        redis = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
        )
        await redis.ping()
        app.state.redis = redis
    except Exception:
        app.state.redis = None  # Redis unavailable — summary endpoint will query DB directly
    yield
    # Cleanup on shutdown
    if app.state.redis:
        await app.state.redis.close()

# ── APP INIT ──────────────────────────────────────────────────
app = FastAPI(
    title="Metropolia Transport CO₂ MRV API",
    description="National Transport Authority — Emissions Calculation & Data Management",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DEPENDENCY: Redis ─────────────────────────────────────────
def get_redis(request):
    return request.app.state.redis

# ═════════════════════════════════════════════════════════════
# ENDPOINTS
# ═════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    """Health check — used by Docker, Azure, and load balancers."""
    return {"status": "ok", "service": "metropolia-emissions-api", "version": "1.0.0"}


# ── SINGLE CALCULATION ────────────────────────────────────────
@app.post("/api/calculate", response_model=CalculateResponse)
async def calculate_single(
    payload: CalculateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Calculate CO₂ for a single transport activity.
    Stores result in PostgreSQL for audit trail.
    """
    result = calculate_emission(payload)
    if result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])

    # Persist to PostgreSQL
    record = TransportRecord(
        id=str(uuid.uuid4()),
        transport_mode=payload.mode,
        sub_mode=payload.sub_mode,
        fuel_code=payload.fuel_code,
        distance_km=payload.distance_km,
        quantity=payload.quantity or 1,
        kg_co2e=result["kg_co2e"],
        t_co2e=result["t_co2e"],
        trip_date=payload.trip_date or date.today(),
        origin=payload.origin,
        destination=payload.destination,
        source_file="manual",
        source_format="api",
        calculation_methodology=result["methodology"],
        emission_factor=result["emission_factor"],
        factor_unit=result["factor_unit"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    redis = get_redis(request)
    if redis:
        await redis.delete("summary:by_mode")

    return CalculateResponse(id=record.id, **result)


# ── BATCH CALCULATION (CSV UPLOAD) ────────────────────────────
@app.post("/api/calculate/batch", response_model=BatchSummary)
async def calculate_batch(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV file. Auto-maps column names, calculates all rows,
    stores in PostgreSQL, returns summary + per-row results.
    Handles fragmented/messy real-world data formats.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))

    results = []
    errors  = []
    batch_id = str(uuid.uuid4())

    for i, row in enumerate(reader):
        try:
            normalized = normalize_row(row, file.filename)
            calc = calculate_emission(normalized)

            if calc.get("error"):
                errors.append({"row": i + 2, "error": calc["error"], "raw": dict(row)})
                continue

            record = TransportRecord(
                id=str(uuid.uuid4()),
                batch_id=batch_id,
                transport_mode=normalized.mode,
                sub_mode=normalized.sub_mode,
                fuel_code=normalized.fuel_code,
                distance_km=normalized.distance_km,
                quantity=normalized.quantity,
                kg_co2e=calc["kg_co2e"],
                t_co2e=calc["t_co2e"],
                trip_date=normalized.trip_date or date.today(),
                origin=normalized.origin,
                destination=normalized.destination,
                source_file=file.filename,
                source_format="csv",
                calculation_methodology=calc["methodology"],
                emission_factor=calc["emission_factor"],
                factor_unit=calc["factor_unit"],
            )
            db.add(record)
            results.append({"id": record.id, **calc})

        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "raw": dict(row)})

    db.commit()
    
    total_kg = sum(r["kg_co2e"] for r in results)
    by_mode  = {}
    for r in results:
        by_mode[r["mode"]] = by_mode.get(r["mode"], 0) + r["kg_co2e"]

    return BatchSummary(
        batch_id=batch_id,
        source_file=file.filename,
        total_rows=len(results) + len(errors),
        rows_successful=len(results),
        rows_failed=len(errors),
        total_kg_co2e=round(total_kg, 3),
        total_t_co2e=round(total_kg / 1000, 6),
        by_mode=by_mode,
        errors=errors,
    )


# ── GET RECORDS (paginated) ───────────────────────────────────
@app.get("/api/records", response_model=list[RecordOut])
async def get_records(
    mode: Optional[str] = Query(None, description="Filter by transport mode"),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list of all stored emission records."""
    query = db.query(TransportRecord)
    if mode:
        query = query.filter(TransportRecord.transport_mode == mode)
    return query.order_by(TransportRecord.created_at.desc()).offset(offset).limit(limit).all()


# ── SUMMARY BY MODE (Redis cached) ───────────────────────────
@app.get("/api/summary", response_model=list[SummaryByMode])
async def get_summary(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Aggregated CO₂ totals by transport mode.
    Result is cached in Redis for 5 minutes to reduce DB load.
    This is the key endpoint for the dashboard.
    """
    redis = get_redis(request)
    cache_key = "summary:by_mode"

    # Try Redis cache first (skip if Redis is unavailable)
    if redis:
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

    # Cache miss — query DB
    rows = (
        db.query(
            TransportRecord.transport_mode,
            func.count(TransportRecord.id).label("record_count"),
            func.sum(TransportRecord.kg_co2e).label("total_kg_co2e"),
            func.sum(TransportRecord.t_co2e).label("total_t_co2e"),
            func.avg(TransportRecord.emission_factor).label("avg_factor"),
        )
        .group_by(TransportRecord.transport_mode)
        .all()
    )

    result = [
        {
            "mode": r.transport_mode,
            "record_count": r.record_count,
            "total_kg_co2e": round(r.total_kg_co2e or 0, 2),
            "total_t_co2e": round(r.total_t_co2e or 0, 4),
            "avg_factor": round(r.avg_factor or 0, 6),
        }
        for r in rows
    ]

    # Store in Redis with 5-minute TTL (skip if Redis is unavailable)
    if redis:
        await redis.setex(cache_key, 60, json.dumps(result))

    return result


# ── EMISSION FACTORS REFERENCE ────────────────────────────────
@app.get("/api/factors")
async def get_factors():
    """Return the full emission factor reference table (from workbook Glossary)."""
    return {"factors": EMISSION_FACTORS, "aviation_density_kg_per_L": 0.8}


# ── NORMALIZE ROW (multi-source column mapping) ───────────────
def normalize_row(raw: dict, source_file: str) -> CalculateRequest:
    """
    Maps variant column names from different agency CSV formats
    to the canonical CalculateRequest schema.
    Mirrors the same logic in the React frontend.
    """
    def get(*keys):
        for k in keys:
            for rk, rv in raw.items():
                if rk.lower().strip() == k.lower():
                    if rv and str(rv).strip():
                        return str(rv).strip()
        return None

    mode_raw = (get("mode", "transport_mode", "type", "modal") or "road").lower()
    mode_map = {
        "road":  ["road","car","truck","bus","vehicle","land","motorcycle"],
        "rail":  ["rail","train","metro","tram","subway","lrt","mrt"],
        "sea":   ["sea","ship","vessel","ferry","maritime","marine","boat"],
        "air":   ["air","flight","plane","aviation","aircraft"],
    }
    mode = "road"
    for m, syns in mode_map.items():
        if any(s in mode_raw for s in syns):
            mode = m
            break

    dist_km = float(get("distance_km","distance","km","kilometers") or 0)
    dist_mi = float(get("distance_mi","miles","mi") or 0)
    dist_nm = float(get("distance_nm","nautical_miles","nm") or 0)
    if not dist_km:
        dist_km = dist_mi * 1.60934 if dist_mi else dist_nm * 1.852

    raw_date = get("date","trip_date","record_date","journey_date")
    try:
        parsed_date = date.fromisoformat(raw_date) if raw_date else date.today()
    except Exception:
        parsed_date = date.today()

    return CalculateRequest(
        mode=mode,
        sub_mode=get("sub_mode","submode","vehicle","category") or "",
        fuel_code=get("fuel_code","fuel","fuel_type") or "",
        distance_km=dist_km,
        quantity=float(get("quantity","qty","passengers","pax","tonnes","cargo") or 1),
        trip_date=parsed_date,
        origin=get("origin","from","departure"),
        destination=get("destination","to","arrival"),
    )