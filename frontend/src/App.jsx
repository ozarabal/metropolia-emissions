import { useState, useEffect } from "react";
import TabUpload from "./TabUpload.jsx";
import TabRecords from "./TabRecords.jsx";
import { calculateSingle, getSummary, getFactors } from "./api.js";

// ═══════════════════════════════════════════════════════════════
// METROPOLIA TRANSPORT CO2 CALCULATOR
// Data source: metropolia_transport_co2_dummy_workbook.xlsx
// Formulas replicate exactly the workbook's calculation logic:
//   Road:     Fuel_L = Vehicles × Avg_km × FuelEconomy/100  →  CO2_t = Fuel_L × EF / 1000
//   Rail Elec: CO2_t = Energy_kWh × EF(kgCO2/kWh) / 1000
//   Rail Dies: CO2_t = Diesel_L × EF(kgCO2/L) / 1000
//   Sea:       Fuel_ton = Distance_NM × FuelIntensity  →  CO2_t = Fuel_ton × EF
//   Aviation:  Fuel_kg = Flights × Fuel_L × Density  →  CO2_t = Fuel_kg × EF / 1000
// ═══════════════════════════════════════════════════════════════

// ── EMISSION FACTORS (from 01_Intro_Glossary, rows 35-43) ────
const EF = {
  GASOLINE:         { value: 2.31,  unit: "kgCO2/liter",    label: "Gasoline (road)" },
  DIESEL:           { value: 2.65,  unit: "kgCO2/liter",    label: "Diesel (road/rail)" },
  B35:              { value: 1.61,  unit: "kgCO2/liter",    label: "Biodiesel blend B35" },
  GRID_ELECTRICITY: { value: 0.70,  unit: "kgCO2/kWh",      label: "Grid electricity (Metropolia)" },
  MARINE_DIESEL:    { value: 3.177, unit: "tCO2/ton_fuel",  label: "Marine diesel" },
  HFO_LFO:          { value: 3.171, unit: "tCO2/ton_fuel",  label: "Heavy/Light fuel oil" },
  LNG_LPG:          { value: 3.017, unit: "tCO2/ton_fuel",  label: "LNG/LPG" },
  JET_FUEL:         { value: 3.16,  unit: "kgCO2/kg_fuel",  label: "Jet fuel" },
};
const AVIATION_DENSITY = 0.8; // kg/L — from Glossary cell C45

// ── WORKBOOK BASELINE DATA (computed from exact workbook formulas) ─
const BASELINE = {
  road:     176_364_300.00,
  rail:         614_862.94,
  sea:        3_546_206.80,
  aviation:   6_216_478.40,
  total:    186_741_848.14,
};

// ── ROAD VEHICLE TYPES (02_Road sheet) ───────────────────────
const ROAD_VEHICLES = [
  { type: "Passenger Cars",  defaultVehicles: 20_000_000,  defaultKm: 12000, defaultFE: 8.5,  fuel: "GASOLINE", notes: "Private cars" },
  { type: "Motorcycles",     defaultVehicles: 100_000_000, defaultKm: 8000,  defaultFE: 2.4,  fuel: "GASOLINE", notes: "Two-wheelers" },
  { type: "Light Trucks",    defaultVehicles: 4_200_000,   defaultKm: 25000, defaultFE: 14.0, fuel: "DIESEL",   notes: "Urban delivery & LCV" },
  { type: "Heavy Trucks",    defaultVehicles: 1_600_000,   defaultKm: 60000, defaultFE: 28.0, fuel: "B35",      notes: "Long-haul freight" },
  { type: "Buses",           defaultVehicles: 100_000,     defaultKm: 55000, defaultFE: 30.0, fuel: "B35",      notes: "Urban/intercity buses" },
];

// ── RAIL SERVICES (03_Rail sheet) ─────────────────────────────
const RAIL_SERVICES = [
  { name: "Commuter Train",       traction: "Electric", tripsDay: 1100, avgTripKm: 25,  intensity: 8.0,  fuel: "GRID_ELECTRICITY" },
  { name: "MRT",                  traction: "Electric", tripsDay: 900,  avgTripKm: 18,  intensity: 10.5, fuel: "GRID_ELECTRICITY" },
  { name: "LRT",                  traction: "Electric", tripsDay: 650,  avgTripKm: 14,  intensity: 7.5,  fuel: "GRID_ELECTRICITY" },
  { name: "High Speed Railway",   traction: "Electric", tripsDay: 120,  avgTripKm: 280, intensity: 20.0, fuel: "GRID_ELECTRICITY" },
  { name: "Long Distance Train",  traction: "Electric", tripsDay: 80,   avgTripKm: 450, intensity: 6.5,  fuel: "GRID_ELECTRICITY" },
  { name: "Local Diesel Train",   traction: "Diesel",   tripsDay: 140,  avgTripKm: 55,  intensity: 2.2,  fuel: "DIESEL" },
  { name: "Rail Freight (Elec)",  traction: "Electric", tripsDay: 60,   avgTripKm: 520, intensity: 18.0, fuel: "GRID_ELECTRICITY" },
  { name: "Rail Freight (Diesel)",traction: "Diesel",   tripsDay: 55,   avgTripKm: 500, intensity: 4.0,  fuel: "DIESEL" },
];

