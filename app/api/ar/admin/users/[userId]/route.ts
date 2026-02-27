import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getArAuthUserById, updateArUserByAdmin } from '@/lib/bonafied/repository';

const patchSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(120).optional()
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const adminUserId = req.cookies.get('ar_user')?.value || '';
  const actor = await getArAuthUserById(adminUserId);
  if (!actor || !actor.active) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid patch payload', details: parsed.error.issues }, { status: 400 });
  }

  const { userId } = await ctx.params;
  const result = await updateArUserByAdmin(actor.userId, userId, parsed.data);
  if (!result.ok) {
    const status = result.error === 'User not found' ? 404 : result.error.includes('Admin') ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
