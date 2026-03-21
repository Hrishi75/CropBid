import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';

export function BuyerDashboard() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold text-text mb-2">
          Welcome back, {user?.name} 🏢
        </h1>
        <p className="text-text-secondary mb-6">
          Find the best crops at competitive prices.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <p className="text-sm text-text-secondary">Active Bids</p>
            <p className="text-3xl font-bold text-primary mt-1">0</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <p className="text-sm text-text-secondary">Won Deals</p>
            <p className="text-3xl font-bold text-accent mt-1">0</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border-light">
            <p className="text-sm text-text-secondary">Total Spent</p>
            <p className="text-3xl font-bold text-text mt-1">₹0</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
