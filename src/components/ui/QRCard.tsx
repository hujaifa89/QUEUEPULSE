import React from 'react';
import { QRCodeSVG } from './QRCodeSVG';
import { Button } from './Button';

export interface QRCardProps {
  queueName: string;
  tokenNumber: number;
  date: string;
  publicCode: string;
  origin?: string;
  onClose?: () => void;
  className?: string;
}

export const QRCard: React.FC<QRCardProps> = ({
  queueName,
  tokenNumber,
  date,
  publicCode,
  origin,
  onClose,
  className = '',
}) => {
  const currentOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : 'https://queuepulse.app');
  const targetUrl = `${currentOrigin}/t/${publicCode}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`flex flex-col items-center max-w-sm w-full mx-auto ${className}`}>
      {/* Printable Area */}
      <div
        id="printable-token-slip"
        className="w-full bg-white border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center space-y-4 shadow-sm"
      >
        <div className="border-b border-slate-100 pb-3">
          <div className="text-xs uppercase tracking-widest text-[#0F766E] font-bold">
            QueuePulse Token
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">{queueName}</h2>
          <div className="text-xs text-slate-500">{date}</div>
        </div>

        {/* Big Serial Number */}
        <div className="py-2">
          <div className="text-xs font-semibold uppercase text-slate-400">Your Serial</div>
          <div className="text-6xl font-black text-slate-900 font-mono tracking-tight my-1">
            #{tokenNumber}
          </div>
        </div>

        {/* QR Code */}
        <div className="flex justify-center p-3 bg-slate-50 rounded-xl border border-slate-100">
          <QRCodeSVG
            value={targetUrl}
            size={160}
            level="M"
            includeMargin={true}
            aria-label={`QR code for token serial #${tokenNumber}`}
          />
        </div>

        {/* Short URL / Instructions */}
        <div className="space-y-1">
          <p className="text-xs text-slate-500 font-medium">Scan QR or open this link to track live:</p>
          <p className="text-xs font-mono font-bold text-slate-700 break-all select-all">
            {targetUrl}
          </p>
        </div>

        <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
          No app & no login required &middot; Stay home until your turn is near
        </div>
      </div>

      {/* Action Buttons (Hidden when printing via print:hidden) */}
      <div className="flex gap-3 w-full mt-4 print:hidden">
        {onClose && (
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
        )}
        <Button variant="primary" onClick={handlePrint} className="flex-1">
          Print Slip
        </Button>
      </div>

      {/* Print-specific CSS */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-token-slip,
          #printable-token-slip * {
            visibility: visible;
          }
          #printable-token-slip {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none;
            box-shadow: none;
            padding: 1cm;
          }
        }
      `}</style>
    </div>
  );
};
