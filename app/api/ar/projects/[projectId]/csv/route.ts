import { NextRequest, NextResponse } from 'next/server';
import { listWorkspaceProjects } from '@/lib/gemfinder/project-store';

function bucketGenre(g: string) {
  const l = String(g || '').toLowerCase();
  if (!l) return 'Other';
  if (/country|americana|bluegrass/.test(l)) return 'Country';
  if (/hip.?hop|rap/.test(l)) return 'Hip Hop';
  if (/r&b|soul|neo.?soul/.test(l)) return 'R&B / Soul';
  if (/^indie/.test(l)) return 'Indie';
  if (/folk/.test(l)) return 'Folk';
  if (/punk|emo|hardcore/.test(l)) return 'Punk / Emo';
  if (/rock|grunge|metal/.test(l)) return 'Rock';
  if (/electronic|edm|house|techno|hyperpop|synth/.test(l)) return 'Electronic';
  if (/pop/.test(l)) return 'Pop';
  if (/jazz/.test(l)) return 'Jazz';
  if (/christian|gospel|worship/.test(l)) return 'Christian';
  if (/latin|reggaeton/.test(l)) return 'Latin';
  if (/singer.?songwriter/.test(l)) return 'Singer-Songwriter';
  if (/^alt/.test(l)) return 'Alternative';
  return 'Other';
}

function canonicalArtistName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(ft|feat|featuring)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function spotifyUrl(name: string) {
  const clean = String(name || '').trim();
  if (!clean) return 'https://open.spotify.com/';
  return `https://open.spotify.com/search/${encodeURIComponent(clean)}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!projectId || !token) {
    return new NextResponse('Missing project or token', { status: 400 });
  }

  const projects = await listWorkspaceProjects();
  const project = (projects as any[]).find((item) => String(item?.id || '') === String(projectId));
  if (!project) {
    return new NextResponse('Project not found', { status: 404 });
  }

  const savedToken = String(project?.settings?.publicCsvToken || '');
  if (!savedToken || savedToken !== token) {
    return new NextResponse('Invalid token', { status: 403 });
  }

  const artists = Array.isArray(project?.artists) ? project.artists : [];
  const internalSet = new Set(
    Array.isArray(project?.internalRoster?.names)
      ? project.internalRoster.names.map((name: string) => canonicalArtistName(name))
      : []
  );
  const rows = [[
    'Artist',
    'Owner',
    'Genre',
    'Genre Bucket',
    'Monthly Listeners',
    'Hit Track',
    'Email',
    'Social',
    'Location',
    'Stage',
    'Follow-Up',
    'On Platform',
    'Spotify URL'
  ]];

  for (const artist of artists) {
    const name = String(artist?.n || '');
    const pipeline = project?.pipeline?.[name] || {};
    rows.push([
      name,
      project?.assignments?.[name] || '',
      artist?.g || '',
      bucketGenre(String(artist?.g || '')),
      artist?.l || '',
      artist?.h || '',
      artist?.e || '',
      artist?.soc || '',
      artist?.loc || '',
      pipeline.stage || 'prospect',
      project?.followUps?.[name] || '',
      internalSet.has(canonicalArtistName(name)) ? 'TRUE' : 'FALSE',
      spotifyUrl(name)
    ]);
  }

  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `inline; filename="${String(project?.name || 'project').replace(/\s+/g, '_')}.csv"`,
      'cache-control': 'no-store'
    }
  });
}
