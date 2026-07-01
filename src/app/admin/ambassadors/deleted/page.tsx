'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  RotateCcw,
  Trash2,
  UserX,
  Mail,
  Calendar,
  Loader2,
} from 'lucide-react';
import { formatDate, formatNumber, formatCurrency } from '@/lib/utils';

interface DeletedAmbassador {
  id: string;
  user_id: string;
  ambassador_tag: string;
  referral_code: string;
  total_points: number;
  total_leads: number;
  total_conversions: number;
  total_cashed_out: number;
  available_balance: number;
  status: string;
  created_at: string;
  users?: {
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
}

export default function DeletedAmbassadorsPage() {
  const supabase = createClient();

  const [ambassadors, setAmbassadors] = useState<DeletedAmbassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDeletedAmbassadors();
  }, []);

  async function fetchDeletedAmbassadors() {
    setLoading(true);

    const { data, error } = await supabase
      .from('ambassadors')
      .select(
        `
        *,
        users (
          name,
          email,
          avatar_url
        )
      `
      )
      .eq('status', 'deleted')
      .order('created_at', { ascending: false });

    if (error) {
      alert(error.message);
      setAmbassadors([]);
    } else {
      setAmbassadors(data || []);
    }

    setLoading(false);
  }

  async function restoreAmbassador(ambassador: DeletedAmbassador) {
    const confirmed = confirm(
      `Restore ${ambassador.users?.name || ambassador.ambassador_tag}?\n\nThis will make the ambassador active again and their dashboard/referral history will be restored.`
    );

    if (!confirmed) return;

    setActionLoadingId(ambassador.id);

    const { error } = await supabase
      .from('ambassadors')
      .update({
        status: 'active',
      })
      .eq('id', ambassador.id);

    if (error) {
      alert(error.message);
    } else {
      await fetchDeletedAmbassadors();
    }

    setActionLoadingId(null);
  }

  async function hardDeleteAmbassador(ambassador: DeletedAmbassador) {
    const confirmed = confirm(
      `HARD DELETE ${ambassador.users?.name || ambassador.ambassador_tag}?\n\nThis will permanently delete this ambassador and all related data.\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    const finalConfirm = confirm(
      'Final confirmation: permanently erase this ambassador and all related records?'
    );

    if (!finalConfirm) return;

    setActionLoadingId(ambassador.id);

    const { error } = await supabase.rpc('hard_delete_ambassador', {
      p_ambassador_id: ambassador.id,
    });

    if (error) {
      alert(error.message);
    } else {
      await fetchDeletedAmbassadors();
    }

    setActionLoadingId(null);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emmy-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/admin/ambassadors"
            className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Ambassadors
          </Link>

          <h1 className="text-3xl font-bold tracking-tight">
            Deleted Ambassadors
          </h1>

          <p className="text-muted-foreground">
            Restore soft-deleted ambassadors or permanently delete their records.
          </p>
        </div>

        <Badge variant="secondary" className="w-fit">
          {ambassadors.length} deleted
        </Badge>
      </div>

      {ambassadors.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <UserX className="mx-auto mb-4 h-14 w-14 text-slate-300" />
            <h3 className="text-lg font-semibold text-slate-900">
              No deleted ambassadors
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Soft-deleted ambassadors will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ambassadors.map((ambassador) => {
            const loadingAction = actionLoadingId === ambassador.id;

            return (
              <Card key={ambassador.id} className="overflow-hidden">
                <CardContent className="p-5">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                      {ambassador.users?.avatar_url ? (
                        <img
                          src={ambassador.users.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        ambassador.users?.name?.[0]?.toUpperCase() || 'A'
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">
                        {ambassador.users?.name || 'Unknown Ambassador'}
                      </h3>

                      <p className="truncate text-xs text-muted-foreground">
                        {ambassador.ambassador_tag}
                      </p>

                      <div className="mt-2">
                        <Badge variant="secondary">deleted</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">
                        {ambassador.users?.email || 'No email'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-500">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(ambassador.created_at)}</span>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Points</p>
                      <p className="font-bold">
                        {formatNumber(ambassador.total_points || 0)}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Leads</p>
                      <p className="font-bold">
                        {ambassador.total_leads || 0}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">
                        Conversions
                      </p>
                      <p className="font-bold">
                        {ambassador.total_conversions || 0}
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="font-bold">
                        {formatCurrency(ambassador.available_balance || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-2">
                    <Button
                      onClick={() => restoreAmbassador(ambassador)}
                      disabled={loadingAction}
                      className="gap-2"
                    >
                      {loadingAction ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Restore Ambassador
                    </Button>

                    <Button
                      variant="danger"
                      onClick={() => hardDeleteAmbassador(ambassador)}
                      disabled={loadingAction}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Hard Delete Permanently
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}