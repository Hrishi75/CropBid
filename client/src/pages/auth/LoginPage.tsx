import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import toast from 'react-hot-toast';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/'); // Router will redirect based on role
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-alt flex items-center justify-center px-4">
      <Card className="w-full max-w-md" padding="lg">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/CropBidlogo.png" alt="CropBid" className="h-[100px] mx-auto mb-3" />
          <p className="text-text-secondary">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="rajesh@cropbid.test"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Sign In
          </Button>
        </form>

        {/* Quick login for testing */}
        <div className="mt-6 pt-6 border-t border-border-light">
          <p className="text-xs text-text-muted mb-3 text-center">Quick login (test accounts):</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Farmer', email: 'rajesh@cropbid.test' },
              { label: 'Buyer', email: 'vikram@cropbid.test' },
              { label: 'Admin', email: 'admin@cropbid.test' },
            ].map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword('password123');
                }}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:bg-surface-hover transition-colors"
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sign up link */}
        <p className="mt-6 text-center text-sm text-text-secondary">
          Don't have an account?{' '}
          <Link to="/signup" className="text-accent font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </Card>
    </div>
  );
}
