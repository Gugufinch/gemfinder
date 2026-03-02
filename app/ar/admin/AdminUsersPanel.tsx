'use client';

import { useEffect, useState } from 'react';

type ArUser = {
  userId: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function AdminUsersPanel({ actorEmail }: { actorEmail: string }) {
  const [users, setUsers] = useState<ArUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [password, setPassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ar/admin/users', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not load users');
        return;
      }
      setUsers(data.users || []);
    } catch {
      setError('Network error loading users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createUser = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    setCreateLoading(true);
    setError('');
    setStatus('');
    setGeneratedPassword('');
    try {
      const res = await fetch('/api/ar/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          role,
          password: password.trim() || undefined,
          active: true
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not create user');
        return;
      }
      setEmail('');
      setPassword('');
      setStatus(`Created ${cleanEmail}`);
      if (data.generatedPassword) setGeneratedPassword(String(data.generatedPassword));
      await load();
    } catch {
      setError('Network error creating user');
    } finally {
      setCreateLoading(false);
    }
  };

  const patchUser = async (userId: string, patch: Record<string, unknown>) => {
    setError('');
    setStatus('');
    try {
      const res = await fetch(`/api/ar/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not update user');
        return;
      }
      setStatus('User updated');
      await load();
    } catch {
      setError('Network error updating user');
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/ar/auth/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/ar';
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f6fb',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#111827'
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/gemfinder-logo.png" alt="GEMFINDER logo" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              <div style={{ fontSize: 11, letterSpacing: 4, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>GEMFINDER Admin</div>
            </div>
            <h1 style={{ margin: '6px 0', fontSize: 28 }}>Team Users</h1>
            <div style={{ fontSize: 13, color: '#5f6b84' }}>Signed in as {actorEmail}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/ar" style={{ textDecoration: 'none', border: '1px solid #d2dced', borderRadius: 10, padding: '8px 12px', color: '#4a5a78', fontSize: 13, fontWeight: 600 }}>Back to App</a>
            <button onClick={signOut} style={{ border: '1px solid #d2dced', borderRadius: 10, padding: '8px 12px', background: '#fff', color: '#4a5a78', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>

        <div style={{ marginTop: 20, background: '#fff', border: '1px solid #e3e9f3', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Create User</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8 }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new.user@company.com" style={{ border: '1px solid #cfd8e8', borderRadius: 10, padding: '9px 11px', fontSize: 13 }} />
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'editor' | 'viewer')} style={{ border: '1px solid #cfd8e8', borderRadius: 10, padding: '9px 11px', fontSize: 13 }}>
              <option value="admin">admin</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temp password (optional)" style={{ border: '1px solid #cfd8e8', borderRadius: 10, padding: '9px 11px', fontSize: 13 }} />
            <button onClick={createUser} disabled={createLoading || !email.trim()} style={{ border: 'none', borderRadius: 10, padding: '9px 14px', background: createLoading ? '#8cb0f7' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: createLoading ? 'wait' : 'pointer' }}>
              {createLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
          {generatedPassword ? <div style={{ marginTop: 10, fontSize: 12, color: '#5f6b84' }}>Generated password: <code>{generatedPassword}</code></div> : null}
        </div>

        {error ? <div style={{ marginTop: 12, color: '#dc3f35', fontSize: 13 }}>{error}</div> : null}
        {status ? <div style={{ marginTop: 12, color: '#1f9d6a', fontSize: 13 }}>{status}</div> : null}

        <div style={{ marginTop: 18, background: '#fff', border: '1px solid #e3e9f3', borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Users</div>
          {loading ? (
            <div style={{ fontSize: 13, color: '#5f6b84' }}>Loading users...</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {users.map((user) => (
                <div key={user.userId} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto', gap: 8, alignItems: 'center', border: '1px solid #edf1f8', borderRadius: 10, padding: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{user.email}</div>
                    <div style={{ fontSize: 11, color: '#7a87a3' }}>{user.userId}</div>
                  </div>
                  <select value={user.role} onChange={(e) => patchUser(user.userId, { role: e.target.value })} style={{ border: '1px solid #cfd8e8', borderRadius: 8, padding: '7px 9px', fontSize: 12 }}>
                    <option value="admin">admin</option>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <label style={{ fontSize: 12, color: '#4a5a78', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={user.active} onChange={(e) => patchUser(user.userId, { active: e.target.checked })} />
                    active
                  </label>
                  <button
                    onClick={() => {
                      const pw = window.prompt(`Set new password for ${user.email} (min 8 chars):`, '');
                      if (!pw) return;
                      patchUser(user.userId, { password: pw });
                    }}
                    style={{ border: '1px solid #d2dced', borderRadius: 8, padding: '7px 10px', background: '#fff', color: '#4a5a78', cursor: 'pointer', fontSize: 12 }}
                  >
                    Reset Password
                  </button>
                  <div style={{ fontSize: 11, color: '#7a87a3' }}>{user.active ? 'active' : 'inactive'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
