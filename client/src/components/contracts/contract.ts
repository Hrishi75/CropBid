// A supply contract as GET /contracts/mine returns it, and the words and
// colours its statuses are shown in. Shared by the Contracts page and the
// dashboards' contracts panel, so the two cannot describe one differently.

export interface Contract {
  id: string; buyerId: string; farmerId: string; cropName: string; cropVariety: string | null;
  unit: string; qualityGrade: string; pricePerUnit: number; totalQuantity: number; batchQuantity: number;
  everyDays: number; startsAt: string; message: string | null; status: 'PROPOSED' | 'ACTIVE' | 'COMPLETED' | 'DECLINED' | 'CANCELLED';
  nextBatchAt: string | null;
  buyer?: { name: string; buyerProfile?: { companyName?: string | null } | null };
  farmer?: { name: string; farmerProfile?: { businessName?: string | null } | null };
  batches: Array<{ id: string; transactions: Array<{ id: string; paymentStatus: string; deliveryStatus: string }> }>;
}

export const CONTRACT_STATUS: Record<Contract['status'], { label: string; color: string }> = {
  PROPOSED: { label: 'PROPOSED', color: 'var(--cb-ember)' },
  ACTIVE: { label: 'ACTIVE', color: 'var(--cb-sage)' },
  COMPLETED: { label: 'ALL BATCHES MADE', color: 'var(--cb-sage)' },
  DECLINED: { label: 'DECLINED', color: 'var(--cb-ink-3)' },
  CANCELLED: { label: 'ENDED', color: 'var(--cb-ink-3)' },
};
export const contractDay = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
