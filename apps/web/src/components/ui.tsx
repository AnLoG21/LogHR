'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { forwardRef, useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { NAV_GROUPS, ROLE_LABELS, SystemRole } from '@skillaz/shared';
import { useAuth } from '@/lib/auth';
import clsx from 'clsx';

function Icon({ name, className }: { name: string; className?: string }) {
  const sizeMatch = className?.match(/w-\[?(\d+)/);
  const size = sizeMatch ? Number(sizeMatch[1]) : (className?.includes('w-4') ? 16 : className?.includes('w-3') ? 14 : className?.includes('w-5') ? 20 : 18);
  const c = className;
  const style = { width: size, height: size, flexShrink: 0 as const };
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style };
  switch (name) {
    case 'users':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'briefcase':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><path d="M2 12h20" /></svg>;
    case 'file':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
    case 'building':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>;
    case 'check':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>;
    case 'quiz':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M9 11h6" /><path d="M9 15h4" /><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
    case 'flow':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10" /><path d="M5 8v4a4 4 0 0 0 4 4h2a4 4 0 0 1 4 4v2" /></svg>;
    case 'search':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case 'offer':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" /></svg>;
    case 'shield':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /></svg>;
    case 'import':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>;
    case 'globe':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></svg>;
    case 'template':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>;
    case 'settings':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case 'chart':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 17V10" /><path d="M12 17V7" /><path d="M16 17v-4" /></svg>;
    case 'home':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case 'plus':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
    case 'edit':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>;
    case 'comment':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>;
    case 'star':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" /></svg>;
    case 'refresh':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 3v6h-6" /></svg>;
    case 'xls':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13l3 3 5-5" /></svg>;
    case 'list':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>;
    case 'kanban':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="12" rx="1" /><rect x="17" y="3" width="5" height="8" rx="1" /></svg>;
    case 'more':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></svg>;
    case 'eye':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'eye-off':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a21.8 21.8 0 0 1 5.06-5.94" /><path d="M9.9 4.24A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a21.8 21.8 0 0 1-2.16 3.19" /><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" /><path d="M1 1l22 22" /></svg>;
    case 'whatsapp':
      return <svg className={c} viewBox="0 0 24 24" fill="#25D366" stroke="none"><path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2zm0 2a8 8 0 0 1 6.7 12.4l-.3.4.8 2.9-3-.8-.4.2A8 8 0 1 1 12 4zm4.4 9.7c-.2-.1-1.3-.6-1.5-.7s-.3-.1-.5.1-.6.7-.7.8-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.6c-.1-.2 0-.3.1-.5l.4-.4.1-.3c0-.1 0-.3-.1-.4s-.5-1.1-.6-1.5-.4-.3-.5-.3h-.4c-.1 0-.4.1-.6.3s-.8.8-.8 1.9.8 2.2.9 2.3a9.3 9.3 0 0 0 3.4 2.7c1.3.5 1.8.5 2.4.4s1.1-.5 1.2-.9.2-.8.1-.9-.2-.1-.4-.2z" /></svg>;
    case 'demand':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /></svg>;
    case 'profile':
      return <svg className={c} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /><path d="M16 11h4" /><path d="M18 9v4" /></svg>;
    default:
      return <span className={c} />;
  }
}

export { Icon };

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain' }}
      aria-hidden
    />
  );
}

const COMPANY_NAME = 'ТАЙМЫР ИНВЕСТ';

