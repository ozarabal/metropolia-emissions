"""
Pydantic v2 schemas — request validation and response serialization.
FastAPI uses these for automatic docs (Swagger UI at /docs).
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any
from datetime import date


# ── REQUEST SCHEMAS ───────────────────────────────────────────

class CalculateRequest(BaseModel):
    """Input for a single emission calculation."""
    mode:        str   = Field(..., description="road | rail | sea | air")
    sub_mode:    str   = Field("",  description="Vehicle/vessel type from workbook")
    fuel_code:   str   = Field("",  description="GASOLINE | DIESEL | B35 | GRID_ELECTRICITY | etc.")
    distance_km: float = Field(..., gt=0, description="Distance in kilometres")
    quantity:    float = Field(1.0, ge=0, description="Passengers or cargo tonnes")
    trip_date:   Optional[date]   = None
    origin:      Optional[str]    = None
    destination: Optional[str]    = None

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v):
        allowed = {"road", "rail", "sea", "air"}
        if v.lower() not in allowed:
            raise ValueError(f"mode must be one of {allowed}")
        return v.lower()

    @field_validator("distance_km")
    @classmethod
    def validate_distance(cls, v):
        if v > 50000:
            raise ValueError("Distance exceeds 50,000 km — please verify input")
        return v


# ── RESPONSE SCHEMAS ──────────────────────────────────────────

class CalculateResponse(BaseModel):
    """Result of a single emission calculation."""
    id:               str
    mode:             str
    sub_mode:         str
    fuel_code:        str
    distance_km:      float
    quantity:         float
    emission_factor:  float
    factor_unit:      str
    kg_co2e:          float
    t_co2e:           float
    methodology:      str
    trip_date:        Optional[date]   = None
    origin:           Optional[str]    = None
    destination:      Optional[str]    = None

    model_config = {"from_attributes": True}


class RecordOut(BaseModel):
    """Single record from the database — used in GET /api/records."""
    id:             str
    transport_mode: str
    sub_mode:       Optional[str]
    fuel_code:      Optional[str]
    distance_km:    float
    quantity:       float
    kg_co2e:        float
    t_co2e:         float
    trip_date:      Optional[date]
    origin:         Optional[str]
    destination:    Optional[str]
    source_file:    Optional[str]
    source_format:  Optional[str]

    model_config = {"from_attributes": True}


class BatchSummary(BaseModel):
    """Summary returned after a CSV batch upload."""
    batch_id:         str
    source_file:      str
    total_rows:       int
    rows_successful:  int
    rows_failed:      int
    total_kg_co2e:    float
    total_t_co2e:     float
    by_mode:          dict[str, float]
    errors:           list[dict[str, Any]] = []


class SummaryByMode(BaseModel):
    """Aggregated totals per transport mode — used in GET /api/summary."""
    mode:           str
    record_count:   int
    total_kg_co2e:  float
    total_t_co2e:   float
    avg_factor:     float