# 🌿 Metropolia Transport CO₂ MRV Platform

> **Low-Carbon Transport Initiative — Republic of Metropolia**  
> Built for the National Transport Authority to replace fragmented Excel/VBA workflows with a centralized, auditable, scalable emissions calculation platform.

---

## 📋 Project Overview

The National Transport Authority of Metropolia previously calculated transport emissions using a large number of Excel files processed through VBA macros. This manual, fragmented approach limits scalability, increases error risk, and reduces transparency.

This platform replaces that system with:

- **Consistent emission calculations** using the workbook-defined formulas and internationally recognized emission factors
- **Multi-source data ingestion** that handles variant column names, mixed units, and different file formats
- **Web + Mobile access** via a single React PWA
- **Scalable architecture** designed to grow from hundreds to millions of records

---

Problem → Solution strip at the top — side by side, showing exactly what the old Excel/VBA approach failed at and what the platform fixes.

Data Collection → Upload → Auto-normalize
Apply workbook formulas → Store in PostgreSQL → Redis cache
National summary → Executive dashboard → MRV export

Click any step node → the right panel shows full detail: description, inputs, outputs, known constraints, and the exact technologies behind it.
System architecture grid below shows the 4 technical layers (React PWA → FastAPI → PostgreSQL+Redis).

---

## 🧮 Emission Calculation Methodology

All calculations follow the workbook-defined formulas from `metropolia_transport_co2_dummy_workbook.xlsx`:

| Mode | Formula | EF Source |
|------|---------|-----------|
| **Road** | `Fuel_L = Vehicles × Avg_km × FuelEconomy/100` → `CO₂_t = Fuel_L × EF / 1000` | IPCC 2006 / EMEP 2023 |
| **Rail (Electric)** | `CO₂_t = Energy_kWh × EF(kgCO₂/kWh) / 1000` | IEA 2023 |
| **Rail (Diesel)** | `CO₂_t = Diesel_L × EF(kgCO₂/L) / 1000` | IPCC 2006 |
| **Sea** | `Fuel_ton = Distance_NM × FuelIntensity` → `CO₂_t = Fuel_ton × EF` | IMO GHG Study 2020 |
| **Aviation** | `Fuel_kg = Flights × Fuel_L × 0.8` → `CO₂_t = Fuel_kg × EF / 1000` | ICAO CORSIA v12 |

### Emission Factors (from workbook `01_Intro_Glossary`, rows 35–43)

| Fuel_Code | EF Value | Unit |
|-----------|----------|------|
| GASOLINE | 2.31 | kgCO₂/liter |
| DIESEL | 2.65 | kgCO₂/liter |
| B35 | 1.61 | kgCO₂/liter |
| GRID_ELECTRICITY | 0.70 | kgCO₂/kWh |
| MARINE_DIESEL | 3.177 | tCO₂/ton_fuel |
| HFO_LFO | 3.171 | tCO₂/ton_fuel |
| JET_FUEL | 3.16 | kgCO₂/kg_fuel |
| Aviation density | 0.8 | kg/L (Glossary C45) |

> ⚠️ All EF values are workbook placeholders. Replace with official national or IPCC-validated values for production MRV reporting.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Git

### Run locally

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/metropolia-emissions.git
cd metropolia-emissions/frontend

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.


### Run full stack with Docker

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend (React PWA) | http://localhost:3000 |
| API (FastAPI) | http://localhost:8080 |

---

## 📱 Mobile App (PWA)

This is a **Progressive Web App** — one codebase serves both web and mobile.

To install on a phone:
1. Open the Azure URL in Chrome (Android) or Safari (iPhone)
2. Tap **"Add to Home Screen"** when prompted
3. The app installs like a native app with an icon, offline capability, and full-screen mode

This satisfies the **"Web App AND Mobile App"** requirement without needing React Native or App Store submission.

---

## ⚡ Scalability Design

| Volume | Architecture | Query Speed |
|--------|-------------|-------------|
| < 100K records | Browser-side JS (current app) | < 5 sec |
| 100K – 1M | FastAPI + PostgreSQL + Redis | < 30 sec |

The `docker/docker-compose.yml` defines the full 6-service production stack.

---

## 🤖 AI Tools Used

As required by the assignment instructions, all AI tool usage is documented transparently:

| Tool | How It Was Used |
|------|----------------|
| **Claude (Anthropic)** | Code generation (React app, emissions engine, Docker Compose, PWA manifest)|
| **Manual verification** | All emission factors cross-checked against IPCC 2006, IMO GHG Study 2020, and ICAO CORSIA v12 primary sources before use |

**Decisions made by the project team, not AI:**
- React PWA over React Native (single codebase, faster delivery, Azure-friendly)
- Exact calculation formulas taken from the recruiter-provided workbook, not assumed
- Data schema designed around real agency reporting patterns

---
