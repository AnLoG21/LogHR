'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@loghr.local');
  const [password, setPassword] = useState('admin123');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [brandName, setBrandName] = useState('LogHR');

  useEffect(() => {
    if (!loading && user) router.replace('/candidates');
  }, [loading, user, router]);

  useEffect(() => {
    api<any>('/branding')
      .then((b) => {
        if (b?.companyName) setBrandName(b.companyName);
        if (typeof document !== 'undefined' && b?.primaryColor) {
          document.documentElement.style.setProperty('--brand-primary', b.primaryColor);
        }
        if (typeof document !== 'undefined' && b?.secondaryColor) {
          document.documentElement.style.setProperty('--brand-secondary', b.secondaryColor);
        }
      })
      .catch(() => undefined);
  }, []);

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
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>{brandName}</div>
            <div style={{ fontSize: 15, color: '#8a9199', marginTop: 8 }}>ATS для подбора персонала</div>
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
          <svg width="56" height="56" viewBox="0 0 40 40">
            <defs>
              <linearGradient id="lhlogin" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#5eead4" />
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="32" height="32" rx="8" fill="url(#lhlogin)" />
            <path d="M13 14h3.8v8.5H27V26H13V14z" fill="#0f2744" />
          </svg>
          <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.02em' }}>{brandName}</span>
        </div>
      </section>
    </div>
  );
}
