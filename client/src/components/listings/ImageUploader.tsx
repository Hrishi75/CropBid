// =============================================================================
// ImageUploader — Crop photo picker with previews
// =============================================================================
// Controlled multi-image picker used by the listing forms. Holds two buckets:
//   - existingImages: URLs already saved on the server (editing a listing)
//   - images:         newly picked File objects not yet uploaded
// Enforces a combined max count and renders thumbnails with per-image remove
// buttons. See the JSDoc below for why we hide the native file input.
// =============================================================================

import { useRef } from 'react';
import { Upload, X } from 'lucide-react';

interface ImageUploaderProps {
  images: File[];
  existingImages?: string[];
  onChange: (files: File[]) => void;
  onRemoveExisting?: (index: number) => void;
  maxImages?: number;
}

/**
 * WHY A CUSTOM UPLOADER INSTEAD OF <input type="file">?
 * The native file input is ugly and inconsistent across browsers.
 * This component provides:
 *   - Drag & drop support
 *   - Image previews before upload
 *   - Remove button per image
 *   - Max file count enforcement
 *   - Visual feedback with thumbnail grid
 */
export function ImageUploader({
  images,
  existingImages = [],
  onChange,
  onRemoveExisting,
  maxImages = 5,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const totalImages = existingImages.length + images.length;
  const canAdd = totalImages < maxImages;

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newFiles = Array.from(fileList).slice(0, maxImages - totalImages);
    onChange([...images, ...newFiles]);
  }

  function removeNewImage(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-text mb-2">
        Crop Photos ({totalImages}/{maxImages})
      </label>

      <div className="grid grid-cols-5 gap-2">
        {/* Existing images (already uploaded) */}
        {existingImages.map((url, i) => (
          <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-border">
            <img src={url} alt={`Crop ${i + 1}`} className="w-full h-full object-cover" />
            {onRemoveExisting && (
              <button
                type="button"
                onClick={() => onRemoveExisting(i)}
                className="absolute top-1 right-1 p-0.5 bg-error text-white rounded-full"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}

        {/* New image previews */}
        {images.map((file, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border">
            <img
              src={URL.createObjectURL(file)}
              alt={`New ${i + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => removeNewImage(i)}
              className="absolute top-1 right-1 p-0.5 bg-error text-white rounded-full"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {/* Add button */}
        {canAdd && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-accent flex flex-col items-center justify-center text-text-muted hover:text-accent transition-colors"
          >
            <Upload size={20} />
            <span className="text-xs mt-1">Add</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
