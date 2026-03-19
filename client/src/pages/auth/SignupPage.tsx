import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import toast from 'react-hot-toast';

type SignupRole = 'FARMER' | 'BUYER';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SignupRole>('FARMER');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await signup({ name, email, password, role, phone: phone || undefined });
      toast.success('Account created! Complete your profile.');
      navigate('/onboarding');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-alt flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md" padding="lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">🌾 Join CropBid</h1>
          <p className="text-text-secondary">Where AI Agents Negotiate, So Farmers Prosper</p>
        </div>

        {/* Role selector */}
        <div className="flex gap-3 mb-6">
          {(['FARMER', 'BUYER'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all
                ${role === r
                  ? 'border-primary bg-primary text-white'
                  : 'border-border text-text-secondary hover:border-accent'
                }`}
            >
              {r === 'FARMER' ? '🧑‍🌾 I\'m a Farmer' : '🏢 I\'m a Buyer'}
            </button>
          ))}
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="Enter your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Phone (optional)"
            type="tel"
            placeholder="+91-9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <Input
            label="Password"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Create Account
          </Button>
        </form>

        {/* Login link */}
        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-accent font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
