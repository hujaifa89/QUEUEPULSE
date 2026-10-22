'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { Button, TextField, Banner } from '@/components/ui';

export default function ResetRequestPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/reset/confirm`;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setIsSubmitted(true);
      setIsLoading(false);
    } catch {
      setErrorMessage('Failed to send reset link. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Reset Password
          </h1>
          <p className="text-sm text-slate-600">
            Enter your account email to receive a password reset link.
          </p>
        </div>

        {isSubmitted ? (
          <div className="space-y-6">
            <Banner variant="success" title="Check your inbox">
              If an account with this email exists, a password reset link has been sent. Follow the link in the email to set your new password.
            </Banner>
            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center px-4 py-2 min-h-[44px] rounded-lg font-medium text-white bg-[#0F766E] hover:bg-[#0D655E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <Banner variant="danger" title="Error">
                {errorMessage}
              </Banner>
            )}

            <TextField
              label="Account Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@organization.com"
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="w-full"
            >
              Send Reset Link
            </Button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancel and return to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
