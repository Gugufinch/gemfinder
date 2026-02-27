import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminUsersPanel from './AdminUsersPanel';
import { getArAuthUserById } from '@/lib/bonafied/repository';

export default async function ARAdminPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('ar_user')?.value || '';
  if (!userId) redirect('/ar');

  const actor = await getArAuthUserById(userId);
  if (!actor || !actor.active || actor.role !== 'admin') {
    redirect('/ar');
  }

  return <AdminUsersPanel actorEmail={actor.email} />;
}
