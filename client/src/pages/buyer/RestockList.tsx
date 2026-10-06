// =============================================================================
// RestockList — a store posts its shopping list in one go
// =============================================================================
// A retailer restocks many items at once, for one store and one day. A row per
// crop (name, how much, unit, grade, your price), one delivery address and date
// for all of them, and optionally a repeat. The app's RestockListScreen, on the
// web.
//
// Sent as one POST /requirements/list. The server makes each row an ordinary
// request, so sellers offer on the items they have and every offer, counter and
// deal works as it does for one request, and it posts all of them or none.
// =============================================================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowIcon } from '../../components/ui/Brand';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currency';
import { ALL_CROPS } from '../../utils/crops';
import { INDIAN_STATES } from '../../utils/indianStates';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

type Unit = 'QUINTAL' | 'KG' | 'TONNE';
type Grade = 'A' | 'B' | 'C';
interface Row { key: number; crop: string; qty: string; unit: Unit; grade: Grade; price: string }

// LIST_RULES in requirement.service: at least 2, at most 15.
const MIN = 2;
const MAX = 15;
// A different example on each row, so three blank rows do not read as three
// identical rows already filled in.
const EXAMPLES = [['Onion', '20', '1800'], ['Tomato', '10', '1500'], ['Potato', '15', '1200'], ['Garlic', '2', '9000']];
const REPEAT_CHOICES: Array<{ days: number | null; label: string }> = [
  { days: null, label: 'Just once' },
  { days: 3, label: 'Every 3 days' },
  { days: 7, label: 'Weekly' },
  { days: 14, label: 'Every 2 weeks' },
];

let nextKey = 1;
const blank = (): Row => ({ key: nextKey++, crop: '', qty: '', unit: 'QUINTAL', grade: 'A', price: '' });

