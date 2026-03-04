"""
Backend Emissions Calculator
============================
Mirrors the frontend JS engine exactly — same formulas, same EF values.
Source: metropolia_transport_co2_dummy_workbook.xlsx (01_Intro_Glossary)

Formulas:
  Road:      Fuel_L = Vehicles × Avg_km × FuelEconomy/100  → CO2_t = Fuel_L × EF / 1000
  Rail Elec: CO2_t = Energy_kWh × EF(kgCO2/kWh) / 1000
  Rail Dies: CO2_t = Diesel_L × EF(kgCO2/L) / 1000
  Sea:       Fuel_ton = Distance_NM × FuelIntensity  → CO2_t = Fuel_ton × EF
  Aviation:  Fuel_kg = Flights × Fuel_L × 0.8  → CO2_t = Fuel_kg × EF / 1000
"""

# ── EMISSION FACTORS (01_Intro_Glossary rows 35-43) ──────────
EMISSION_FACTORS = {
    "GASOLINE":         {"value": 2.31,  "unit": "kgCO2/liter",   "label": "Gasoline (road)"},
    "DIESEL":           {"value": 2.65,  "unit": "kgCO2/liter",   "label": "Diesel (road/rail)"},
    "B35":              {"value": 1.61,  "unit": "kgCO2/liter",   "label": "Biodiesel blend B35"},
    "GRID_ELECTRICITY": {"value": 0.70,  "unit": "kgCO2/kWh",     "label": "Grid electricity (Metropolia)"},
    "MARINE_DIESEL":    {"value": 3.177, "unit": "tCO2/ton_fuel", "label": "Marine diesel"},
    "HFO_LFO":          {"value": 3.171, "unit": "tCO2/ton_fuel", "label": "Heavy/Light fuel oil"},
    "LNG_LPG":          {"value": 3.017, "unit": "tCO2/ton_fuel", "label": "LNG/LPG"},
    "JET_FUEL":         {"value": 3.16,  "unit": "kgCO2/kg_fuel", "label": "Jet fuel"},
}

AVIATION_DENSITY = 0.8  # kg/L — from Glossary cell C45

# ── DEFAULT FUEL CODES per mode (fallback when not specified) ─
DEFAULT_FUEL = {
    "road": "GASOLINE",
    "rail": "GRID_ELECTRICITY",
    "sea":  "HFO_LFO",
    "air":  "JET_FUEL",
}

# ── DEFAULT ENERGY INTENSITY per sub_mode ────────────────────
# Used when intensity is not provided explicitly
DEFAULT_INTENSITY = {
    # Rail (kWh/km for electric, L/km for diesel)
    "Commuter Train":        {"intensity": 8.0,  "traction": "Electric"},
    "MRT":                   {"intensity": 10.5, "traction": "Electric"},
    "LRT":                   {"intensity": 7.5,  "traction": "Electric"},
    "High Speed Railway":    {"intensity": 20.0, "traction": "Electric"},
    "Long Distance Train":   {"intensity": 6.5,  "traction": "Electric"},
    "Local Diesel Train":    {"intensity": 2.2,  "traction": "Diesel"},
    "Rail Freight (Elec)":   {"intensity": 18.0, "traction": "Electric"},
    "Rail Freight (Diesel)": {"intensity": 4.0,  "traction": "Diesel"},
    # Sea fuel intensities (t/NM)
    "Passenger Ferry":       {"intensity": 0.015},
    "Tugboat/Port Svc":      {"intensity": 0.010},
    "General Cargo":         {"intensity": 0.028},
    "Container Ship":        {"intensity": 0.030},
    "Tanker":                {"intensity": 0.032},
    "Bulk Carrier":          {"intensity": 0.040},
}

METHODOLOGIES = {
    "road": "IPCC 2006 Vol.2 Ch.3 + EMEP/EEA 2023. Formula: Fuel_L = Vehicles×Avg_km×FuelEconomy/100 → CO2_t = Fuel_L×EF/1000",
    "rail": "IEA CO2 Emissions 2023. Electric: CO2_t=kWh×EF/1000. Diesel: CO2_t=Diesel_L×EF/1000",
    "sea":  "IMO Fourth GHG Study 2020. Formula: Fuel_ton=Distance_NM×FuelIntensity → CO2_t=Fuel_ton×EF",
    "air":  "ICAO CORSIA v12. Formula: Fuel_kg=Flights×Fuel_L×0.8kg/L → CO2_t=Fuel_kg×EF/1000",
}


