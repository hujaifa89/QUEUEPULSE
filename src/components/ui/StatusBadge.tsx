import React from 'react';

export type StatusType =
  | 'waiting'
  | 'serving'
  | 'completed'
  | 'skipped'
  | 'cancelled'
  | 'expired'
  | 'active'
  | 'paused';

export interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
}

const STATUS_CONFIG: Record<StatusType, { label: string; bg: string; text: string; border: string }> = {
  waiting: {
    label: 'Waiting',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
  },
  serving: {
    label: 'Serving',
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-300',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-green-50',
    text: 'text-green-800',
    border: 'border-green-200',
  },
  skipped: {
    label: 'Skipped',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  expired: {
    label: 'Expired',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
  },
  active: {
    label: 'Active',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  paused: {
    label: 'Paused',
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const normalized = status.toLowerCase() as StatusType;
  const config = STATUS_CONFIG[normalized] || {
    label: status,
    bg: 'bg-slate-100',
    text: 'text-slate-800',
    border: 'border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-70" aria-hidden="true" />
      {config.label}
    </span>
  );
};