// ── SEA VESSELS (04_Sea sheet) ────────────────────────────────
const SEA_VESSELS = [
  { name: "Passenger Ferry",  scope: "Domestic",      tripsYr: 48000, distNM: 35,   fuelInt: 0.015, fuel: "MARINE_DIESEL" },
  { name: "Tugboat/Port Svc", scope: "Domestic",      tripsYr: 65000, distNM: 12,   fuelInt: 0.010, fuel: "MARINE_DIESEL" },
  { name: "General Cargo",    scope: "Domestic",      tripsYr: 18500, distNM: 220,  fuelInt: 0.028, fuel: "HFO_LFO" },
  { name: "Container Ship",   scope: "Domestic",      tripsYr: 8200,  distNM: 260,  fuelInt: 0.030, fuel: "HFO_LFO" },
  { name: "Tanker",           scope: "Domestic",      tripsYr: 7400,  distNM: 240,  fuelInt: 0.032, fuel: "HFO_LFO" },
  { name: "Bulk Carrier",     scope: "International", tripsYr: 6800,  distNM: 1100, fuelInt: 0.040, fuel: "HFO_LFO" },
  { name: "Container Ship",   scope: "International", tripsYr: 9600,  distNM: 950,  fuelInt: 0.038, fuel: "HFO_LFO" },
  { name: "Tanker",           scope: "International", tripsYr: 3900,  distNM: 1250, fuelInt: 0.042, fuel: "HFO_LFO" },
];

// ── AIRCRAFT (05_Aviation sheet) ─────────────────────────────
const AIRCRAFT = [
  { name: "Narrow-body",         scope: "Domestic",      nAircraft: 120, flightsYr: 1800, avgFuelL: 4200 },
  { name: "Wide-body",           scope: "Domestic",      nAircraft: 30,  flightsYr: 900,  avgFuelL: 7800 },
  { name: "Narrow-body",         scope: "International", nAircraft: 80,  flightsYr: 1500, avgFuelL: 5200 },
  { name: "Wide-body",           scope: "International", nAircraft: 55,  flightsYr: 1100, avgFuelL: 9200 },
  { name: "Wide-body Freighter", scope: "International", nAircraft: 18,  flightsYr: 850,  avgFuelL: 10500 },
];

// ── CALCULATION FUNCTIONS (exact workbook formulas) ───────────
function calcRoad(vehicles, avgKm, fuelEconomy, fuelCode) {
  const fuelL = vehicles * avgKm * fuelEconomy / 100;
  const co2t  = fuelL * EF[fuelCode].value / 1000;
  return { fuelL, co2t };
}
function calcRailElec(tripsDay, avgTripKm, intensityKwhPerKm) {
  const totalDistYr = tripsDay * 365 * avgTripKm;
  const energyKwh   = intensityKwhPerKm * totalDistYr;
  const co2t        = energyKwh * EF.GRID_ELECTRICITY.value / 1000;
  return { totalDistYr, energyKwh, co2t };
}
function calcRailDiesel(tripsDay, avgTripKm, intensityLPerKm) {
  const totalDistYr = tripsDay * 365 * avgTripKm;
  const dieselL     = intensityLPerKm * totalDistYr;
  const co2t        = dieselL * EF.DIESEL.value / 1000;
  return { totalDistYr, dieselL, co2t };
}
function calcSea(tripsYr, distNM, fuelIntensity, fuelCode) {
  const totalNM  = tripsYr * distNM;
  const fuelTon  = totalNM * fuelIntensity;
  const co2t     = fuelTon * EF[fuelCode].value;
  return { totalNM, fuelTon, co2t };
}
function calcAviation(nAircraft, flightsPerAircraftYr, avgFuelL) {
  const totalFlights = nAircraft * flightsPerAircraftYr;
  const fuelKg       = totalFlights * avgFuelL * AVIATION_DENSITY;
  const co2t         = fuelKg * EF.JET_FUEL.value / 1000;
  return { totalFlights, fuelKg, co2t };
}

// ── STYLE HELPERS ─────────────────────────────────────────────
const COLORS = { road: "#E8401C", rail: "#0F7B6C", sea: "#1A4FA0", aviation: "#7B2FBE" };
const fmt    = n => n >= 1e6 ? `${(n/1e6).toFixed(3)} Mt` : n >= 1000 ? `${(n/1000).toFixed(1)} kt` : `${n.toFixed(1)} t`;
const fmtN   = n => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
const tdStyle = { padding:"7px 10px", borderBottom:"1px solid #F3F4F6" };

const FuelBadge = ({ code }) => {
  const map = { GASOLINE:["#FEF3C7","#92400E"], DIESEL:["#FEF9C3","#78350F"], B35:["#D1FAE5","#065F46"], GRID_ELECTRICITY:["#DBEAFE","#1E40AF"], MARINE_DIESEL:["#E0F2FE","#075985"], HFO_LFO:["#EDE9FE","#4C1D95"], LNG_LPG:["#FCE7F3","#831843"], JET_FUEL:["#F5F3FF","#3B0764"] };
  const [bg, color] = map[code] || ["#F3F4F6","#374151"];
  return <span style={{ background:bg, color, padding:"2px 7px", borderRadius:5, fontSize:10, fontWeight:700, fontFamily:"monospace" }}>{code}</span>;
};
const ScopeBadge = ({ scope }) => (
  <span style={{ background:scope==="Domestic"?"#DCFCE7":"#FEF9C3", color:scope==="Domestic"?"#166534":"#713F12", padding:"2px 7px", borderRadius:5, fontSize:10, fontWeight:600 }}>{scope}</span>
);
const FormulaBox = ({ text }) => (
  <div style={{ marginTop:10, padding:"8px 12px", background:"#F8FAFC", borderRadius:8, fontSize:11, fontFamily:"monospace", color:"#475569" }}>📐 {text}</div>
);
const Section = ({ title, color, children }) => (
  <div style={{ background:"#fff", borderRadius:14, padding:20, boxShadow:"0 2px 10px rgba(0,0,0,0.06)", marginBottom:14, borderLeft:`4px solid ${color}` }}>
    <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700, color:"#1E293B" }}>{title}</h3>
    <div style={{ overflowX:"auto" }}>{children}</div>
  </div>
);
const Th = ({ children }) => <th style={{ padding:"8px 10px", textAlign:"left", fontWeight:600, borderBottom:"1px solid rgba(255,255,255,0.2)", fontSize:11, whiteSpace:"nowrap" }}>{children}</th>;
const Td = ({ children, bold, color }) => <td style={{ ...tdStyle, fontWeight:bold?700:400, color:color||"#374151", whiteSpace:"nowrap" }}>{children}</td>;