export function RestockList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [blank(), blank(), blank()]);
  const [city, setCity] = useState(user?.location ?? '');
  const [state, setState] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [repeat, setRepeat] = useState<number | null>(7);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const set = (key: number, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((cur) => (cur.length > 1 ? cur.filter((r) => r.key !== key) : cur));

  // A row counts once it names a crop; a half-typed row is pointed out at send.
  const used = rows.filter((r) => r.crop.trim());
  const total = used.reduce((sum, r) => sum + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (used.length < MIN) {
      toast.error(`A list has at least ${MIN} items. For one crop, post a single request.`);
      return;
    }
    const missing = used.find((r) => !(parseFloat(r.qty) > 0) || !(parseFloat(r.price) > 0));
    if (missing) {
      toast.error(`Enter how much ${missing.crop} you need and your price`);
      return;
    }
    setSending(true);
    try {
      await api.post('/requirements/list', {
        listName: name.trim() || null,
        items: used.map((r) => ({
          cropName: r.crop.trim(),
          quantity: parseFloat(r.qty),
          unit: r.unit,
          qualityGrade: r.grade,
          pricePerUnit: parseFloat(r.price),
        })),
        deliveryLocation: city.trim(),
        deliveryState: state,
        neededBy: neededBy || undefined,
        description: note.trim() || undefined,
        repeatEveryDays: repeat,
      });
      toast.success(`${used.length} items posted`);
      navigate('/buyer/requirements');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not post the list');
    } finally {
      setSending(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="cb-page-eyebrow">
        <Link to="/buyer/requirements" style={{ color: 'inherit', textDecoration: 'none' }}>Requirements</Link>
        {' / '}Restock list
      </div>
      <h1 className="cb-page-title" style={{ marginTop: 12 }}>
        Your whole order, <span className="cb-italic">in one go.</span>
      </h1>
      <p className="cb-page-lede">
        One row per item, one delivery for all of them. Sellers offer on the items they have, and each one is its own deal.
      </p>

      <form onSubmit={send} className="cb-split" style={{ gap: 24, marginTop: 28 }}>
        <div className="cb-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Input label="Name this list (optional)" placeholder="e.g., Weekly veg for the Dharampeth store" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />

          <div>
            <div className="cb-rl-head" aria-hidden>
              <span>Item</span><span>How much</span><span>Unit</span><span>Grade</span><span>Your price</span><span />
            </div>
            <datalist id="cb-rl-crops">{ALL_CROPS.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="cb-rl-rows">
              {rows.map((r, i) => {
                const ex = EXAMPLES[i % EXAMPLES.length];
                return (
                  <div key={r.key} className="cb-rl-row">
                    <input className="cb-input" list="cb-rl-crops" aria-label={`Item ${i + 1}`} placeholder={ex[0]} value={r.crop} onChange={(e) => set(r.key, { crop: e.target.value })} />
                    <input className="cb-input" inputMode="decimal" aria-label="How much" placeholder={ex[1]} value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value.replace(/[^0-9.]/g, '') })} />
                    <select className="cb-input" aria-label="Unit" value={r.unit} onChange={(e) => set(r.key, { unit: e.target.value as Unit })}>
                      <option value="QUINTAL">quintal</option>
                      <option value="KG">kg</option>
                      <option value="TONNE">tonne</option>
                    </select>
                    <select className="cb-input" aria-label="Grade" value={r.grade} onChange={(e) => set(r.key, { grade: e.target.value as Grade })}>
                      <option value="A">Grade A</option>
                      <option value="B">Grade B</option>
                      <option value="C">Grade C</option>
                    </select>
                    <input className="cb-input" inputMode="decimal" aria-label={`Your price per ${r.unit.toLowerCase()}`} placeholder={`₹${ex[2]}`} value={r.price} onChange={(e) => set(r.key, { price: e.target.value.replace(/[^0-9.]/g, '') })} />
                    <button type="button" className="cb-rl-remove" onClick={() => remove(r.key)} aria-label={`Remove item ${i + 1}`} disabled={rows.length === 1}>
                      <X size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
            {rows.length < MAX && (
              <button type="button" className="cb-rl-add" onClick={() => setRows((cur) => [...cur, blank()])}>
                <Plus size={14} /> Add an item
              </button>
            )}
          </div>

          <div className="cb-cols-2" style={{ gap: 14 }}>
            <Input label="Deliver to (city/town)" placeholder="e.g., Nagpur" value={city} onChange={(e) => setCity(e.target.value)} required />
            <div>
              <label className="cb-label">State</label>
              <select value={state} onChange={(e) => setState(e.target.value)} className="cb-input" required>
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <Input label="Needed by (optional)" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />

          <div>
            <label className="cb-label">How often</label>
            <div className="cb-pill-group">
              {REPEAT_CHOICES.map((c) => (
                <button key={c.label} type="button" className={`cb-pill ${repeat === c.days ? 'active' : ''}`} onClick={() => setRepeat(c.days)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="cb-small" style={{ color: 'var(--cb-ink-3)', marginTop: 6 }}>
              {repeat ? `The whole list reposts every ${repeat} days at the same prices.` : 'Posted once.'}
            </div>
          </div>

          <div>
            <label className="cb-label">Note for sellers (optional)</label>
            <textarea className="cb-input" rows={2} placeholder="Delivery window, crates, anything they should know" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Button type="submit" loading={sending}>
              Post {used.length >= MIN ? `${used.length} items` : 'the list'} <ArrowIcon />
            </Button>
            <Link to="/buyer/requirements/new" className="cb-btn cb-btn-link">Just one crop?</Link>
          </div>
        </div>

        <aside style={{ position: 'sticky', top: 76, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="cb-card" style={{ padding: 20 }}>
            <div className="cb-eyebrow" style={{ marginBottom: 12 }}>Your list</div>
            {used.length === 0 ? (
              <p className="cb-small" style={{ color: 'var(--cb-ink-3)', margin: 0 }}>Items appear here as you type them.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {used.map((r) => (
                  <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}>
                    <span>{r.crop} <span style={{ color: 'var(--cb-ink-3)' }}>· {r.qty || '?'} {r.unit.toLowerCase()} · {r.grade}</span></span>
                    <span className="cb-mono">{parseFloat(r.qty) > 0 && parseFloat(r.price) > 0 ? formatCurrency(parseFloat(r.qty) * parseFloat(r.price), 'INR') : ''}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--cb-line)', paddingTop: 10, marginTop: 4, fontWeight: 600 }}>
                  <span>If every item fills</span>
                  <span className="cb-mono">{formatCurrency(total, 'INR')}</span>
                </div>
              </div>
            )}
          </div>
          <div className="cb-card" style={{ padding: 20 }}>
            <div className="cb-eyebrow" style={{ marginBottom: 8 }}>How it fills</div>
            <p className="cb-small" style={{ color: 'var(--cb-ink-3)', margin: 0 }}>
              Each item is its own request. One seller may supply the onions and another the potatoes, and
              each of those is a separate deal with its own payment.
            </p>
          </div>
        </aside>
      </form>
    </DashboardLayout>
  );
}
