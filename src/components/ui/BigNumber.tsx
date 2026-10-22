import React from 'react';

export interface BigNumberProps {
  label: string;
  value: number | string | null;
  subtitle?: string;
  ariaLive?: 'off' | 'polite' | 'assertive';
  className?: string;
}

export const BigNumber: React.FC<BigNumberProps> = ({
  label,
  value,
  subtitle,
  ariaLive = 'polite',
  className = '',
}) => {
  const displayValue = value === null || value === undefined ? '—' : String(value);

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center ${className}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </span>
      <div
        aria-live={ariaLive}
        aria-atomic="true"
        className="text-[64px] font-black leading-none tracking-tight text-[#0F766E] font-mono my-2 select-all"
      >
        {displayValue}
      </div>
      {subtitle && <span className="text-xs text-slate-500 font-medium">{subtitle}</span>}
    </div>
  );
};
