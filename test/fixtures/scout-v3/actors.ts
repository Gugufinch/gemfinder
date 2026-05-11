import type { AuthUserRecord } from '@/lib/gemfinder/types';

const NOW = '2026-01-01T00:00:00Z';

export function adminActor(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    userId: 'test-admin-001',
    email: 'admin@test.local',
    passwordHash: 'test-hash',
    role: 'admin',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function editorActor(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    userId: 'test-editor-001',
    email: 'editor@test.local',
    passwordHash: 'test-hash',
    role: 'editor',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function viewerActor(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    userId: 'test-viewer-001',
    email: 'viewer@test.local',
    passwordHash: 'test-hash',
    role: 'viewer',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
