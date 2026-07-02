'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CreditCard,
  Save,
  ShieldCheck,
  Building2,
  User,
  Hash,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface PayoutAccount {
  id: string;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
}

export default function PayoutAccountPage() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchPayoutAccount();
  }, []);

  async function fetchPayoutAccount() {
    setLoading(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('ambassadors')
        .select('id, bank_name, bank_account_number, bank_account_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAccount(data);
        setBankName(data.bank_name || '');
        setAccountNumber(data.bank_account_number || '');
        setAccountName(data.bank_account_name || '');
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Unable to load payout account.',
      });
    } finally {
      setLoading(false);
    }
  }

  async function savePayoutAccount() {
    if (!account) return;

    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      setMessage({
        type: 'error',
        text: 'Please complete all payout account fields.',
      });
      return;
    }

    if (accountNumber.trim().length < 10) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid account number.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('ambassadors')
        .update({
          bank_name: bankName.trim(),
          bank_account_number: accountNumber.trim(),
          bank_account_name: accountName.trim(),
        })
        .eq('id', account.id);

      if (error) throw error;

      setMessage({
        type: 'success',
        text: 'Payout account updated successfully.',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Unable to save payout account.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emmy-primary" />
      </div>
    );
  }

  const isComplete =
    bankName.trim() && accountNumber.trim() && accountName.trim();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payout Account</h1>
        <p className="text-muted-foreground">
          Add your bank account details so EmmyTech can process your commission
          and incentive payments.
        </p>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emmy-primary" />
            Bank Account Details
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">
                  Secure payout information
                </p>
                <p className="mt-1 text-sm text-blue-700">
                  Your payout details are used only for commission and incentive
                  payments from EmmyTech. Please ensure the information is
                  accurate.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Bank Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. Access Bank, GTBank, First Bank"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Account Number</label>
              <div className="relative">
                <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={accountNumber}
                  onChange={(e) =>
                    setAccountNumber(e.target.value.replace(/\D/g, ''))
                  }
                  placeholder="10 digit account number"
                  className="pl-9"
                  maxLength={10}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Account Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Account holder name"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              {isComplete ? (
                <p className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle className="h-4 w-4" />
                  Payout account is complete.
                </p>
              ) : (
                <p className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  Complete your payout details to receive payments.
                </p>
              )}
            </div>

            <Button onClick={savePayoutAccount} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Payout Account'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}