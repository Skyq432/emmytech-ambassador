import { Ban } from 'lucide-react';

export default function AccountSuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
            <Ban className="h-8 w-8 text-red-600" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          Account Suspended
        </h1>

        <p className="mt-3 text-slate-600">
          Your ambassador account has been suspended by an administrator.
        </p>

        <p className="mt-2 text-sm text-slate-500">
          If you believe this is a mistake, please contact support or the EmmyTech team.
        </p>

        <div className="mt-6">
          <a
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-xl bg-emmy-primary px-5 py-3 text-white font-medium"
          >
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}