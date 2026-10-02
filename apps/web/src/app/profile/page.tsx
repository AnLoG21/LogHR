'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, SystemRole } from '@skillaz/shared';
import { AppShell, Badge, Button, Card, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ProfilePage() {
  return (
    <Suspense fallback={<AppShell title="Мой профиль"><div className="text-[var(--muted)]">Загрузка…</div></AppShell>}>
      <ProfileInner />
    </Suspense>
  );
}

function ProfileInner() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<any>('/auth/me') });
  const u = me.data || user;
  const [form, setForm] = useState({ firstName: '', lastName: '', middleName: '', phone: '' });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: form.firstName || u?.firstName,
          lastName: form.lastName || u?.lastName,
          middleName: form.middleName || u?.middleName,
          phone: form.phone || u?.phone,
        }),
      }),
    onSuccess: () => {
      setMsg('Профиль сохранён');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: any) => setMsg(e?.message || 'Ошибка'),
  });

  const changePwd = useMutation({
    mutationFn: () => api('/auth/me/password', { method: 'POST', body: JSON.stringify(pwd) }),
    onSuccess: () => {
      setMsg('Пароль изменён — войдите снова');
      setPwd({ currentPassword: '', newPassword: '' });
      setTimeout(() => logout().then(() => (window.location.href = '/login')), 800);
    },
    onError: (e: any) => setMsg(e?.message || 'Не удалось сменить пароль'),
  });

  return (
    <AppShell title="Мой профиль" subtitle="Личные данные, HeadHunter, телефония и безопасность">
      <div className="grid lg:grid-cols-2 gap-4 max-w-4xl">
        <Card className="p-5 space-y-3">
          <div className="font-bold text-[var(--brand-primary)]">Данные</div>
          <div className="text-sm text-[var(--muted)]">{u?.email}</div>
          <Badge>{ROLE_LABELS[(u?.role as SystemRole)] || u?.role}</Badge>
          <Input placeholder={u?.lastName || 'Фамилия'} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <Input placeholder={u?.firstName || 'Имя'} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Input placeholder={u?.middleName || 'Отчество'} value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
          <Input placeholder={u?.phone || 'Телефон'} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Сохранить</Button>
        </Card>
        <Card className="p-5 space-y-3">
          <div className="font-bold text-[var(--brand-primary)]">Смена пароля</div>
          <Input type="password" placeholder="Текущий пароль" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />
          <Input type="password" placeholder="Новый пароль" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
          <Button variant="ghost" onClick={() => changePwd.mutate()} disabled={changePwd.isPending || pwd.newPassword.length < 6}>
            Сменить пароль
          </Button>
          <Button variant="ghost" onClick={() => logout().then(() => (window.location.href = '/login'))}>Выйти из системы</Button>
        </Card>
        <MyHhCard />
        <MyMangoCard current={me.data?.mangoExtension || ''} />
      </div>
      {msg ? <div className="mt-3 text-sm text-[var(--muted)]">{msg}</div> : null}
    </AppShell>
  );
}

function MyHhCard() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const hh = useQuery({ queryKey: ['hh-me'], queryFn: () => api<any>('/integrations/hh/me') });
  const [note, setNote] = useState(() => {
    if (sp.get('hh') === 'connected') return { ok: true, text: 'Ваш HeadHunter подключён' };
    if (sp.get('hh') === 'error') return { ok: false, text: sp.get('msg') || 'Не удалось подключить HeadHunter' };
    return null as null | { ok: boolean; text: string };
  });
  const connect = useMutation({
    mutationFn: () => api<{ url: string }>('/integrations/hh/authorize?mode=personal'),
    onSuccess: (res) => { window.location.href = res.url; },
    onError: (e: any) => setNote({ ok: false, text: e?.message || 'Не удалось начать подключение' }),
  });
  const disconnect = useMutation({
    mutationFn: () => api('/integrations/hh/me/disconnect', { method: 'POST', body: '{}' }),
    onSuccess: () => {
      setNote({ ok: true, text: 'HeadHunter отключён' });
      qc.invalidateQueries({ queryKey: ['hh-me'] });
    },
  });
  const d = hh.data;
  const managerName = d?.manager ? [d.manager.lastName, d.manager.firstName].filter(Boolean).join(' ') : '';

  return (
    <Card className="p-5 space-y-3">
      <div className="font-bold text-[var(--brand-primary)]">Мой HeadHunter</div>
      <div className="text-xs text-[var(--sk-muted)]">
        Подключите свой аккаунт менеджера работодателя на hh.ru — вакансии будут публиковаться, а сообщения кандидатам
        уходить от вашего имени. Руководитель видит, кто подключён, в разделе «Моя команда».
      </div>
      {hh.isLoading ? <div className="text-sm text-[var(--sk-muted)]">Проверяем…</div> : null}
      {d ? (
        <div className="text-sm space-y-1">
          <div>
            Статус: <Badge color={d.connected ? 'green' : 'amber'}>{d.connected ? 'подключён' : 'не подключён'}</Badge>
          </div>
          {managerName ? <div>Менеджер: {managerName}{d.manager?.email ? ` · ${d.manager.email}` : ''}</div> : null}
          {d.employer?.name ? <div>Работодатель: {d.employer.name}</div> : null}
          {!d.connected ? <div className="text-xs text-[var(--sk-muted)]">{d.note}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!d?.clientConfigured || connect.isPending} onClick={() => connect.mutate()}>
          {d?.connected ? 'Переподключить' : 'Подключить HeadHunter'}
        </Button>
        {d?.connected ? (
          <Button variant="ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>Отключить</Button>
        ) : null}
      </div>
      {note ? (
        <div className={`text-sm ${note.ok ? 'text-[var(--sk-text-success)]' : 'text-[var(--sk-danger)]'}`}>{note.text}</div>
      ) : null}
    </Card>
  );
}

function MyMangoCard({ current }: { current: string }) {
  const qc = useQueryClient();
  const mango = useQuery({ queryKey: ['mango-status'], queryFn: () => api<any>('/integrations/mango/status') });
  const [ext, setExt] = useState<string | null>(null);
  const value = ext ?? current;
  const save = useMutation({
    mutationFn: () => api('/auth/me', { method: 'PATCH', body: JSON.stringify({ mangoExtension: value.trim() }) }),
    onSuccess: () => {
      setExt(null);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return (
    <Card className="p-5 space-y-3">
      <div className="font-bold text-[var(--brand-primary)]">Телефония Mango</div>
      <div className="text-xs text-[var(--sk-muted)]">
        Укажите свой внутренний номер в Mango Office. Кнопка «Позвонить» в карточке кандидата сначала наберёт вас, а после
        ответа соединит с кандидатом.
      </div>
      {mango.data && !mango.data.configured ? (
        <div className="text-xs text-[var(--sk-muted)]">Администратор ещё не подключил Mango — номер можно указать заранее.</div>
      ) : null}
      <Input
        placeholder="Внутренний номер, например 101"
        inputMode="numeric"
        value={value}
        onChange={(e) => setExt(e.target.value.replace(/[^\d]/g, ''))}
      />
      <Button variant="ghost" disabled={save.isPending || ext === null} onClick={() => save.mutate()}>Сохранить номер</Button>
      {save.isSuccess ? <div className="text-sm text-[var(--sk-text-success)]">Номер сохранён</div> : null}
      {save.isError ? <div className="text-sm text-[var(--sk-danger)]">{(save.error as Error).message}</div> : null}
    </Card>
  );
}
