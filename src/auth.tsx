import { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, Zap } from 'lucide-react';
import App from './App';

export default function AuthGate() {
  const [auth, setAuth] = useState<{ required: boolean; authenticated: boolean } | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/auth'); const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAuth(data); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect. Check the server and try again.'); }
  }, []);
  useEffect(() => {
    void check();
    const expired = () => { setAuth({ required: true, authenticated: false }); setError('Your session expired. Sign in to keep going.'); };
    window.addEventListener('streakify:sign-in', expired); return () => window.removeEventListener('streakify:sign-in', expired);
  }, [check]);
  async function signOut() {
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logout: true }) });
      if (!response.ok) throw new Error('Could not sign out. Try again.');
      setAuth({ required: true, authenticated: false });
    } catch (e) { alert(e instanceof Error ? e.message : 'Could not sign out.'); }
  }
  if (auth?.authenticated) return <App onSignOut={auth.required ? signOut : undefined} />;
  return <div className="loading-screen"><span className="brand-mark"><Zap size={27} fill="currentColor" /></span>{!auth ? <><h1>Streakify</h1><p role={error ? 'alert' : 'status'}>{error || 'Opening your workspace…'}</p>{error && <button className="button primary" onClick={() => void check()}>Try again</button>}</> : <form className="login-card" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setAuth({ required: true, authenticated: true }); setPassword(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed. Try again.'); }
    finally { setBusy(false); }
  }}><h1>A little better, every day.</h1><p>Sign in to your personal habit space.</p><label>Workspace password<input type="password" required autoFocus autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="error-banner" role="alert">{error}</p>}<button className="button primary" disabled={busy}><LockKeyhole size={16} />{busy ? 'Opening your space…' : 'Open my workspace'}</button></form>}</div>;
}
