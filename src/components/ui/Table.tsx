import React from 'react';

export interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className = '' }) => {
  return (
    <div className={`w-full overflow-x-auto rounded-lg border border-slate-200 ${className}`}>
      <table className="w-full text-left text-sm text-slate-700 divide-y divide-slate-200">
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <thead className={`bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 ${className}`}>{children}</thead>;
};

export const TableBody: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <tbody className={`divide-y divide-slate-100 bg-white ${className}`}>{children}</tbody>;
};

export const TableRow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <tr className={`hover:bg-slate-50/75 transition-colors ${className}`}>{children}</tr>;
};

export const TableHead: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <th scope="col" className={`px-4 py-3 font-semibold ${className}`}>{children}</th>;
};

export const TableCell: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <td className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</td>;
};
