"""
SQLAlchemy ORM Models — defines the PostgreSQL table structure.
Table is auto-created on startup via Base.metadata.create_all().
"""

from sqlalchemy import Column, String, Float, Date, DateTime, Boolean, Text, Index
from sqlalchemy.sql import func
from database import Base


class TransportRecord(Base):
    """
    Core table storing every emission calculation result.
    Indexed for fast filtering by mode, date, and batch.
    """
    __tablename__ = "transport_records"

    # ── Identifiers ──────────────────────────────────────────
    id              = Column(String(36), primary_key=True, index=True)
    batch_id        = Column(String(36), nullable=True, index=True)

    # ── Transport attributes ──────────────────────────────────
    transport_mode  = Column(String(20), nullable=False, index=True)   # road|rail|sea|air
    sub_mode        = Column(String(100), nullable=True)
    fuel_code       = Column(String(50), nullable=True)                # GASOLINE|DIESEL|B35 etc.
    category        = Column(String(50), nullable=True)                # passenger|freight

    # ── Activity data (normalized to SI units) ────────────────
    distance_km     = Column(Float, nullable=False)
    quantity        = Column(Float, default=1.0)                       # passengers or tonnes
    origin          = Column(String(200), nullable=True)
    destination     = Column(String(200), nullable=True)
    trip_date       = Column(Date, nullable=True, index=True)

    # ── Calculation outputs ───────────────────────────────────
    emission_factor = Column(Float, nullable=True)
    factor_unit     = Column(String(50), nullable=True)
    kg_co2e         = Column(Float, nullable=False)
    t_co2e          = Column(Float, nullable=False)
    calculation_methodology = Column(Text, nullable=True)

    # ── Data provenance ───────────────────────────────────────
    source_file     = Column(String(255), nullable=True)
    source_format   = Column(String(50), default="manual")             # csv|excel|api|manual
    is_estimated    = Column(Boolean, default=False)

    # ── Audit trail ───────────────────────────────────────────
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    # ── Composite indexes for common dashboard queries ────────
    __table_args__ = (
        Index("ix_mode_date", "transport_mode", "trip_date"),
        Index("ix_batch_mode", "batch_id", "transport_mode"),
    )

    def __repr__(self):
        return f"<TransportRecord {self.id} | {self.transport_mode} | {self.kg_co2e:.2f} kgCO2e>"