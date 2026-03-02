'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type AuthMode = 'login' | 'signup';

type AuthResponse = {
  ok?: boolean;
  error?: string;
};

type ARLoginProps = {
  initialMode?: AuthMode;
  initialResetToken?: string;
};

export default function ARLogin({ initialMode = 'login', initialResetToken = '' }: ARLoginProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [resetToken, setResetToken] = useState(initialResetToken);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('resetToken') || '';
      const urlMode = params.get('mode');
      if (urlMode === 'signup' || urlMode === 'login') {
        setMode(urlMode);
      }
      if (token) {
        setResetToken(token);
        setMode('login');
        setForgotMode(false);
      }
    } catch {}
  }, []);

  const isResetTokenMode = useMemo(() => !!resetToken, [resetToken]);

  const requestPasswordReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const res = await fetch('/api/ar/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; previewLink?: string };
      if (!res.ok) {
        setError(data.error || 'Could not start reset');
        return;
      }
      setStatus(data.message || 'Reset requested');
      if (data.previewLink) {
        setStatus(`Reset requested. Dev link: ${data.previewLink}`);
      }
    } catch {
      setError('Network error while requesting reset');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (isResetTokenMode) {
      if (!password) return;
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      setLoading(true);
      setError('');
      setStatus('');
      try {
        const res = await fetch('/api/ar/auth/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, password })
        });
        const data = (await res.json().catch(() => ({}))) as AuthResponse;
        if (!res.ok) {
          setError(data.error || 'Password reset failed');
          return;
        }
        window.location.href = '/ar';
      } catch {
        setError('Network error while resetting password');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!cleanEmail || !password) return;

    if (mode === 'signup') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setLoading(true);
    setError('');
    setStatus('');

    try {
      const endpoint = mode === 'signup' ? '/api/ar/auth/signup' : '/api/ar/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = (await res.json().catch(() => ({}))) as AuthResponse;
      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        return;
      }
      window.location.href = '/ar';
    } catch {
      setError('Network error while signing in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f6fb',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#fff',
          border: '1px solid #e3e9f3',
          borderRadius: 16,
          boxShadow: '0 14px 30px rgba(30,41,59,0.08)',
          padding: 24
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 4, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', marginBottom: 6 }}>
          Gem Finder
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, color: '#111827' }}>{mode === 'signup' ? 'Create account' : 'Log in'}</h1>
        <p style={{ margin: '0 0 18px', color: '#5f6b84', fontSize: 13 }}>
          {mode === 'signup' ? 'Create your own workspace login.' : 'Log in to your personal workspace.'}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setStatus('');
              setForgotMode(false);
              try {
                window.history.replaceState(null, '', '/ar?mode=login');
              } catch {}
            }}
            style={{
              flex: 1,
              border: '1px solid #d6deee',
              borderRadius: 10,
              padding: '8px 10px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === 'login' ? '#2563eb' : '#fff',
              color: mode === 'login' ? '#fff' : '#4a5a78'
            }}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError('');
              setStatus('');
              setForgotMode(false);
              try {
                window.history.replaceState(null, '', '/ar?mode=signup');
              } catch {}
            }}
            style={{
              flex: 1,
              border: '1px solid #d6deee',
              borderRadius: 10,
              padding: '8px 10px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === 'signup' ? '#2563eb' : '#fff',
              color: mode === 'signup' ? '#fff' : '#4a5a78'
            }}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          {!isResetTokenMode ? (
          <input
            type="email"
            required
            placeholder="name@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{
              width: '100%',
              border: '1px solid #cfd8e8',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
              outline: 'none',
              color: '#111827',
              boxSizing: 'border-box'
            }}
          />
          ) : null}
          <input
            type="password"
            required
            placeholder={isResetTokenMode ? 'New password' : 'Password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{
              width: '100%',
              border: '1px solid #cfd8e8',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 14,
              outline: 'none',
              color: '#111827',
              boxSizing: 'border-box'
            }}
          />
          {mode === 'signup' || isResetTokenMode ? (
            <input
              type="password"
              required
              placeholder={isResetTokenMode ? 'Confirm new password' : 'Confirm password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              style={{
                width: '100%',
                border: '1px solid #cfd8e8',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
                outline: 'none',
                color: '#111827',
                boxSizing: 'border-box'
              }}
            />
          ) : null}
          <button
            type="submit"
            disabled={loading}
            style={{
              border: 'none',
              borderRadius: 10,
              padding: '10px 12px',
              background: loading ? '#8cb0f7' : '#2563eb',
              color: '#fff',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer'
            }}
          >
            {loading ? 'Working...' : isResetTokenMode ? 'Reset password' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
        </form>

        {!isResetTokenMode ? (
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => { setForgotMode(!forgotMode); setError(''); setStatus(''); }}
              style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', fontSize: 12, padding: 0 }}
            >
              {forgotMode ? 'Hide reset' : 'Forgot password?'}
            </button>
          </div>
        ) : null}

        {forgotMode && !isResetTokenMode ? (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            <button
              type="button"
              onClick={requestPasswordReset}
              disabled={loading || !email.trim()}
              style={{
                border: '1px solid #cfd8e8',
                borderRadius: 10,
                padding: '9px 12px',
                background: '#fff',
                color: '#4a5a78',
                cursor: loading ? 'wait' : 'pointer',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              {loading ? 'Sending reset...' : 'Send reset link'}
            </button>
            <div style={{ fontSize: 12, color: '#7a87a3' }}>
              Enter your email above, then click send reset link.
            </div>
          </div>
        ) : null}

        {!isResetTokenMode ? (
          <div style={{ marginTop: 8, fontSize: 11, color: '#7a87a3' }}>
            If tabs do not switch, use direct links:
            {' '}
            <a href="/ar?mode=login" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>Log in</a>
            {' · '}
            <a href="/ar?mode=signup" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>Sign up</a>
          </div>
        ) : null}

        {status ? (
          <div style={{ marginTop: 12, fontSize: 12, color: '#1f9d6a' }}>{status}</div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 12, fontSize: 12, color: '#dc3f35' }}>{error}</div>
        ) : null}
      </div>
    </div>
  );
}
