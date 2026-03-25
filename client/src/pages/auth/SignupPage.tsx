import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import toast from 'react-hot-toast';
import type { Currency } from '../../types';

type SignupRole = 'FARMER' | 'BUYER';

const COUNTRIES = [
  { code: 'India', label: 'India', currency: 'INR' as Currency, phonePlaceholder: '+91-9876543210' },
  { code: 'United States', label: 'United States', currency: 'USD' as Currency, phonePlaceholder: '+1-555-0123' },
  { code: 'United Kingdom', label: 'United Kingdom', currency: 'GBP' as Currency, phonePlaceholder: '+44-7911-123456' },
  { code: 'Germany', label: 'Germany', currency: 'EUR' as Currency, phonePlaceholder: '+49-151-12345678' },
  { code: 'France', label: 'France', currency: 'EUR' as Currency, phonePlaceholder: '+33-6-12-34-56-78' },
  { code: 'Netherlands', label: 'Netherlands', currency: 'EUR' as Currency, phonePlaceholder: '+31-6-12345678' },
  { code: 'Brazil', label: 'Brazil', currency: 'USD' as Currency, phonePlaceholder: '+55-11-91234-5678' },
  { code: 'Kenya', label: 'Kenya', currency: 'USD' as Currency, phonePlaceholder: '+254-712-345678' },
  { code: 'Nigeria', label: 'Nigeria', currency: 'USD' as Currency, phonePlaceholder: '+234-801-234-5678' },
  { code: 'Australia', label: 'Australia', currency: 'USD' as Currency, phonePlaceholder: '+61-412-345-678' },
  { code: 'UAE', label: 'United Arab Emirates', currency: 'USD' as Currency, phonePlaceholder: '+971-50-123-4567' },
  { code: 'Thailand', label: 'Thailand', currency: 'USD' as Currency, phonePlaceholder: '+66-81-234-5678' },
  { code: 'Vietnam', label: 'Vietnam', currency: 'USD' as Currency, phonePlaceholder: '+84-91-234-56-78' },
  { code: 'Indonesia', label: 'Indonesia', currency: 'USD' as Currency, phonePlaceholder: '+62-812-3456-7890' },
  { code: 'Ethiopia', label: 'Ethiopia', currency: 'USD' as Currency, phonePlaceholder: '+251-91-123-4567' },
];

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SignupRole>('FARMER');
  const [country, setCountry] = useState('India');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await signup({
        name, email, password, role,
        phone: phone || undefined,
        country,
        currency: selectedCountry.currency,
      });
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
          <img src="/CropBidlogo.png" alt="CropBid" className="h-[100px] mx-auto mb-3" />
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

          <div>
            <label className="block text-sm font-medium text-text mb-1">Country</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
              required
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-secondary">
              Currency: {selectedCountry.currency}
            </p>
          </div>

          <Input
            label="Phone (optional)"
            type="tel"
            placeholder={selectedCountry.phonePlaceholder}
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