// ═══════════════════════════════════════════════════════════════
// TAB: BASELINE RESULTS
// ═══════════════════════════════════════════════════════════════
function TabBaseline() {
  const [liveSummary, setLiveSummary]   = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    getSummary()
      .then(setLiveSummary)
      .catch(() => setLiveSummary([]))
      .finally(() => setSummaryLoading(false));
  }, []);

  const modes = [
    { key:"road",     label:"Road",     icon:"🚗", co2: BASELINE.road },
    { key:"rail",     label:"Rail",     icon:"🚆", co2: BASELINE.rail },
    { key:"sea",      label:"Sea",      icon:"🚢", co2: BASELINE.sea },
    { key:"aviation", label:"Aviation", icon:"✈️", co2: BASELINE.aviation },
  ];
  const liveTotal = liveSummary && liveSummary.length > 0
    ? liveSummary.reduce((sum, r) => sum + (r.total_t_co2e || 0), 0)
    : null;

  return (
    <div>
      {/* LIVE DATABASE SUMMARY */}
      <div style={{ borderRadius:14, overflow:"hidden", boxShadow:"0 4px 20px rgba(16,185,129,0.18)", border:"1.5px solid #6EE7B7", marginBottom:16 }}>
        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#064E3B,#065F46,#047857)", padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>🗄️</span>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:"#fff", letterSpacing:"-0.01em" }}>Live Database Summary</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.55)", marginTop:1 }}>Totals from saved calculations · Redis-cached · 1 min TTL</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.12)", borderRadius:20, padding:"4px 12px" }}>
            <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background: summaryLoading ? "#FCD34D" : (liveSummary && liveSummary.length > 0 ? "#4ADE80" : "#94A3B8"), boxShadow: (!summaryLoading && liveSummary && liveSummary.length > 0) ? "0 0 6px #4ADE80" : "none" }} />
            <span style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.8)" }}>
              {summaryLoading ? "Connecting…" : (liveSummary && liveSummary.length > 0 ? "Live" : "No data")}
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{ background:"#fff", padding:20 }}>
          {summaryLoading ? (
            <div style={{ fontSize:13, color:"#6B7280", padding:"12px 0" }}>Loading live data…</div>
          ) : liveSummary && liveSummary.length > 0 ? (<>
            {/* Metric cards — one per mode + a TOTAL card */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:16 }}>
              {liveSummary.map(row => (
                <div key={row.mode} style={{ background:"#F0FDF4", borderRadius:10, padding:"12px 14px", borderTop:`3px solid ${COLORS[row.mode]||"#10B981"}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:COLORS[row.mode]||"#064E3B", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>
                    {{ road:"🚗", rail:"🚆", sea:"🚢", air:"✈️" }[row.mode] || "•"} {row.mode}
                  </div>
                  <div style={{ fontSize:20, fontWeight:800, color:"#1E293B", lineHeight:1.1 }}>{(row.total_t_co2e / 1000).toFixed(2)} <span style={{ fontSize:11, fontWeight:400, color:"#6B7280" }}>kt</span></div>
                  <div style={{ fontSize:10, color:"#6B7280", marginTop:3 }}>{row.record_count} record{row.record_count !== 1 ? "s" : ""}</div>
                </div>
              ))}
              {/* TOTAL card */}
              <div style={{ background:"linear-gradient(135deg,#064E3B,#065F46)", borderRadius:10, padding:"12px 14px", borderTop:"3px solid #10B981" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#A7F3D0", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:4 }}>∑ All Modes</div>
                <div style={{ fontSize:20, fontWeight:800, color:"#fff", lineHeight:1.1 }}>{(liveTotal / 1000).toFixed(2)} <span style={{ fontSize:11, fontWeight:400, opacity:0.7 }}>kt</span></div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.55)", marginTop:3 }}>total CO₂</div>
              </div>
            </div>
            {/* Detail table */}
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#ECFDF5" }}>
                  {["Mode","Records","Total CO₂ (kg)","Total CO₂ (t)","Total CO₂ (kt)","Avg EF"].map(h=>(
                    <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontWeight:700, fontSize:11, color:"#065F46", borderBottom:"2px solid #6EE7B7" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liveSummary.map((row, i) => (
                  <tr key={row.mode} style={{ background:i%2===0?"#fff":"#F0FDF4" }}>
                    <td style={{ padding:"8px 10px" }}>
                      <span style={{ background:(COLORS[row.mode]||"#64748B")+"22", color:COLORS[row.mode]||"#64748B", padding:"3px 10px", borderRadius:6, fontWeight:700, fontSize:11 }}>
                        {row.mode}
                      </span>
                    </td>
                    <td style={{ padding:"8px 10px", fontFamily:"monospace", fontWeight:600 }}>{row.record_count}</td>
                    <td style={{ padding:"8px 10px", fontFamily:"monospace", fontWeight:700, color:COLORS[row.mode]||"#374151" }}>
                      {row.total_kg_co2e?.toLocaleString(undefined,{maximumFractionDigits:2})}
                    </td>
                    <td style={{ padding:"8px 10px", fontFamily:"monospace", color:"#1E293B" }}>{row.total_t_co2e?.toFixed(2)}</td>
                    <td style={{ padding:"8px 10px", fontFamily:"monospace", fontWeight:700, color:COLORS[row.mode]||"#374151" }}>{(row.total_t_co2e / 1000).toFixed(4)}</td>
                    <td style={{ padding:"8px 10px", fontFamily:"monospace", color:"#6B7280" }}>{row.avg_factor?.toFixed(4)}</td>
                  </tr>
                ))}
                {/* Total row */}
                <tr style={{ background:"#ECFDF5", fontWeight:700 }}>
                  <td style={{ padding:"8px 10px" }}><strong>TOTAL</strong></td>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace" }}>{liveSummary.reduce((s,r)=>s+(r.record_count||0),0)}</td>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace", color:"#065F46" }}>{(liveTotal * 1000).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace", color:"#065F46" }}>{liveTotal.toFixed(2)}</td>
                  <td style={{ padding:"8px 10px", fontFamily:"monospace", fontWeight:800, color:"#065F46" }}>{(liveTotal / 1000).toFixed(4)}</td>
                  <td style={{ padding:"8px 10px" }}>—</td>
                </tr>
              </tbody>
            </table>
          </>) : (
            <div style={{ textAlign:"center", padding:"24px 0", color:"#6B7280" }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📭</div>
              <div style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:4 }}>No records in the database yet</div>
              <div style={{ fontSize:12 }}>Use the <strong>Calculator</strong> or <strong>Upload</strong> tab to save records.</div>
            </div>
          )}
        </div>
      </div>

      {/* GRAND TOTAL */}
      <div style={{ background:"linear-gradient(135deg,#0F172A,#1A3C6B)", borderRadius:14, padding:"20px 24px", color:"#fff", marginBottom:16 }}>
        <div style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.45)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Metropolia National Transport — Annual CO₂ Baseline</div>
        <div style={{ fontSize:42, fontWeight:800, marginTop:4 }}>{(BASELINE.total/1e6).toFixed(4)} <span style={{ fontSize:20, fontWeight:400, opacity:0.6 }}>Mt CO₂</span></div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:4 }}>Source: metropolia_transport_co2_dummy_workbook.xlsx · Computed using workbook formulas exactly</div>
      </div>

      {/* MODE SUMMARY CARDS */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))", gap:12, marginBottom:16 }}>
        {modes.map(m => {
          const pct = m.co2/BASELINE.total*100;
          return (
            <div key={m.key} style={{ background:"#fff", borderRadius:12, padding:"16px 18px", borderLeft:`4px solid ${COLORS[m.key]}`, boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{m.icon}</div>
              <div style={{ fontSize:11, fontWeight:700, color:COLORS[m.key], textTransform:"uppercase", letterSpacing:"0.06em" }}>{m.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:"#1E293B", marginTop:2 }}>{fmt(m.co2)}</div>
              <div style={{ marginTop:8, height:5, background:"#F1F5F9", borderRadius:999 }}>
                <div style={{ height:"100%", width:`${Math.max(pct,0.5)}%`, background:COLORS[m.key], borderRadius:999 }} />
              </div>
              <div style={{ fontSize:11, color:"#6B7280", marginTop:4 }}>{pct.toFixed(2)}% of total</div>
            </div>
          );
        })}
      </div>

      {/* ROAD */}
      <Section title="🚗 Road Transport (02_Road)" color={COLORS.road}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"#FEF2F0" }}>
            {["Vehicle Type","# Vehicles","Avg km/veh/yr","FuelEconomy (L/100km)","Fuel_Code","Fuel Use (L)","CO₂ (t)"].map(h=><Th key={h}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {ROAD_VEHICLES.map((v,i) => {
              const { fuelL, co2t } = calcRoad(v.defaultVehicles, v.defaultKm, v.defaultFE, v.fuel);
              return (
                <tr key={i} style={{ background:i%2===0?"#fff":"#FFF8F7" }}>
                  <Td>{v.type}</Td><Td>{fmtN(v.defaultVehicles)}</Td><Td>{fmtN(v.defaultKm)}</Td>
                  <Td>{v.defaultFE}</Td><Td><FuelBadge code={v.fuel}/></Td>
                  <Td>{fmtN(fuelL)}</Td><Td bold color={COLORS.road}>{fmtN(co2t)}</Td>
                </tr>
              );
            })}
            <tr style={{ background:"#FEF2F0", fontWeight:700 }}>
              <td style={tdStyle} colSpan={6}><strong>TOTAL</strong></td>
              <td style={{ ...tdStyle, color:COLORS.road, fontWeight:800 }}>{fmtN(BASELINE.road)}</td>
            </tr>
          </tbody>
        </table>
        <FormulaBox text="Fuel_L = Vehicles × Avg_km × FuelEconomy(L/100km) / 100  →  CO₂_t = Fuel_L × EF(kgCO₂/L) / 1000" />
      </Section>

      {/* RAIL */}
      <Section title="🚆 Rail Transport (03_Rail)" color={COLORS.rail}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"#ECFDF5" }}>
            {["Service","Traction","Trips/day","Avg Trip km","Total km/yr","Energy/Fuel Amount","Fuel Code","CO₂ (t)"].map(h=><Th key={h}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {RAIL_SERVICES.map((r,i) => {
              const res = r.traction==="Electric"
                ? calcRailElec(r.tripsDay, r.avgTripKm, r.intensity)
                : calcRailDiesel(r.tripsDay, r.avgTripKm, r.intensity);
              const energyLabel = r.traction==="Electric"
                ? `${fmtN(res.energyKwh)} kWh` : `${fmtN(res.dieselL)} L`;
              return (
                <tr key={i} style={{ background:i%2===0?"#fff":"#F0FDF9" }}>
                  <Td>{r.name}</Td>
                  <Td><span style={{ background:r.traction==="Electric"?"#DBEAFE":"#FEF3C7", color:r.traction==="Electric"?"#1E40AF":"#92400E", padding:"2px 7px", borderRadius:5, fontSize:10, fontWeight:600 }}>{r.traction}</span></Td>
                  <Td>{fmtN(r.tripsDay)}</Td><Td>{fmtN(r.avgTripKm)}</Td>
                  <Td>{fmtN(res.totalDistYr)}</Td><Td>{energyLabel}</Td>
                  <Td><FuelBadge code={r.fuel}/></Td>
                  <Td bold color={COLORS.rail}>{fmtN(res.co2t)}</Td>
                </tr>
              );
            })}
            <tr style={{ background:"#ECFDF5", fontWeight:700 }}>
              <td style={tdStyle} colSpan={7}><strong>TOTAL</strong></td>
              <td style={{ ...tdStyle, color:COLORS.rail, fontWeight:800 }}>{fmtN(BASELINE.rail)}</td>
            </tr>
          </tbody>
        </table>
        <FormulaBox text="Electric: CO₂_t = (Intensity_kWh/km × Total_km/yr) × EF(kgCO₂/kWh) / 1000  |  Diesel: CO₂_t = (Intensity_L/km × Total_km/yr) × EF(kgCO₂/L) / 1000" />
      </Section>

      {/* SEA */}
      <Section title="🚢 Sea Transport (04_Sea)" color={COLORS.sea}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"#EFF6FF" }}>
            {["Ship Type","Scope","Trips/yr","Dist/trip (NM)","Total NM","Fuel Int (t/NM)","Fuel (ton)","Fuel Code","CO₂ (t)"].map(h=><Th key={h}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {SEA_VESSELS.map((v,i) => {
              const { totalNM, fuelTon, co2t } = calcSea(v.tripsYr, v.distNM, v.fuelInt, v.fuel);
              return (
                <tr key={i} style={{ background:i%2===0?"#fff":"#F0F7FF" }}>
                  <Td>{v.name}</Td><Td><ScopeBadge scope={v.scope}/></Td>
                  <Td>{fmtN(v.tripsYr)}</Td><Td>{fmtN(v.distNM)}</Td>
                  <Td>{fmtN(totalNM)}</Td><Td>{v.fuelInt}</Td>
                  <Td>{fmtN(fuelTon)}</Td><Td><FuelBadge code={v.fuel}/></Td>
                  <Td bold color={COLORS.sea}>{fmtN(co2t)}</Td>
                </tr>
              );
            })}
            <tr style={{ background:"#EFF6FF", fontWeight:700 }}>
              <td style={tdStyle} colSpan={8}><strong>TOTAL</strong></td>
              <td style={{ ...tdStyle, color:COLORS.sea, fontWeight:800 }}>{fmtN(BASELINE.sea)}</td>
            </tr>
          </tbody>
        </table>
        <FormulaBox text="Fuel_ton = Distance_NM × FuelIntensity(t/NM)  →  CO₂_t = Fuel_ton × EF(tCO₂/ton_fuel)" />
      </Section>

      {/* AVIATION */}
      <Section title="✈️ Aviation (05_Aviation)" color={COLORS.aviation}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"#F5F3FF" }}>
            {["Aircraft Class","Scope","# Aircraft","Flights/aircraft/yr","Total Flights","Avg Fuel/flt (L)","Fuel (kg)","CO₂ (t)"].map(h=><Th key={h}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {AIRCRAFT.map((a,i) => {
              const { totalFlights, fuelKg, co2t } = calcAviation(a.nAircraft, a.flightsYr, a.avgFuelL);
              return (
                <tr key={i} style={{ background:i%2===0?"#fff":"#FAF8FF" }}>
                  <Td>{a.name}</Td><Td><ScopeBadge scope={a.scope}/></Td>
                  <Td>{a.nAircraft}</Td><Td>{fmtN(a.flightsYr)}</Td>
                  <Td>{fmtN(totalFlights)}</Td><Td>{fmtN(a.avgFuelL)}</Td>
                  <Td>{fmtN(fuelKg)}</Td>
                  <Td bold color={COLORS.aviation}>{fmtN(co2t)}</Td>
                </tr>
              );
            })}
            <tr style={{ background:"#F5F3FF", fontWeight:700 }}>
              <td style={tdStyle} colSpan={7}><strong>TOTAL</strong></td>
              <td style={{ ...tdStyle, color:COLORS.aviation, fontWeight:800 }}>{fmtN(BASELINE.aviation)}</td>
            </tr>
          </tbody>
        </table>
        <FormulaBox text="Fuel_kg = (# Aircraft × Flights/yr) × AvgFuel_L × 0.8 kg/L  →  CO₂_t = Fuel_kg × 3.16 kgCO₂/kg_fuel / 1000" />
      </Section>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: INTERACTIVE CALCULATOR
// ═══════════════════════════════════════════════════════════════
function TabCalculator() {
  const [mode, setMode] = useState("road");
  const [v, setV] = useState({
    vehicles:1000, avgKm:12000, fuelEconomy:8.5, fuelCode:"GASOLINE",
    traction:"Electric", tripsDay:100, avgTripKm:25, intensity:8,
    tripsYr:1000, distNM:100, fuelInt:0.02, seaFuel:"HFO_LFO",
    nAircraft:10, flightsYr:1000, avgFuelL:5000,
  });
  const [saveState, setSaveState] = useState({ status:"idle", id:null, error:null });
  const set = (k,val) => setV(p=>({...p,[k]:isNaN(parseFloat(val))?val:parseFloat(val)}));

  async function handleSave() {
    setSaveState({ status:"saving", id:null, error:null });
    try {
      let payload;
      if (mode === "road") {
        payload = { mode:"road", distance_km: v.avgKm * (v.fuelEconomy / 8.5), quantity: v.vehicles, fuel_code: v.fuelCode };
      } else if (mode === "rail") {
        payload = { mode:"rail", distance_km: v.avgTripKm, quantity: v.tripsDay * 365, fuel_code: v.traction === "Electric" ? "GRID_ELECTRICITY" : "DIESEL" };
      } else if (mode === "sea") {
        payload = { mode:"sea", distance_km: v.distNM * 1.852, quantity: v.tripsYr, fuel_code: v.seaFuel };
      } else {
        payload = { mode:"air", distance_km: v.avgFuelL / 4.5, quantity: v.nAircraft * v.flightsYr, fuel_code:"JET_FUEL" };
      }
      const result = await calculateSingle(payload);
      setSaveState({ status:"ok", id:result.id, error:null });
    } catch (e) {
      setSaveState({ status:"err", id:null, error: e.message || "Backend offline" });
    }
  }

  let co2t=0, detail="", formula="";
  if (mode==="road") {
    const r = calcRoad(v.vehicles, v.avgKm, v.fuelEconomy, v.fuelCode);
    co2t=r.co2t; detail=`Fuel use: ${fmtN(r.fuelL)} L/yr`;
    formula=`${fmtN(v.vehicles)} × ${fmtN(v.avgKm)} km × ${v.fuelEconomy} ÷ 100 = ${fmtN(r.fuelL)} L  ×  ${EF[v.fuelCode].value} kgCO₂/L ÷ 1000`;
  } else if (mode==="rail") {
    const r = v.traction==="Electric"
      ? calcRailElec(v.tripsDay, v.avgTripKm, v.intensity)
      : calcRailDiesel(v.tripsDay, v.avgTripKm, v.intensity);
    co2t=r.co2t; detail=`Total distance: ${fmtN(r.totalDistYr)} km/yr`;
    const ef = v.traction==="Electric" ? EF.GRID_ELECTRICITY : EF.DIESEL;
    const energy = v.traction==="Electric" ? `${fmtN(r.energyKwh)} kWh` : `${fmtN(r.dieselL)} L`;
    formula=`${v.tripsDay} trips/day × 365 × ${v.avgTripKm} km = ${fmtN(r.totalDistYr)} km  ×  ${v.intensity} = ${energy}  ×  ${ef.value} ${ef.unit} ÷ 1000`;
  } else if (mode==="sea") {
    const r = calcSea(v.tripsYr, v.distNM, v.fuelInt, v.seaFuel);
    co2t=r.co2t; detail=`${fmtN(r.totalNM)} NM, ${fmtN(r.fuelTon)} ton fuel/yr`;
    formula=`${fmtN(v.tripsYr)} trips × ${v.distNM} NM = ${fmtN(r.totalNM)} NM  ×  ${v.fuelInt} t/NM = ${fmtN(r.fuelTon)} ton  ×  ${EF[v.seaFuel].value} tCO₂/ton_fuel`;
  } else {
    const r = calcAviation(v.nAircraft, v.flightsYr, v.avgFuelL);
    co2t=r.co2t; detail=`${fmtN(r.totalFlights)} flights, ${fmtN(r.fuelKg)} kg fuel/yr`;
    formula=`${v.nAircraft} × ${fmtN(v.flightsYr)} = ${fmtN(r.totalFlights)} flights × ${v.avgFuelL} L × 0.8 kg/L = ${fmtN(r.fuelKg)} kg × ${EF.JET_FUEL.value} ÷ 1000`;
  }

  const inpStyle = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:13, fontFamily:"inherit", color:"#1E293B", boxSizing:"border-box" };
  const lbl = t => <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#374151", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em" }}>{t}</label>;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"minmax(280px,1fr) minmax(280px,1fr)", gap:16 }}>
      <div style={{ background:"#fff", borderRadius:14, padding:20, boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
          {[["road","🚗","Road"],["rail","🚆","Rail"],["sea","🚢","Sea"],["aviation","✈️","Air"]].map(([m,icon,label])=>(
            <button key={m} onClick={()=>setMode(m)} style={{ flex:"1 1 70px", padding:"8px 6px", borderRadius:8, border:`2px solid ${mode===m?COLORS[m]:"#E5E7EB"}`, background:mode===m?COLORS[m]:"#fff", color:mode===m?"#fff":"#374151", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {mode==="road" && <>
          <div style={{ marginBottom:12 }}>{lbl("Number of Vehicles")}<input type="number" value={v.vehicles} onChange={e=>set("vehicles",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Avg km / vehicle / year")}<input type="number" value={v.avgKm} onChange={e=>set("avgKm",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Fuel Economy (L/100km)")}<input type="number" value={v.fuelEconomy} onChange={e=>set("fuelEconomy",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Fuel Code")}
            <select value={v.fuelCode} onChange={e=>set("fuelCode",e.target.value)} style={inpStyle}>
              <option value="GASOLINE">GASOLINE — 2.31 kgCO₂/L</option>
              <option value="DIESEL">DIESEL — 2.65 kgCO₂/L</option>
              <option value="B35">B35 — 1.61 kgCO₂/L (Biodiesel)</option>
            </select>
          </div>
        </>}
        {mode==="rail" && <>
          <div style={{ marginBottom:12 }}>{lbl("Traction Type")}
            <select value={v.traction} onChange={e=>set("traction",e.target.value)} style={inpStyle}>
              <option value="Electric">⚡ Electric (GRID_ELECTRICITY — 0.70 kgCO₂/kWh)</option>
              <option value="Diesel">🛢 Diesel (DIESEL — 2.65 kgCO₂/L)</option>
            </select>
          </div>
          <div style={{ marginBottom:12 }}>{lbl("Trips per day")}<input type="number" value={v.tripsDay} onChange={e=>set("tripsDay",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Avg trip distance (km)")}<input type="number" value={v.avgTripKm} onChange={e=>set("avgTripKm",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl(v.traction==="Electric"?"Energy intensity (kWh/km)":"Fuel intensity (L/km)")}
            <input type="number" value={v.intensity} onChange={e=>set("intensity",e.target.value)} style={inpStyle}/>
          </div>
        </>}
        {mode==="sea" && <>
          <div style={{ marginBottom:12 }}>{lbl("Trips per year")}<input type="number" value={v.tripsYr} onChange={e=>set("tripsYr",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Avg distance per trip (NM)")}<input type="number" value={v.distNM} onChange={e=>set("distNM",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Fuel intensity (t/NM)")}<input type="number" step="0.001" value={v.fuelInt} onChange={e=>set("fuelInt",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Fuel Code")}
            <select value={v.seaFuel} onChange={e=>set("seaFuel",e.target.value)} style={inpStyle}>
              <option value="MARINE_DIESEL">MARINE_DIESEL — 3.177 tCO₂/ton</option>
              <option value="HFO_LFO">HFO_LFO — 3.171 tCO₂/ton</option>
              <option value="LNG_LPG">LNG_LPG — 3.017 tCO₂/ton</option>
            </select>
          </div>
        </>}
        {mode==="aviation" && <>
          <div style={{ marginBottom:12 }}>{lbl("Number of aircraft")}<input type="number" value={v.nAircraft} onChange={e=>set("nAircraft",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Flights / aircraft / year")}<input type="number" value={v.flightsYr} onChange={e=>set("flightsYr",e.target.value)} style={inpStyle}/></div>
          <div style={{ marginBottom:12 }}>{lbl("Avg fuel per flight (L)")}<input type="number" value={v.avgFuelL} onChange={e=>set("avgFuelL",e.target.value)} style={inpStyle}/></div>
          <div style={{ padding:"8px 12px", background:"#F5F3FF", borderRadius:8, fontSize:11, color:"#5B21B6" }}>
            Fuel density: 0.8 kg/L (Glossary C45) · EF: 3.16 kgCO₂/kg (JET_FUEL)
          </div>
        </>}
      </div>

      <div>
        <div style={{ background:`linear-gradient(135deg,${COLORS[mode]},${COLORS[mode]}99)`, borderRadius:14, padding:20, color:"#fff", marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:600, opacity:0.6, textTransform:"uppercase", letterSpacing:"0.08em" }}>Annual CO₂</div>
          <div style={{ fontSize:48, fontWeight:800, lineHeight:1.1 }}>{fmt(co2t)}</div>
          <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>{detail}</div>
        </div>
        <div style={{ background:"#fff", borderRadius:14, padding:16, boxShadow:"0 2px 10px rgba(0,0,0,0.06)", marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", textTransform:"uppercase", marginBottom:8 }}>Step-by-step calculation</div>
          <div style={{ fontSize:11, fontFamily:"monospace", background:"#F8FAFC", padding:12, borderRadius:8, color:"#1E293B", lineHeight:1.8, wordBreak:"break-word" }}>
            {formula}<br/><strong style={{ color:COLORS[mode] }}>= {co2t.toFixed(2)} t CO₂</strong>
          </div>
          {/* Save to Database */}
          <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #F1F5F9" }}>
            <button
              onClick={handleSave}
              disabled={saveState.status==="saving"}
              style={{ padding:"9px 20px", borderRadius:8, border:"none", background:saveState.status==="saving"?"#CBD5E1":"#1A3C6B", color:"#fff", fontWeight:700, fontSize:12, cursor:saveState.status==="saving"?"not-allowed":"pointer", fontFamily:"inherit" }}
            >
              {saveState.status==="saving" ? "⏳ Saving…" : "💾 Save to Database"}
            </button>
            {saveState.status==="ok" && (
              <span style={{ marginLeft:12, fontSize:11, color:"#065F46", fontWeight:600 }}>
                ✅ Saved · ID: <code style={{ fontFamily:"monospace", background:"#D1FAE5", padding:"1px 5px", borderRadius:4 }}>{saveState.id}</code>
              </span>
            )}
            {saveState.status==="err" && (
              <span style={{ marginLeft:12, fontSize:11, color:"#991B1B" }}>❌ {saveState.error}</span>
            )}
            <div style={{ marginTop:6, fontSize:10, color:"#9CA3AF" }}>
              Saves this scenario to the database. Road fuel economy is normalised to the backend default (8.5 L/100km).
            </div>
          </div>
        </div>
        <div style={{ background:"#fff", borderRadius:14, padding:16, boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#6B7280", textTransform:"uppercase", marginBottom:8 }}>Workbook Baseline Comparison</div>
          {[["road","🚗","Road",BASELINE.road],["rail","🚆","Rail",BASELINE.rail],["sea","🚢","Sea",BASELINE.sea],["aviation","✈️","Aviation",BASELINE.aviation]].map(([m,icon,label,base])=>(
            <div key={m} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid #F1F5F9", fontSize:11 }}>
              <span>{icon} {label}</span>
              <span style={{ fontWeight:600, color:COLORS[m] }}>{fmt(base)}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", fontSize:12, fontWeight:700, color:"#1E293B", marginTop:2 }}>
            <span>TOTAL</span><span>{fmt(BASELINE.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB: EMISSION FACTORS
// ═══════════════════════════════════════════════════════════════
function TabFactors() {
  const FALLBACK_ROWS = [
    ["GASOLINE","Gasoline (road)","liter","2.31","kgCO₂/liter","Placeholder EF for gasoline road fuels"],
    ["DIESEL","Diesel (road/rail)","liter","2.65","kgCO₂/liter","Placeholder EF for diesel fuels"],
    ["B35","Biodiesel blend (B35)","liter","1.61","kgCO₂/liter","Placeholder EF for biodiesel blend"],
    ["GRID_ELECTRICITY","Grid electricity (Metropolia)","kWh","0.70","kgCO₂/kWh","⚠ Placeholder — replace with official Metropolia grid factor"],
    ["MARINE_DIESEL","Marine diesel","ton_fuel","3.177","tCO₂/ton_fuel","Placeholder marine diesel EF"],
    ["HFO_LFO","Heavy/Light fuel oil (HFO/LFO)","ton_fuel","3.171","tCO₂/ton_fuel","Placeholder HFO/LFO EF"],
    ["LNG_LPG","LNG/LPG","ton_fuel","3.017","tCO₂/ton_fuel","Placeholder LNG/LPG EF"],
    ["JET_FUEL","Jet fuel","kg_fuel","3.16","kgCO₂/kg_fuel","Per kg fuel · density: 0.8 kg/L (Glossary C45)"],
  ];
  const [rows, setRows]           = useState(FALLBACK_ROWS);
  const [factorsSource, setFactorsSource] = useState("local");

  useEffect(() => {
    getFactors()
      .then(data => {
        const apiRows = Object.entries(data.factors).map(([code, f]) => [
          code, f.label, f.unit.split("/")[1] || f.unit, String(f.value), f.unit, `From API · aviation density: ${data.aviation_density_kg_per_L} kg/L`,
        ]);
        setRows(apiRows);
        setFactorsSource("api");
      })
      .catch(() => setFactorsSource("local"));
  }, []);

  return (
    <div style={{ background:"#fff", borderRadius:14, padding:20, boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
      <h3 style={{ margin:"0 0 4px", fontSize:15, fontWeight:700, color:"#1E293B" }}>Fuel & Grid Emission Factor Reference</h3>
      <p style={{ margin:"0 0 16px", fontSize:12, color:"#6B7280" }}>From workbook sheet 01_Intro_Glossary, rows 35–43. All values labeled as "placeholders" — must be replaced with official national or IPCC-approved factors for production reporting.</p>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:"#0F172A", color:"#fff" }}>
              {["Fuel_Code","Fuel_Name","Activity_Unit","EF_Value","EF_Unit","Notes"].map(h=>(
                <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontWeight:600, fontSize:11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([code,...rest],i)=>(
              <tr key={code} style={{ background:i%2===0?"#fff":"#F8FAFC" }}>
                <td style={{ ...tdStyle, fontFamily:"monospace", fontWeight:700 }}><FuelBadge code={code}/></td>
                {rest.map((val,j)=>(
                  <td key={j} style={{ ...tdStyle, color: val.startsWith("⚠")?"#D97706":"#374151" }}>{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop:12, padding:"8px 14px", background: factorsSource==="api" ? "#F0FDF4" : "#F1F5F9", borderRadius:8, fontSize:11, color: factorsSource==="api" ? "#065F46" : "#475569", border:`1px solid ${factorsSource==="api"?"#BBF7D0":"#E2E8F0"}` }}>
        {factorsSource==="api" ? "✅ Loaded from API (backend)" : "ℹ️ Using local data — backend not connected"}
      </div>
      <div style={{ marginTop:8, padding:"10px 14px", background:"#FFFBEB", borderRadius:8, fontSize:11, color:"#92400E", border:"1px solid #FDE68A" }}>
        ⚠️ <strong>Production note:</strong> The workbook explicitly labels all EFs as "placeholders." Before using this platform for official Metropolia MRV reporting, replace GRID_ELECTRICITY (0.70) with the official national grid emission factor, and validate fuel EFs against the latest IPCC 2006 / EMEP national inventory guidelines.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("baseline");
  return (
    <div style={{ minHeight:"100vh", background:"#F1F5F9", fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <div style={{ background:"linear-gradient(135deg,#0F172A 0%,#1A3C6B 60%,#2E6DA4 100%)", padding:"18px 24px 0", color:"#fff" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ fontSize:22 }}>🌿</span>
            <div>
              <div style={{ fontSize:10, fontWeight:600, color:"rgba(255,255,255,0.45)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Republic of Metropolia · National Transport Authority</div>
              <div style={{ fontSize:18, fontWeight:800 }}>Transport CO₂ MRV Platform</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:0 }}>
            {[["baseline","📊 Baseline"],["calculator","🧮 Calculator"],["upload","📤 Upload"],["records","📁 Records"],["factors","📋 Factors"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{ padding:"10px 18px", border:"none", background:"transparent", color:tab===id?"#fff":"rgba(255,255,255,0.5)", fontWeight:tab===id?700:500, fontSize:13, cursor:"pointer", fontFamily:"inherit", borderBottom:tab===id?"2px solid #60A5FA":"2px solid transparent" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"20px 16px" }}>
        {tab==="baseline"   && <TabBaseline/>}
        {tab==="calculator" && <TabCalculator/>}
        {tab==="upload"     && <TabUpload/>}
        {tab==="records"    && <TabRecords/>}
        {tab==="factors"    && <TabFactors/>}
        <div style={{ textAlign:"center", padding:"14px 0 4px", fontSize:10, color:"#94A3B8" }}>
          Metropolia CO₂ MRV v1.0 · Source: metropolia_transport_co2_dummy_workbook.xlsx · EF reference: 01_Intro_Glossary rows 35–45
        </div>
      </div>
    </div>
  );
}