def calculate_emission(payload) -> dict:
    """
    Core calculation function.
    Accepts either a CalculateRequest object or a dict-like object.
    Returns a result dict with kg_co2e, t_co2e, and audit metadata.
    """
    def _get(key, default=None):
        if hasattr(payload, key):
            return getattr(payload, key)
        if isinstance(payload, dict):
            return payload.get(key, default)
        return default

    mode        = _get("mode") or "road"
    sub_mode    = _get("sub_mode") or ""
    fuel_code   = _get("fuel_code") or ""
    distance_km = float(_get("distance_km") or 0)
    quantity    = float(_get("quantity") or 1)

    if distance_km <= 0:
        return {"error": "distance_km must be greater than 0"}

    # Resolve fuel code — use provided or fall back to mode default
    fuel_code = fuel_code.upper() if fuel_code else DEFAULT_FUEL.get(mode, "DIESEL")
    if fuel_code not in EMISSION_FACTORS:
        fuel_code = DEFAULT_FUEL.get(mode, "DIESEL")

    ef_data = EMISSION_FACTORS[fuel_code]
    ef_value = ef_data["value"]
    kg_co2e = 0.0
    factor_unit = ef_data["unit"]

    # ── ROAD ─────────────────────────────────────────────────
    # Formula: Fuel_L = Vehicles × Avg_km × FuelEconomy/100 → CO2_t = Fuel_L × EF / 1000
    # For the API single-trip mode: CO2 = distance_km × EF(kgCO2/L) × fuel_economy / 100
    # When called with distance directly (not fleet), treat as vehicle-km:
    # CO2_kg = distance_km × quantity(vehicles) × ef_value(kgCO2/L) × assumed_FE / 100
    # Simplified to: distance × EF directly for single-trip calculation
    if mode == "road":
        # Single trip: fuel_L ≈ distance_km × FuelEconomy(L/100km) / 100
        # Default economy 8.5 L/100km (workbook Passenger Cars default)
        fuel_economy = 8.5
        fuel_L = distance_km * quantity * fuel_economy / 100
        kg_co2e = fuel_L * ef_value
        factor_unit = "kgCO2/liter"

    # ── RAIL ─────────────────────────────────────────────────
    # Electric: CO2_t = Energy_kWh × EF(kgCO2/kWh) / 1000
    # Diesel:   CO2_t = Diesel_L × EF(kgCO2/L) / 1000
    elif mode == "rail":
        rail_info = DEFAULT_INTENSITY.get(sub_mode, {"intensity": 8.0, "traction": "Electric"})
        intensity = rail_info["intensity"]
        traction  = rail_info.get("traction", "Electric")

        if traction == "Electric":
            energy_kwh = intensity * distance_km * quantity
            kg_co2e    = energy_kwh * EMISSION_FACTORS["GRID_ELECTRICITY"]["value"]
            factor_unit = "kgCO2/kWh"
        else:
            diesel_L = intensity * distance_km * quantity
            kg_co2e  = diesel_L * EMISSION_FACTORS["DIESEL"]["value"]
            factor_unit = "kgCO2/liter"

    # ── SEA ──────────────────────────────────────────────────
    # distance_km is converted to NM internally (1 km = 0.539957 NM)
    # Fuel_ton = Distance_NM × FuelIntensity(t/NM) → CO2_t = Fuel_ton × EF(tCO2/ton)
    elif mode == "sea":
        dist_nm    = distance_km * 0.539957
        sea_info   = DEFAULT_INTENSITY.get(sub_mode, {"intensity": 0.028})
        intensity  = sea_info["intensity"]
        fuel_ton   = dist_nm * intensity * quantity
        kg_co2e    = fuel_ton * ef_value * 1000  # tCO2 → kgCO2
        factor_unit = "tCO2/ton_fuel"

    # ── AVIATION ─────────────────────────────────────────────
    # Fuel_kg = Flights × AvgFuel_L × 0.8 kg/L → CO2_t = Fuel_kg × EF / 1000
    # For single trip: fuel_kg ≈ distance_km × fuel_burn_rate
    # Average narrow-body: ~4.5 L/km (workbook: 4200L / ~930km avg domestic)
    elif mode == "air":
        fuel_burn_rate = 4.5  # L/km — approximate for narrow-body
        fuel_L   = distance_km * quantity * fuel_burn_rate
        fuel_kg  = fuel_L * AVIATION_DENSITY
        kg_co2e  = fuel_kg * ef_value
        factor_unit = "kgCO2/kg_fuel"

    return {
        "mode":             mode,
        "sub_mode":         sub_mode or "",
        "fuel_code":        fuel_code,
        "distance_km":      distance_km,
        "quantity":         quantity,
        "emission_factor":  ef_value,
        "factor_unit":      factor_unit,
        "kg_co2e":          round(kg_co2e, 4),
        "t_co2e":           round(kg_co2e / 1000, 7),
        "methodology":      METHODOLOGIES.get(mode, "GHG Protocol Corporate Standard"),
    }