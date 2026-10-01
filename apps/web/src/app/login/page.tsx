'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Icon } from '@/components/ui';

const COMPANY_NAME = 'ТАЙМЫР ИНВЕСТ';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@loghr.local');
  const [password, setPassword] = useState('admin123');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/candidates');
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      router.push('/candidates');
    } catch (err: any) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  }

  if (!loading && user) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--sk-muted)' }}>
        Переход…
      </div>
    );
  }

  return (
    <div className="login-page">
      <section className="login-form-pane">
        <form onSubmit={onSubmit} className="login-form-wrap">
          <div style={{ marginBottom: 40, display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={48} height={48} style={{ display: 'block' }} />
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{COMPANY_NAME}</div>
              <div style={{ fontSize: 14, color: '#8a9199', marginTop: 6 }}>ATS для подбора персонала</div>
            </div>
          </div>

          <label className="login-field">
            <span className="login-field-label">Логин <span>*</span></span>
            <div className="login-field-box">
              <input
                className="sk-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="username"
              />
            </div>
          </label>

          <label className="login-field">
            <span className="login-field-label">Пароль <span>*</span></span>
            <div className="login-field-box">
              <input
                className="sk-input"
                style={{ paddingRight: 40 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? 'text' : 'password'}
                required
                autoComplete="current-password"
              />
              <button type="button" className="login-eye" onClick={() => setShowPass((v) => !v)} tabIndex={-1}>
                <Icon name={showPass ? 'eye' : 'eye-off'} className="w-5 h-5" />
              </button>
            </div>
          </label>

          {error ? <div style={{ color: '#e25555', fontSize: 14, marginBottom: 12 }}>{error}</div> : null}

          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? 'Вход…' : 'Войти'}
          </button>

          <button type="button" className="login-forgot">
            Забыли пароль?
          </button>
        </form>

        <p className="login-legal">
          Вход только для авторизованных пользователей. Для доступа к этому серверу у вас должно быть разрешение.
          Попытка получить доступ к серверу и/или использовать его без разрешения будет иметь юридические последствия.
          Пользовательская активность записывается.
        </p>
      </section>

      <section className="login-geo" aria-hidden>
        <div className="login-geo-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={88} height={88} style={{ display: 'block', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.25))' }} />
          <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{COMPANY_NAME}</span>
        </div>
      </section>
    </div>
  );
}
