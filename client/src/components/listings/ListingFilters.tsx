import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import api from '../../lib/axios';

interface Filters {
  search: string;
  crop: string;
  state: string;
  quality: string;
  organic: string;
  priceMin: string;
  priceMax: string;
  sort: string;
}

interface ListingFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

interface AvailableFilters {
  crops: string[];
  states: string[];
  qualities: string[];
}

/**
 * WHY DEBOUNCED SEARCH?
 * Without debouncing, every keystroke fires an API call:
 *   "R" → API call, "Ri" → API call, "Ric" → API call, "Rice" → API call
 * That's 4 calls when we only need 1. Debouncing waits 300ms after the
 * last keystroke before firing. The user types "Rice" and only ONE call
 * goes out. This reduces server load by ~75% on search.
 */
export function ListingFilters({ filters, onChange }: ListingFiltersProps) {
  const [available, setAvailable] = useState<AvailableFilters>({ crops: [], states: [], qualities: ['A', 'B', 'C'] });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search);

  // Fetch available filter options on mount
  useEffect(() => {
    api.get('/browse/filters')
      .then(({ data }) => setAvailable(data))
      .catch(() => {});
  }, []);

  // Debounced search
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
      organic: '', priceMin: '', priceMax: '', sort: 'createdAt',
    });
  }

  const hasActiveFilters = filters.crop || filters.state || filters.quality ||
    filters.organic || filters.priceMin || filters.priceMax;

  return (
    <div className="bg-surface rounded-xl border border-border-light p-4 mb-6">
      {/* Search bar */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search crops, varieties, locations..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-surface text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors
            ${showAdvanced ? 'border-primary bg-primary text-white' : 'border-border text-text-secondary hover:bg-surface-hover'}`}
        >
          <SlidersHorizontal size={18} />
          <span className="hidden sm:inline">Filters</span>
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-sm text-error hover:bg-error/10 transition-colors"
          >
            <X size={16} /> Clear
          </button>
        )}
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border-light">
          {/* Crop filter */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Crop</label>
            <select
              value={filters.crop}
              onChange={(e) => updateFilter('crop', e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">All crops</option>
              {available.crops.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* State filter */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">State</label>
            <select
              value={filters.state}
              onChange={(e) => updateFilter('state', e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">All states</option>
              {available.states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Quality filter */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Quality</label>
            <select
              value={filters.quality}
              onChange={(e) => updateFilter('quality', e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Any grade</option>
              <option value="A">Grade A (Premium)</option>
              <option value="B">Grade B (Standard)</option>
              <option value="C">Grade C (Economy)</option>
            </select>
          </div>

          {/* Organic filter */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Organic</label>
            <select
              value={filters.organic}
              onChange={(e) => updateFilter('organic', e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Any</option>
              <option value="true">Organic only</option>
              <option value="false">Conventional only</option>
            </select>
          </div>

          {/* Price range */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Min Price</label>
            <input
              type="number"
              placeholder="e.g., 1000"
              value={filters.priceMin}
              onChange={(e) => updateFilter('priceMin', e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Max Price</label>
            <input
              type="number"
              placeholder="e.g., 5000"
              value={filters.priceMax}
              onChange={(e) => updateFilter('priceMax', e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Sort */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-text-secondary mb-1">Sort by</label>
            <select
              value={filters.sort}
              onChange={(e) => updateFilter('sort', e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="createdAt">Newest first</option>
              <option value="pricePerUnitMin">Price: Low to High</option>
              <option value="pricePerUnitMax">Price: High to Low</option>
              <option value="quantity">Quantity: High to Low</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
