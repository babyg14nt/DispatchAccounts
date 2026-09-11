# IRONHAUL — Carrier Operations OS

A production-grade operations, accounting and finance dashboard for freight 
trucking carriers. Dispatch loads, chase BOLs, run the factoring pipeline,
generate itemized driver settlements, track maintenance and expenses, and watch
a live P&L — all from one dark "dispatch console" UI.

## Modules

| Module | What it does |
|---|---|
| **Dashboard** | Real-time KPIs — Gross Revenue, Operating Expenses, Net Profit, Outstanding AR — plus monthly revenue-vs-expense chart, revenue-per-truck, top brokers, expense mix donut, and a "Dispatch Radar" action feed (unsigned BOLs, aging receivables, down units). |
| **Loads & BOLs** | Full CRUD load register: broker/driver/truck assignment, route, miles, rate, dispatch & delivery dates. BOL number, document link and status (Pending → Delivered → Signed). Live driver-pay, factor-fee and net-payout preview inside the editor. |
| **Drivers** | CRUD roster with CDL data, contact info, pay structures (**% of gross**, **per-mile**, or **flat per load**), active/inactive status, open deductions and settled-to-date totals. |
| **Trucks & Equipment** | CRUD tractor/trailer register (unit #, make/model, year, VIN), open work orders and lifetime repair cost per unit, In-Shop status. |
| **Brokers & Shippers** | CRUD broker profiles (MC/DOT #s, contacts, Net-N payment terms) with per-broker loads, delivered revenue and open AR rollups. |
| **Factoring** | Five-stage pipeline board: Not Submitted → Submitted → Approved → Funded / Rejected. One-click advance/regress, automatic fee % and net-payout math, aging badges vs broker payment terms. |
| **Settlements** | Settlement engine: pick driver + period → collects delivered, unsettled loads, computes pay per load from the driver's pay structure, sweeps open deductions (fuel advances, cash advances, repairs, escrow), and emits an itemized statement — printable, CSV-exportable, mark-as-paid. |
| **Maintenance** | Work-order log (repair type, date, cost, shop, odometer) with In-Progress = unit down tracking. Per-unit repair history. |
| **Expenses** | Categorized ledger — Fuel, Insurance, IFTA, Permits, Office, Tolls — with optional per-truck attribution and a category breakdown donut. |

Every module supports **CSV export** (Excel-compatible) for external accounting
and tax prep.

## Tech stack

- **Next.js 16 (App Router)** + React 19 + TypeScript
- **PostgreSQL via Drizzle ORM** — relational schema with foreign keys linking
  loads → drivers / trucks / brokers, settlements → items → loads
- **Recharts** — interactive dashboard visualizations
- **Lucide** icon system, Tailwind CSS v4 design system
- **Zod** — server-side input validation on every write

> Built as a fullstack web application (rather than a Streamlit desktop script)
> so multiple dispatchers can use a hosted instance against one shared,
> production-grade database.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure the database
#    .env must contain a valid Postgres connection string:
#    DATABASE_URL=postgresql://user:pass@host:5432/dbname

# 3. Create the schema
npx drizzle-kit push --config drizzle.config.json

# 4. Run the dev server
npm run dev        # http://localhost:3000
```

On first load the app **auto-seeds a realistic 5-month operating history**
(8 drivers, 10 units, 10 brokers, ~128 loads, expenses, maintenance, deduction
and settlement history). Use **“Reset demo data”** in the sidebar to wipe and
regenerate it at any time.

### Useful scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npx tsc --noEmit` | Type-check |
| `npx drizzle-kit push` | Apply schema to the database |

## API overview

| Route | Methods | Purpose |
|---|---|---|
| `/api/{drivers,trucks,brokers,loads,maintenance,expenses,deductions}` | `GET`, `POST` + `PATCH`, `DELETE` on `/…/[id]` | Generic validated CRUD |
| `/api/settlements` + `/[id]` | `GET`, `POST` / `PATCH`, `DELETE` | Generate, pay and void itemized settlements |
| `/api/stats` | `GET` | Dashboard aggregates (auto-seeds when empty) |
| `/api/seed` | `POST` | Wipe + regenerate demo dataset |
| `/api/health` | `GET` | Liveness probe |
