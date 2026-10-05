// =============================================================================
// CreditApply — a business buyer applying for credit to buy produce
// =============================================================================
// The website's twin of the app's CreditApplyScreen: what a lender asks first,
// one POST /credit. The consent box starts unticked on every submission, and
// the server refuses without it. Limits come from GET /credit; none are kept
// here. CropBid does not lend (CLAUDE.md §9).
// =============================================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/axios';
import { formatCurrency } from '../../utils/currency';

interface Rules { minAmount: number; maxAmount: number; repaymentDays: number[] }
const digits = (v: string) => v.replace(/[^0-9]/g, '');

export function CreditApply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rules, setRules] = useState<Rules | null>(null);
  const [editing, setEditing] = useState(false);
  const [businessName, setBusinessName] = useState(user?.buyerProfile?.companyName ?? '');
  const [gstin, setGstin] = useState('');
  const [years, setYears] = useState('');
  const [monthly, setMonthly] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/credit').then(({ data }) => {
      setRules(data.rules);
      const a = data.application;
      if (a) {
        setEditing(a.status === 'SUBMITTED');
        setBusinessName(a.businessName); setGstin(a.gstin ?? ''); setYears(String(a.yearsInBusiness));
        setMonthly(String(a.monthlyPurchase)); setAmount(String(a.amountWanted)); setDays(a.repaymentDays);
        setPurpose(a.purpose ?? ''); setPhone(a.contactPhone);
      }
    }).catch(() => setError('Could not open the form. Refresh to try again.'));
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rules) return;
    const amt = Number(amount);
    const problem =
      businessName.trim().length < 2 ? 'Enter your business name'
        : years === '' ? 'How many years have you been in business?'
          : !(Number(monthly) > 0) ? 'Roughly how much produce do you buy in a month?'
            : !(amt >= rules.minAmount && amt <= rules.maxAmount) ? `Ask for between ${formatCurrency(rules.minAmount, 'INR')} and ${formatCurrency(rules.maxAmount, 'INR')}`
              : days == null ? 'Choose how long you need to repay'
                : digits(phone).length < 10 ? 'Enter a phone number we can call you on'
                  : !consent ? 'Tick the box to let us share this with lending partners'
                    : null;
    if (problem) { setError(problem); return; }
    setSending(true);
    try {
      await api.post('/credit', {
        businessName: businessName.trim(), gstin: gstin.trim() || null, yearsInBusiness: Number(years),
        monthlyPurchase: Number(monthly), amountWanted: amt, repaymentDays: days, purpose: purpose.trim() || null,
        contactPhone: phone.trim(), consent,
      });
      toast.success('Application in. A person will read it and call you.');
      navigate('/buyer');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not send your application');
    } finally {
      setSending(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="cb-page-head">
        <div className="cb-page-eyebrow">Business credit</div>
        <h1 className="cb-page-title">Money to stock up,<br /><span className="cb-italic">repaid later.</span></h1>
        <p className="cb-page-lede">
          A person reads every application and, with your permission, takes it to a lending partner. CropBid does not lend money, and it is not instant.
        </p>
      </div>
      <form onSubmit={send} className="cb-card" style={{ padding: 24, maxWidth: 680, display: 'grid', gap: 16 }}>
        <Input label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        <div className="cb-cols-2" style={{ gap: 12 }}>
          <Input label="GSTIN (optional)" value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="27ABCDE1234F1Z5" />
          <Input label="Years running" value={years} onChange={(e) => setYears(digits(e.target.value))} placeholder="5" />
        </div>
        <Input label="Produce you buy in a month, roughly (₹)" value={monthly} onChange={(e) => setMonthly(digits(e.target.value))} placeholder="400000" />
        <Input
          label="How much (₹)"
          value={amount}
          onChange={(e) => setAmount(digits(e.target.value))}
          placeholder="200000"
          hint={rules ? `Between ${formatCurrency(rules.minAmount, 'INR')} and ${formatCurrency(rules.maxAmount, 'INR')}` : undefined}
        />
        <div>
          <div className="cb-small" style={{ fontWeight: 500, marginBottom: 6 }}>Repay in</div>
          <div className="cb-pill-group">
            {(rules?.repaymentDays ?? [30, 60, 90]).map((d) => (
              <button key={d} type="button" className={`cb-pill ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>{d} days</button>
            ))}
          </div>
        </div>
        <Input label="What will you buy with it? (optional)" value={purpose} maxLength={500} onChange={(e) => setPurpose(e.target.value)} />
        <Input label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98220 55667" />
        <label className="cb-small" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
          I agree to CropBid sharing these details with lending partners so they can decide on my application.
        </label>
        {error && <div className="cb-small" style={{ color: 'var(--cb-ember)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button type="submit" loading={sending} disabled={!rules}>{editing ? 'Update application' : 'Send application'}</Button>
          <span className="cb-tiny" style={{ color: 'var(--cb-ink-3)' }}>Interest and terms are set by the lender and told to you before you agree.</span>
        </div>
      </form>
    </DashboardLayout>
  );
}
