'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Button, TextField, Banner } from '@/components/ui';

export default function ResetConfirmPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setGeneralError('');

    // SEC-01: minimum password length 10
    if (password.length < 10) {
      setPasswordError('Password must be at least 10 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setGeneralError(error.message);
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      setIsLoading(false);
    } catch {
      setGeneralError('Failed to update password. Please request a new reset link.');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Set New Password
          </h1>
          <p className="text-sm text-slate-600">
            Please enter a strong password with at least 10 characters.
          </p>
        </div>

        {isSuccess ? (
          <div className="space-y-6">
            <Banner variant="success" title="Password Updated">
              Your password has been changed successfully. You can now sign in with your new credentials.
            </Banner>
            <Button
              variant="primary"
              onClick={() => router.push('/login')}
              className="w-full"
            >
              Sign In Now
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {generalError && (
              <Banner variant="danger" title="Error">
                {generalError}
              </Banner>
            )}

            <TextField
              label="New Password"
              type="password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (e.target.value.length >= 10) setPasswordError('');
              }}
              error={passwordError}
              helperText="Minimum 10 characters required (SEC-01)"
              placeholder="••••••••••"
              disabled={isLoading}
            />

            <TextField
              label="Confirm New Password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••"
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="w-full"
            >
              Update Password
            </Button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
