# Metropolia Transport CO2 MRV Platform

> **Low-Carbon Transport Initiative — Republic of Metropolia**
> Replaces fragmented Excel/VBA workflows with a centralized, auditable web platform for transport emissions calculation.

---

## Project Overview

The National Transport Authority of Metropolia previously calculated transport emissions using many Excel files processed through VBA macros. This manual, fragmented approach limits scalability, increases error risk, and reduces transparency.

This platform replaces that system with:

- **Consistent emission calculations** using workbook-defined formulas and internationally recognized emission factors
- **Multi-source data ingestion** that handles variant column names, mixed units, and different file formats
- **Web + Mobile access** via a single React Progressive Web App (PWA)
- **Persistent storage** via FastAPI + PostgreSQL with Redis caching for summary queries

> **Note: This application runs locally only.** There is no live deployment. Follow the setup instructions below to run it on your machine.

---

## Emission Calculation Methodology

All calculations follow the formulas from `metropolia_transport_co2_dummy_workbook.xlsx`:

| Mode | Formula | EF Source |
|------|---------|-----------|
| **Road** | `Fuel_L = Vehicles × Avg_km × FuelEconomy/100` → `CO2_t = Fuel_L × EF / 1000` | IPCC 2006 / EMEP 2023 |
| **Rail (Electric)** | `CO2_t = Energy_kWh × EF(kgCO2/kWh) / 1000` | IEA 2023 |
| **Rail (Diesel)** | `CO2_t = Diesel_L × EF(kgCO2/L) / 1000` | IPCC 2006 |
| **Sea** | `Fuel_ton = Distance_NM × FuelIntensity` → `CO2_t = Fuel_ton × EF` | IMO GHG Study 2020 |
| **Aviation** | `Fuel_kg = Flights × Fuel_L × 0.8` → `CO2_t = Fuel_kg × EF / 1000` | ICAO CORSIA v12 |

### Emission Factors (workbook `01_Intro_Glossary`, rows 35–43)

| Fuel Code | EF Value | Unit |
|-----------|----------|------|
| GASOLINE | 2.31 | kgCO2/liter |
| DIESEL | 2.65 | kgCO2/liter |
| B35 | 1.61 | kgCO2/liter |
| GRID_ELECTRICITY | 0.70 | kgCO2/kWh |
| MARINE_DIESEL | 3.177 | tCO2/ton_fuel |
| HFO_LFO | 3.171 | tCO2/ton_fuel |
| JET_FUEL | 3.16 | kgCO2/kg_fuel |
| Aviation density | 0.80 | kg/L (Glossary C45) |

---

## Local Setup

### Option A — Frontend only (no backend required)

All emission calculations run in the browser. The backend is optional — the app degrades gracefully when it is offline.

**Prerequisites:** Node.js 18+

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/metropolia-emissions.git

# 2. Install frontend dependencies
cd metropolia-emissions/frontend
npm install

# 3. Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

### Option B — Full stack (frontend + backend + database)

**Prerequisites:** Node.js 18+, Python 3.12+, Docker Desktop

#### Step 1 — Install Python dependencies

```bash
cd metropolia-emissions/backend
pip install -r requirements.txt
```

The `requirements.txt` installs:

| Package | Purpose |
|---------|---------|
| `fastapi` | API framework |
| `uvicorn` | ASGI server to run FastAPI |
| `sqlalchemy` | ORM — maps Python models to database tables |
| `psycopg2-binary` | PostgreSQL driver for Python |
| `redis` | Redis client for caching |
| `pydantic` / `pydantic-settings` | Data validation and config from environment variables |
| `python-multipart` | Required for file upload (`POST /api/calculate/batch`) |
| `alembic` | Database migration tool |

#### Step 2 — Start all services with Docker

