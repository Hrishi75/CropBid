import { DashboardLayout } from '../../components/layout/DashboardLayout';

export function AdminDashboard() {
  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold text-text mb-2">
          Admin Dashboard
        </h1>
        <p className="text-text-secondary mb-6">
          Platform overview and management.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <p className="text-sm text-text-secondary">Total Users</p>
            <p className="text-3xl font-bold text-primary mt-1">0</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <p className="text-sm text-text-secondary">Active Listings</p>
            <p className="text-3xl font-bold text-accent mt-1">0</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <p className="text-sm text-text-secondary">Transactions</p>
            <p className="text-3xl font-bold text-text mt-1">0</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <p className="text-sm text-text-secondary">GMV</p>
            <p className="text-3xl font-bold text-text mt-1">₹0</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
