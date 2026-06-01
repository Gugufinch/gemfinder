import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminUsersPanel from './AdminUsersPanel';
import { getAuthUserById } from '@/lib/gemfinder/auth-store';
import { verifySession } from '@/lib/gemfinder/session';

export const dynamic = 'force-dynamic';

export default async function ARAdminPage() {
  try {
    const cookieStore = await cookies();
    // Audit #2 follow-up: verify the signed session cookie (see app/ar/page.tsx).
    const userId = verifySession(cookieStore.get('ar_user')?.value)?.uid || '';
    if (!userId) redirect('/ar');

    const actor = await getAuthUserById(userId);
    if (!actor || !actor.active || actor.role !== 'admin') {
      redirect('/ar');
    }

    return <AdminUsersPanel actorEmail={actor.email} />;
  } catch (error) {
    console.error('[gemfinder] /ar/admin auth gate failed', error);
    redirect('/ar');
  }
}