```bash
cd metropolia-emissions
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend (React PWA) | [http://localhost:3000](http://localhost:3000) |
| API (FastAPI + Swagger docs) | [http://localhost:8000/docs](http://localhost:8000/docs) |
| PostgreSQL | `localhost:5434` |
| Redis | `localhost:6377` |

#### Alternatively — Run backend without Docker

If you prefer to run the FastAPI server directly (requires PostgreSQL and Redis already running locally):

```bash
cd backend
uvicorn main:app --reload --port 8000
```

---

## Why This Tech Stack

Every choice below was made deliberately — not just because it was popular, but because it fits the specific constraints of this project.

### React 19 + Vite (frontend)

**React** is the industry-standard library for building interactive UIs with component-based architecture. It handles re-renders efficiently via a virtual DOM, which matters here because the Calculator tab re-computes CO2 values on every input change.

**Why not Vue or Svelte?** React has the largest ecosystem, the most Stack Overflow coverage, and is what most employers expect. For a demo project that may be reviewed by technical stakeholders, React reduces friction.

**Why not Next.js?** Next.js adds server-side rendering and file-based routing — useful for SEO-heavy sites, but unnecessary overhead for a single-page internal tool that has no public SEO requirements.

**Vite** replaces the old Create React App (Webpack) toolchain. It starts the dev server in under a second using native ES modules, compared to 20–40 seconds for Webpack on larger projects. Hot module replacement is near-instant.

### Progressive Web App (PWA)

A PWA is a web app with a `manifest.json` and service worker, which lets browsers install it like a native app. This satisfies the "Web App AND Mobile App" requirement with a single codebase — no React Native, no App Store submission, no duplicate logic.

**Why not a native app?** Native apps require a separate codebase (Swift/Kotlin or React Native), a developer account (~$99/year for Apple), and a review process. A PWA costs nothing extra and works on every platform.

### FastAPI (backend)

**FastAPI** is the fastest Python web framework for building APIs. It uses Python type hints natively to generate automatic request validation, serialization, and interactive Swagger docs at `/docs` with zero extra code.

**Why not Django?** Django is a full-stack framework designed for server-rendered web apps with admin panels and template engines. For an API-only backend that serves a React SPA, Django brings unnecessary complexity (ORM, migrations, sessions, middleware stack).

**Why not Flask?** Flask is synchronous by default, which blocks the event loop on I/O operations (database queries, file reads). FastAPI is async-first via ASGI/uvicorn — it handles concurrent requests without blocking.

**Why Python for the backend?** Python is the standard language for data science and emissions modeling. A future analyst team can extend the calculation engine using NumPy, pandas, or scikit-learn without switching languages.

### PostgreSQL (database)

PostgreSQL is a production-grade relational database with strong ACID guarantees, concurrent write support, and rich query capabilities (window functions, JSON columns, full-text search).

**Why not SQLite?** SQLite is a file-based database that serializes writes — only one write can happen at a time. For a multi-user platform where multiple agencies upload CSVs simultaneously, SQLite becomes a bottleneck immediately.

**Why not MySQL?** PostgreSQL has better standards compliance, superior JSON support, and more advanced indexing options. It is also the default choice for most cloud platforms (Azure Database for PostgreSQL, Supabase, Neon).

### Redis (caching)

The `GET /api/summary` endpoint aggregates totals across all records. Running a `GROUP BY` query on every page load is wasteful when the underlying data changes infrequently. Redis caches the result for 5 minutes, cutting repeated database hits to zero.

**Why not in-memory caching inside FastAPI?** Process-local caches are lost on restart and don't scale across multiple API instances. Redis is a separate process, so the cache survives API restarts and is shared across horizontal replicas.

### SQLAlchemy (ORM)

SQLAlchemy maps Python class definitions to database tables. Instead of writing raw SQL strings (which are hard to type-check and prone to injection), models are defined as Python classes and queries use Python syntax.

**Why not raw SQL?** Raw SQL strings bypass type checking, are harder to refactor, and require manual escaping to prevent SQL injection. SQLAlchemy handles parameterization automatically.

### Docker Compose (local orchestration)

Docker Compose starts all services (API, PostgreSQL, Redis) with a single `docker compose up` command. Each service runs in an isolated container with pinned image versions, so the environment is identical on every machine.

**Why not just install PostgreSQL locally?** Local installations create "works on my machine" problems — different OS, different PostgreSQL version, different collation settings. Docker eliminates that class of bugs entirely.

---

## API Reference

Full interactive docs available at [http://localhost:8000/docs](http://localhost:8000/docs) when the backend is running.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/calculate` | Single record calculation + persist to DB |
| `POST` | `/api/calculate/batch` | CSV batch upload with column normalization |
| `GET` | `/api/records` | Paginated record history (filter by mode) |
| `GET` | `/api/summary` | Aggregated totals by mode (Redis-cached 5 min) |
| `GET` | `/api/factors` | Emission factor reference table |
| `GET` | `/health` | Health check |

---

## AI Tools Used

| Tool | How It Was Used |
|------|----------------|
| **Claude (Anthropic)** | Code generation (React app, emissions engine, Docker Compose, PWA manifest) |
| **Manual verification** | All emission factors cross-checked against IPCC 2006, IMO GHG Study 2020, and ICAO CORSIA v12 primary sources |

**Decisions made by the project team, not AI:**
- React PWA over React Native (single codebase, faster delivery)
- Exact calculation formulas taken from the recruiter-provided workbook, not assumed
- Tech stack choices documented above with explicit reasoning
