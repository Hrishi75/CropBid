// =============================================================================
// RequirementFilters — Farmer feed filter rail
// =============================================================================
// The demand-side twin of ListingFilters. Same contract (parent owns `filters`,
// this reports via onChange), same 300ms search debounce, same rail styling.
//
// Cloned rather than shared because the two disagree on their fields: listings
// filter on a price RANGE (pricePerUnitMin/Max) and a "fresh produce" category,
// requirements on a single pricePerUnit and a delivery state. Bending one
// component across both would mean a union type and dead branches on each page.
// =============================================================================

import { useState, useEffect } from 'react';
import api from '../../lib/axios';
import { COMPANY_TYPE_LABEL } from '../../utils/companyType';

export interface RequirementFilterState {
  search: string;
  crop: string;
  state: string;
  quality: string;
  buyerType: string;
  organic: string;
  priceMin: string;
  priceMax: string;
  sort: string;
}

export const EMPTY_REQUIREMENT_FILTERS: RequirementFilterState = {
  search: '', crop: '', state: '', quality: '', buyerType: '', organic: '', priceMin: '', priceMax: '', sort: 'createdAt',
};

interface RequirementFiltersProps {
  filters: RequirementFilterState;
  onChange: (filters: RequirementFilterState) => void;
}

interface AvailableFilters {
  crops: string[];
  states: string[];
  qualities: string[];
  buyerTypes: string[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--cb-line)' }}>
      <div className="cb-eyebrow">{title}</div>
      {children}
    </div>
  );
}

export function RequirementFilters({ filters, onChange }: RequirementFiltersProps) {
  const [available, setAvailable] = useState<AvailableFilters>({ crops: [], states: [], qualities: ['A', 'B', 'C'], buyerTypes: [] });
  const [searchInput, setSearchInput] = useState(filters.search);
  // Collapsed below 900px, where the rail stacks above the feed — see the
  // matching note in ListingFilters.
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 901px)').matches,
  );

  // Reading the viewport once at mount was not enough. Desktop hides the
  // <summary> that reopens this panel, so someone who collapsed the filters on
  // a narrow window and then widened it was left with a shut <details> and
  // nothing to click — every filter gone until a reload. Follow the breakpoint
  // up as well as reading it at the start. Narrowing is left alone: a panel
  // deliberately left open should stay open.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 901px)');
    const sync = (e: MediaQueryListEvent) => { if (e.matches) setOpen(true); };
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    api.get('/requirements/filters')
      .then(({ data }) => setAvailable(data))
      .catch(() => {});
  }, []);

  // Debounced so typing doesn't fire a request per keystroke — the API is rate
  // limited at 100 req/min per IP.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function updateFilter(key: keyof RequirementFilterState, value: string) {
    onChange({ ...filters, [key]: value });
  }

  function clearAll() {
    setSearchInput('');
    onChange({ ...EMPTY_REQUIREMENT_FILTERS });
  }

  const hasActiveFilters = filters.crop || filters.state || filters.quality
    || filters.buyerType || filters.organic || filters.priceMin || filters.priceMax;

  return (
    <details
      className="cb-card cb-filter-rail"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Filters{hasActiveFilters ? ' · active' : ''}</summary>
      <Section title="Search">
        <input
          type="search"
          placeholder="Crop, delivery town…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="cb-input"
          style={{ fontSize: 13 }}
        />
      </Section>

      <Section title="Crop">
        <select value={filters.crop} onChange={(e) => updateFilter('crop', e.target.value)} className="cb-input" style={{ fontSize: 13 }}>
          <option value="">All crops</option>
          {available.crops.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Section>

      <Section title="Delivery state">
        <select value={filters.state} onChange={(e) => updateFilter('state', e.target.value)} className="cb-input" style={{ fontSize: 13 }}>
          <option value="">Anywhere</option>
          {available.states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Section>

      {/* Hidden until some buyer type actually has open demand, so the rail
          doesn't advertise a filter that returns nothing. */}
      {available.buyerTypes.length > 0 && (
        <Section title="Buyer type">
          <select value={filters.buyerType} onChange={(e) => updateFilter('buyerType', e.target.value)} className="cb-input" style={{ fontSize: 13 }}>
            <option value="">All buyers</option>
            {available.buyerTypes.map((b) => (
              <option key={b} value={b}>{COMPANY_TYPE_LABEL[b] || b}</option>
            ))}
          </select>
        </Section>
      )}

      <Section title="Grade wanted">
        <div className="cb-pill-group">
          {['A', 'B', 'C'].map((q) => (
            <button
              key={q}
              type="button"
              className={`cb-pill ${filters.quality === q ? 'active' : ''}`}
              onClick={() => updateFilter('quality', filters.quality === q ? '' : q)}
            >
              {q}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Certifications">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.organic === 'true'}
            onChange={(e) => updateFilter('organic', e.target.checked ? 'true' : '')}
            style={{ accentColor: 'var(--cb-forest)' }}
          />
          Organic requirements only
        </label>
      </Section>

      <Section title="Price offered · per unit">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            placeholder="Min"
            value={filters.priceMin}
            onChange={(e) => updateFilter('priceMin', e.target.value)}
            className="cb-input"
            style={{ fontSize: 13 }}
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.priceMax}
            onChange={(e) => updateFilter('priceMax', e.target.value)}
            className="cb-input"
            style={{ fontSize: 13 }}
          />
        </div>
      </Section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="cb-eyebrow">Sort</div>
        <select value={filters.sort} onChange={(e) => updateFilter('sort', e.target.value)} className="cb-input" style={{ fontSize: 13 }}>
          <option value="createdAt">Latest</option>
          <option value="pricePerUnit">Price offered</option>
          <option value="remainingQuantity">Quantity still needed</option>
          <option value="neededBy">Deadline</option>
        </select>
      </div>

      {hasActiveFilters && (
        <button type="button" onClick={clearAll} className="cb-btn cb-btn-link" style={{ marginTop: 14, fontSize: 12 }}>
          ↺ Clear all
        </button>
      )}
    </details>
  );
}
