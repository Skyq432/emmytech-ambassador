import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  const role = profile?.role || 'ambassador';
  if (role !== 'admin') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-[#f6f8fc]">
      <DashboardSidebar role={role} user={profile || user} />

      <div className="ambassador-shell-main flex min-h-screen flex-col">
        <DashboardHeader user={user} profile={profile} />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
