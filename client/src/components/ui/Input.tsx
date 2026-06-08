// =============================================================================
// Input — Labelled text input primitive
// =============================================================================
// Native <input> plus an optional label, error message, and hint text. If no
// `id` is given, one is derived from the label so the <label htmlFor> stays
// linked for accessibility. `error` swaps in the error style and message.
//
// forwardRef lets form libraries / parents attach a ref to the raw input.
// =============================================================================

import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? `cb-input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    return (
      <div style={{ width: '100%' }}>
        {label && (
          <label htmlFor={inputId} className="cb-label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`cb-input ${error ? 'error' : ''} ${className}`.trim()}
          {...props}
        />
        {error && <p className="cb-field-error">{error}</p>}
        {!error && hint && <p className="cb-field-hint">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
