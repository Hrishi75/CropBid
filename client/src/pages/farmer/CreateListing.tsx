import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { ImageUploader } from '../../components/listings/ImageUploader';
import api from '../../lib/axios';
import toast from 'react-hot-toast';

const CROPS = [
  'Rice', 'Wheat', 'Cotton', 'Soybean', 'Sugarcane', 'Turmeric', 'Onion',
  'Tomato', 'Potato', 'Chana Dal', 'Mustard', 'Coffee', 'Tea', 'Pepper',
  'Groundnut', 'Coconut', 'Banana', 'Corn', 'Barley', 'Ragi',
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi',
];

/**
 * WHY FormData INSTEAD OF JSON?
 * When uploading files, you can't send them as JSON. The browser uses
 * multipart/form-data encoding which supports binary file data.
 * FormData automatically sets the correct Content-Type header.
 *
 * The server's Multer middleware parses the files from the FormData,
 * and the text fields are available in req.body as usual.
 */
export function CreateListing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = Boolean(editId);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [images, setImages] = useState<File[]>([]);

  // Form fields
  const [cropName, setCropName] = useState('');
  const [cropVariety, setCropVariety] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('QUINTAL');
  const [qualityGrade, setQualityGrade] = useState('A');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [harvestDate, setHarvestDate] = useState('');
  const [description, setDescription] = useState('');
  const [organic, setOrganic] = useState(false);
  const [location, setLocation] = useState('');
  const [state, setState] = useState('');

  // Pre-fill form when editing
  useEffect(() => {
    if (!editId) return;
    setFetching(true);
    api.get(`/listings/${editId}`)
      .then((res) => {
        const l = res.data;
        setCropName(l.cropName || '');
        setCropVariety(l.cropVariety || '');
        setQuantity(String(l.quantity || ''));
        setUnit(l.unit || 'QUINTAL');
        setQualityGrade(l.qualityGrade || 'A');
        setPriceMin(String(l.pricePerUnitMin || ''));
        setPriceMax(String(l.pricePerUnitMax || ''));
        setHarvestDate(l.harvestDate ? l.harvestDate.split('T')[0] : '');
        setDescription(l.description || '');
        setOrganic(l.organic || false);
        setLocation(l.location || '');
        setState(l.state || '');
      })
      .catch(() => {
        toast.error('Failed to load listing');
        navigate('/farmer/listings');
      })
      .finally(() => setFetching(false));
  }, [editId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (parseFloat(priceMin) > parseFloat(priceMax)) {
      toast.error('Minimum price cannot exceed maximum price');
      return;
    }

    setLoading(true);

    try {
      // Build FormData for multipart upload
      const formData = new FormData();
      formData.append('cropName', cropName);
      if (cropVariety) formData.append('cropVariety', cropVariety);
      formData.append('quantity', quantity);
      formData.append('unit', unit);
      formData.append('qualityGrade', qualityGrade);
      formData.append('pricePerUnitMin', priceMin);
      formData.append('pricePerUnitMax', priceMax);
      formData.append('currency', user?.currency || 'INR');
      if (harvestDate) formData.append('harvestDate', harvestDate);
      if (description) formData.append('description', description);
      formData.append('organic', String(organic));
      formData.append('location', location);
      formData.append('country', user?.country || 'India');
      formData.append('state', state);

      // Append each image file
      images.forEach((file) => {
        formData.append('images', file);
      });

      if (isEditMode) {
        // Edit mode sends JSON (no image re-upload)
        await api.put(`/listings/${editId}`, {
          cropName,
          cropVariety: cropVariety || undefined,
          quantity: parseFloat(quantity),
          unit,
          qualityGrade,
          pricePerUnitMin: parseFloat(priceMin),
          pricePerUnitMax: parseFloat(priceMax),
          currency: user?.currency || 'INR',
          harvestDate: harvestDate || undefined,
          description: description || undefined,
          organic,
          location,
          country: user?.country || 'India',
          state,
        });
      } else {
        await api.post('/listings', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      toast.success(isEditMode ? 'Listing updated!' : 'Listing created successfully!');
      navigate('/farmer/listings');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-text mb-6">
          {isEditMode ? 'Edit Listing' : 'Create New Listing'}
        </h1>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Crop selection */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">Crop Name</label>
              <select
                value={cropName}
                onChange={(e) => setCropName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
                required
              >
                <option value="">Select crop</option>
                {CROPS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <Input
              label="Variety (optional)"
              placeholder="e.g., Basmati, Sharbati, Shankar-6"
              value={cropVariety}
              onChange={(e) => setCropVariety(e.target.value)}
            />

            {/* Quantity & Unit */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Quantity"
                type="number"
                placeholder="e.g., 50"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
              <div>
                <label className="block text-sm font-medium text-text mb-1">Unit</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="KG">Kilogram (KG)</option>
                  <option value="QUINTAL">Quintal (100 KG)</option>
                  <option value="TONNE">Metric Tonne</option>
                </select>
              </div>
            </div>

            {/* Quality Grade */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">Quality Grade</label>
              <div className="flex gap-3">
                {[
                  { value: 'A', label: 'Grade A (Premium)', desc: 'Best quality, minimal defects' },
                  { value: 'B', label: 'Grade B (Standard)', desc: 'Good quality, minor defects' },
                  { value: 'C', label: 'Grade C (Economy)', desc: 'Acceptable, some defects' },
                ].map((grade) => (
                  <button
                    key={grade.value}
                    type="button"
                    onClick={() => setQualityGrade(grade.value)}
                    className={`flex-1 p-3 rounded-lg border-2 text-left transition-all
                      ${qualityGrade === grade.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-accent'
                      }`}
                  >
                    <p className="text-sm font-medium text-text">{grade.label}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{grade.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Price Range (per {unit})
              </label>
              <p className="text-xs text-text-muted mb-2">
                Min = your floor price (won't sell below). Max = your ideal price.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Min Price"
                  type="number"
                  placeholder="e.g., 2000"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  required
                />
                <Input
                  label="Max Price"
                  type="number"
                  placeholder="e.g., 2800"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Harvest Date */}
            <Input
              label="Harvest Date (optional)"
              type="date"
              value={harvestDate}
              onChange={(e) => setHarvestDate(e.target.value)}
            />

            {/* Location */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Location (City/Town)"
                placeholder="e.g., Nashik"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
              <div>
                <label className="block text-sm font-medium text-text mb-1">State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
                  required
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe your crop — quality, storage conditions, certifications..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>

            {/* Organic */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={organic}
                onChange={(e) => setOrganic(e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm text-text">This crop is organic certified</span>
            </label>

            {/* Image Upload */}
            <ImageUploader
              images={images}
              onChange={setImages}
              maxImages={5}
            />

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button type="submit" size="lg" className="flex-1" loading={loading || fetching}>
                {isEditMode ? 'Update Listing' : 'Create Listing'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => navigate('/farmer/listings')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </DashboardLayout>
  );
}
