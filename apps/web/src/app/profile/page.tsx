'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, SystemRole } from '@skillaz/shared';
import { AppShell, Badge, Button, Card, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ProfilePage() {
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
    <AppShell title="Мой профиль" subtitle="Личные данные и безопасность">
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
      </div>
      {msg ? <div className="mt-3 text-sm text-[var(--muted)]">{msg}</div> : null}
    </AppShell>
  );
}
