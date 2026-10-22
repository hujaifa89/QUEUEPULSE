import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto text-2xl font-bold">
          403
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Access Forbidden</h1>
          <p className="text-sm text-slate-600">
            You do not have permission to access this resource, or your account may be deactivated.
          </p>
        </div>
        <div className="flex flex-col gap-3 pt-2">
          <Link
            href="/login"
            className="w-full inline-flex items-center justify-center px-4 py-2 min-h-[44px] rounded-lg font-medium text-white bg-[#0F766E] hover:bg-[#0D655E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] transition-colors"
          >
            Return to Login
          </Link>
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center px-4 py-2 min-h-[44px] rounded-lg font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
