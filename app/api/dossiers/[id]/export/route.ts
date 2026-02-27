import { NextRequest, NextResponse } from 'next/server';
import { exportDossier } from '@/lib/bonafied/repository';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'demo-user';
  const format = searchParams.get('format') === 'text' ? 'text' : 'markdown';

  const content = await exportDossier(userId, id, format);
  if (!content) {
    return NextResponse.json({ error: 'Dossier not found' }, { status: 404 });
  }

  const filename = `dossier-${id}.${format === 'markdown' ? 'md' : 'txt'}`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': format === 'markdown' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename=\"${filename}\"`
    }
  });
}
