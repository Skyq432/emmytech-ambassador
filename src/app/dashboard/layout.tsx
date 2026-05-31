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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  const role = profile?.role || 'ambassador';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <DashboardSidebar role={role} user={user} />
      <div className="flex-1 flex flex-col ml-64">
        <DashboardHeader user={user} profile={profile} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}