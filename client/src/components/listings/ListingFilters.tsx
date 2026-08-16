// =============================================================================
// ListingFilters — Browse filter rail
// =============================================================================
// Controlled filter panel for the buyer's browse page. Parent owns the `filters`
// object; this component reports changes via onChange. Details:
//   - Available crops/states are fetched once from /browse/filters
//   - The search box is debounced (300ms) so typing doesn't spam the parent
//   - "Clear all" resets every field to its default
// =============================================================================

import { useState, useEffect } from 'react';
import api from '../../lib/axios';

interface Filters {
  search: string;
  crop: string;
  state: string;
  quality: string;
  organic: string;
  freshProduce: string;
  priceMin: string;
  priceMax: string;
  sort: string;
}

interface ListingFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  variant?: 'bar' | 'rail';
}

interface AvailableFilters {
  crops: string[];
  states: string[];
  qualities: string[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid var(--cb-line)' }}>
      <div className="cb-eyebrow">{title}</div>
      {children}
    </div>
  );
}

export function ListingFilters({ filters, onChange }: ListingFiltersProps) {
  const [available, setAvailable] = useState<AvailableFilters>({ crops: [], states: [], qualities: ['A', 'B', 'C'] });
  const [searchInput, setSearchInput] = useState(filters.search);
  // Below 900px the rail stops being a rail and stacks above the results —
  // and seven sections of filters is a screen and a half of scrolling before
  // the first lot. Start collapsed there. On desktop the panel is always open
  // and its summary is hidden, so nothing changes.
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 901px)').matches,
  );

  useEffect(() => {
    api.get('/browse/filters')
      .then(({ data }) => setAvailable(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function updateFilter(key: keyof Filters, value: string) {
    onChange({ ...filters, [key]: value });
  }

  function clearAll() {
    setSearchInput('');
    onChange({
      search: '', crop: '', state: '', quality: '',
      organic: '', freshProduce: '', priceMin: '', priceMax: '', sort: 'createdAt',
    });
  }

  const hasActiveFilters = filters.crop || filters.state || filters.quality
    || filters.organic || filters.freshProduce || filters.priceMin || filters.priceMax;

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
          placeholder="Crop, location…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="cb-input"
          style={{ fontSize: 13 }}
        />
      </Section>

      <Section title="Category">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.freshProduce === 'true'}
            onChange={(e) => updateFilter('freshProduce', e.target.checked ? 'true' : '')}
            style={{ accentColor: 'var(--cb-forest)' }}
          />
          🥬 Fresh produce only (veg & fruit)
        </label>
      </Section>

      <Section title="Crop">
        <select value={filters.crop} onChange={(e) => updateFilter('crop', e.target.value)} className="cb-input" style={{ fontSize: 13 }}>
          <option value="">All crops</option>
          {available.crops.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Section>

      <Section title="State / region">
        <select value={filters.state} onChange={(e) => updateFilter('state', e.target.value)} className="cb-input" style={{ fontSize: 13 }}>
          <option value="">All</option>
          {available.states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Section>

      <Section title="Grade">
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
          Organic only
        </label>
      </Section>

      <Section title="Price · per unit">
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
          <option value="pricePerUnitMin">Price: low → high</option>
          <option value="pricePerUnitMax">Price: high → low</option>
          <option value="quantity">Quantity: high → low</option>
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
