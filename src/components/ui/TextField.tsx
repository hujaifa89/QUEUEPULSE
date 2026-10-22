import React, { useId } from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  hint?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, helperText, hint, id, disabled, className = '', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const effectiveHelper = helperText || hint;

    return (
      <div className="w-full flex flex-col space-y-1.5 text-left">
        <label
          htmlFor={inputId}
          className="text-sm font-semibold text-slate-800"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : effectiveHelper ? helperId : undefined}
          className={`w-full rounded-lg border px-3 py-2 text-sm min-h-[44px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${
            error
              ? 'border-red-500 focus-visible:outline-red-600 bg-red-50/20'
              : 'border-slate-300 focus-visible:outline-[#0F766E] bg-white'
          } ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
        {!error && effectiveHelper && (
          <p id={helperId} className="text-xs text-slate-500">
            {effectiveHelper}
          </p>
        )}
      </div>
    );
  },
);

TextField.displayName = 'TextField';
