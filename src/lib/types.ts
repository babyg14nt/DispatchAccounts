/** Row shapes returned by the API (numerics arrive as strings from PG). */

export type DriverRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string | null;
  payType: "percentage" | "per_mile" | "flat";
  payRate: string | number;
  status: "active" | "inactive";
  createdAt: string;
};

export type TruckRow = {
  id: string;
  unitNumber: string;
  equipmentType: "truck" | "trailer";
  make: string;
  model: string;
  year: number | null;
  vin: string;
  status: "active" | "in_shop" | "inactive";
  createdAt: string;
};

export type BrokerRow = {
  id: string;
  companyName: string;
  mcNumber: string;
  dotNumber: string;
  contactName: string;
  phone: string;
  email: string;
  paymentTermsDays: number;
  createdAt: string;
};

export type LoadRow = {
  id: string;
  loadNumber: string;
  brokerId: string | null;
  driverId: string | null;
  truckId: string | null;
  pickupLocation: string;
  deliveryLocation: string;
  miles: number;
  rate: string | number;
  dispatchDate: string | null;
  deliveryDate: string | null;
  status: "booked" | "in_transit" | "delivered";
  bolNumber: string;
  bolDocUrl: string;
  bolStatus: "pending" | "delivered" | "signed";
  factoringStatus: "not_submitted" | "submitted" | "approved" | "funded" | "rejected";
  factoringFeePct: string | number;
  notes: string;
  createdAt: string;
  driverName?: string | null;
  truckUnit?: string | null;
  brokerName?: string | null;
  brokerTerms?: number | null;
};

export type MaintenanceRow = {
  id: string;
  truckId: string | null;
  serviceDate: string;
  repairType: string;
  description: string;
  cost: string | number;
  shop: string;
  status: "in_progress" | "completed";
  odometer: number | null;
  createdAt: string;
  truckUnit?: string | null;
};

export type ExpenseRow = {
  id: string;
  expenseDate: string;
  category: string;
  amount: string | number;
  description: string;
  truckId: string | null;
  createdAt: string;
  truckUnit?: string | null;
};

export type DeductionRow = {
  id: string;
  driverId: string;
  deductionDate: string;
  type: string;
  amount: string | number;
  note: string;
  settlementId: string | null;
  createdAt: string;
  driverName?: string | null;
};

export type SettlementItemRow = {
  id: string;
  settlementId: string;
  loadId: string | null;
  kind: "load" | "deduction";
  description: string;
  amount: string | number;
};

export type SettlementRow = {
  id: string;
  settlementNumber: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  grossPay: string | number;
  totalDeductions: string | number;
  netPay: string | number;
  payTypeSnapshot: string;
  payRateSnapshot: string | number;
  status: "draft" | "paid";
  createdAt: string;
  driverName?: string | null;
  items: SettlementItemRow[];
};

export type StatsPayload = {
  kpis: {
    grossRevenue: number;
    totalOpex: number;
    netProfit: number;
    outstandingAR: number;
    estDriverPay: number;
    expenseTotal: number;
    maintTotal: number;
    factoringFeesHeld: number;
    activeLoads: number;
    deliveredCount: number;
    totalMiles: number;
    activeDrivers: number;
    fleetUtilization: number;
    rpm: number;
  };
  monthly: { key: string; label: string; revenue: number; expenses: number; driverPay: number; net: number }[];
  revenueByTruck: { unit: string; revenue: number; loads: number; miles: number; rpm: number }[];
  topBrokers: { name: string; revenue: number; loads: number }[];
  expenseByCategory: { category: string; amount: number }[];
  actionFeed: { id: string; kind: "factoring" | "bol" | "funding" | "maintenance"; title: string; detail: string; amount: number }[];
  recentLoads: LoadRow[];
};
