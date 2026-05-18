import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      children,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const variantClass = {
      primary: 'cb-btn cb-btn-primary',
      secondary: 'cb-btn cb-btn-ghost',
      outline: 'cb-btn cb-btn-ghost',
      ghost: 'cb-btn cb-btn-ghost',
      danger: 'cb-btn cb-btn-danger',
      link: 'cb-btn cb-btn-link',
    }[variant];

    const sizeClass = size === 'sm' ? 'cb-btn-sm' : size === 'lg' ? 'cb-btn-lg' : '';

    return (
      <button
        ref={ref}
        className={`${variantClass} ${sizeClass} ${className}`.trim()}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="cb-btn-spinner"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            style={{ animation: 'cb-spin 0.8s linear infinite' }}
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path
              d="M4 12a8 8 0 018-8"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
