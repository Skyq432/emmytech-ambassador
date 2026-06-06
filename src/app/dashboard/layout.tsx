import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  const role = profile?.role || 'ambassador';

  if (role === 'ambassador') {
    const { data: ambassador } = await supabase
      .from('ambassadors')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!ambassador) {
      redirect('/auth/login');
    }

    if (ambassador.status === 'suspended') {
      redirect('/account-suspended');
    }

    if (ambassador.status === 'deleted') {
      redirect('/auth/login');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardSidebar role={role} user={user} />

      <div className="flex min-h-screen flex-col lg:ml-64">
        <DashboardHeader user={user} profile={profile} />

        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}