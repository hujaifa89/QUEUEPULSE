import React from 'react';

export interface BannerProps {
  variant?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

export const Banner: React.FC<BannerProps> = ({
  variant = 'info',
  title,
  children,
  className = '',
  onClose,
}) => {
  const variantStyles = {
    info: 'bg-teal-50 border-teal-200 text-teal-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
    success: 'bg-green-50 border-green-200 text-green-900',
  };

  const badgeLabels = {
    info: 'Notice',
    warning: 'Warning',
    danger: 'Error',
    success: 'Success',
  };

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      aria-live={variant === 'danger' ? 'assertive' : 'polite'}
      className={`w-full rounded-lg border p-4 text-sm flex flex-col space-y-1 ${variantStyles[variant]} ${className}`}
    >
      <div className="flex items-center justify-between space-y-0.5 gap-2 font-semibold">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded border border-current opacity-80">
            {badgeLabels[variant]}
          </span>
          {title && <span>{title}</span>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notification"
            className="text-xs opacity-60 hover:opacity-100 p-1 rounded"
          >
            ✕
          </button>
        )}
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
};
