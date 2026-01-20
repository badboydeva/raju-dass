
export interface ProductionEntry {
  id: string;
  date: string;
  runningDrum: number;
  openStockGrams: number;
  productionCones: number;
  closingStockGrams: number;
  ratePerKg: number;
  totalAmount: number;
  productionWeight: number;
  consumptionKg: number;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  note: string;
}

export interface SummaryStats {
  totalProduction: number;
  totalWeight: number;
  totalValue: number;
  netConsumption: number;
  totalPaid: number;
  outstandingBalance: number;
}