export function AppShell({
  children,
  title,
  subtitle,
  actions,
  flush,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  flush?: boolean;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [openNav, setOpenNav] = useState(false);
  const [menuQ, setMenuQ] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ main: true, tools: true, boards: true, settings: true });

  const menuSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      const isCmdK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л');
      if (isCmdK || (e.key === '/' && !typing)) {
        e.preventDefault();
        setOpenNav(true);
        menuSearchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);


  const groups = useMemo(() => {
    if (!user) return [];
    const q = menuQ.trim().toLowerCase();
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const roleOk = (item.roles as readonly string[]).includes(user.role);
        const textOk = !q || item.label.toLowerCase().includes(q);
        return roleOk && textOk;
      }),
    })).filter((g) => g.items.length > 0);
  }, [user, menuQ]);

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--sk-muted)', background: 'var(--sk-bg)' }}>
        <div style={{ fontSize: 14 }}>Загрузка…</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <button
          className="sk-btn sk-btn-icon app-menu-btn"
          onClick={() => setOpenNav(true)}
          aria-label="Открыть меню"
        >
          <Icon name="list" />
        </button>
        <Link href="/candidates" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <BrandMark />
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }} title="Мой профиль">
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8ecf0', display: 'grid', placeItems: 'center', color: 'var(--sk-muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>
            </span>
            <span style={{ fontWeight: 500 }}>{user.lastName} {user.firstName}</span>
          </Link>
          <div className="app-company" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '1px solid var(--sk-line)' }}>
            <BrandMark size={22} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {COMPANY_NAME}
            </span>
          </div>
          <button
            type="button"
            className="sk-btn sk-btn-outline"
            onClick={() => logout().then(() => router.push('/login'))}
            title="Выйти из системы"
          >
            Выйти
          </button>
        </div>
      </header>

      <div className="app-body">
        {openNav ? (
          <button className="app-sidebar-backdrop" onClick={() => setOpenNav(false)} aria-label="Закрыть меню" />
        ) : null}

        <aside className={clsx('app-sidebar', openNav && 'open')}>
          <div style={{ padding: 12 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sk-muted)', display: 'flex' }}>
                <Icon name="search" className="w-4 h-4" />
              </span>
              <input
                ref={menuSearchRef}
                className="sk-input"
                style={{ paddingLeft: 32, height: 36, fontSize: 13, background: '#fff' }}
                placeholder="Поиск по меню (Ctrl+K)"
                aria-label="Поиск по меню"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setMenuQ('');
                    e.currentTarget.blur();
                  }
                }}
                value={menuQ}
                onChange={(e) => setMenuQ(e.target.value)}
              />
            </div>
          </div>

          <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
            {groups.map((g) => (
              <div key={g.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((s) => ({ ...s, [g.id]: !s[g.id] }))}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.04em', color: 'var(--sk-muted)', background: 'none', border: 0, cursor: 'pointer',
                  }}
                >
                  <span>{g.label}</span>
                  <span style={{ fontSize: 10 }}>{openGroups[g.id] ? '▾' : '▸'}</span>
                </button>
                {openGroups[g.id] ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {g.items.map((item) => {
                      const base = item.href.split('?')[0];
                      const active = pathname === base || pathname.startsWith(base + '/');
                      return (
                        <Link
                          key={item.href + item.label}
                          href={item.href}
                          onClick={() => setOpenNav(false)}
                          className={clsx('nav-item', active && 'active')}
                        >
                          <Icon name={item.icon} className="text-[#6b7280]" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>

          <div style={{ padding: 12, borderTop: '1px solid var(--sk-line)', fontSize: 12, color: 'var(--sk-muted)' }}>
            {ROLE_LABELS[user.role as SystemRole] || user.role}
          </div>
        </aside>

        <main className="app-main">
          <div className={clsx('animate-rise', !flush && 'app-main-inner')} style={flush ? undefined : undefined}>
            {(title || actions) ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <div>
                  {title ? <h1 className="app-page-title">{title}</h1> : null}
                  {subtitle ? <p style={{ color: 'var(--sk-muted)', margin: '4px 0 0', fontSize: 14 }}>{subtitle}</p> : null}
                </div>
                {actions ? <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>{actions}</div> : null}
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-[var(--sk-muted)] mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={clsx('sk-card', className)} style={style}>{children}</div>;
}

export function Button({
  children,
  variant = 'primary',
  className,
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'secondary' | 'dark' }) {
  return (
    <button
      className={clsx(
        'sk-btn',
        variant === 'primary' && 'sk-btn-green',
        variant === 'dark' && 'sk-btn-dark',
        variant === 'secondary' && 'sk-btn-outline',
        variant === 'ghost' && 'sk-btn-outline',
        variant === 'danger' && 'bg-[var(--sk-danger)] text-white',
        className,
      )}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} {...props} className={clsx('sk-input', props.className)} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) {
    return <select ref={ref} {...props} className={clsx('sk-input', props.className)} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea(props, ref) {
    return (
      <textarea
        ref={ref}
        {...props}
        className={clsx('sk-input !h-auto py-2.5 min-h-[88px]', props.className)}
      />
    );
  },
);

export function Badge({ children, color = 'slate' }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, string> = {
    slate: 'sk-status-gray',
    blue: 'sk-status-blue',
    green: 'sk-status-green',
    amber: 'sk-status-amber',
    rose: 'bg-[var(--sk-danger)]',
    purple: 'sk-status-purple',
  };
  return <span className={clsx('sk-status', map[color] || map.slate)}>{children}</span>;
}

export function Empty({ text }: { text: string }) {
  return <div className="text-center text-[var(--sk-muted)] py-14 text-sm">{text}</div>;
}

export function StageStrip({
  stages,
  counts,
  activeId,
}: {
  stages: { id: string; name: string }[];
  counts?: Map<string, number> | Record<string, number>;
  activeId?: string;
}) {
  const get = (id: string) => {
    if (!counts) return 0;
    if (counts instanceof Map) return counts.get(id) || 0;
    return counts[id] || 0;
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {stages.map((s) => {
        const active = s.id === activeId;
        return (
          <div
            key={s.id}
            className={clsx(
              'rounded-lg border px-3 py-3 text-center bg-white',
              active ? 'border-[var(--sk-green)]' : 'border-[var(--sk-line)]',
            )}
          >
            <div className="text-xs text-[var(--sk-muted)] leading-snug">{s.name}</div>
            <div className="text-xl font-bold mt-1 tabular-nums">{get(s.id)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function StatTile({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const inner = (
    <Card className="p-4 hover:border-[var(--sk-green)] transition h-full">
      <div className="text-xs text-[var(--sk-muted)]">{label}</div>
      <div className="text-3xl font-bold mt-2 tabular-nums">{value}</div>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const modalStack: object[] = [];

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
  maxWidth,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  maxWidth?: number | string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('input, select, textarea, [contenteditable="true"]');
    (first || panel)?.focus();
    const token = {};
    modalStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(token);
      if (i >= 0) modalStack.splice(i, 1);
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;
  const mw = maxWidth ?? (wide ? 1100 : 480);
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.4)', cursor: 'pointer' }} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sk-card animate-rise"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: mw,
          maxHeight: '92vh',
          padding: wide ? 0 : 20,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 1,
          borderRadius: 'var(--sk-radius-xl)',
          boxShadow: '0 20px 48px rgba(15, 23, 42, 0.16)',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: wide ? 0 : 12, padding: wide ? '12px 12px 12px 20px' : 0, borderBottom: wide ? '1px solid var(--sk-line, #e5e7eb)' : undefined, flexShrink: 0 }}>
          <h3 id={titleId} style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h3>
          <button type="button" onClick={onClose} className="sk-modal-close" aria-label="Закрыть" title="Закрыть (Esc)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: wide ? '0 20px 16px' : 0 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
