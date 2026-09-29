'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, SystemRole } from '@skillaz/shared';
import { AppShell, Badge, Button, Card, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { downloadXlsx, uploadXlsx } from '@/lib/export';
import clsx from 'clsx';

const ROLES = Object.values(SystemRole);

export default function AdminPage() {
  return (
    <Suspense fallback={<AppShell title="Администрирование"><div className="text-[var(--muted)]">Загрузка…</div></AppShell>}>
      <AdminInner />
    </Suspense>
  );
}

function AdminInner() {
  const sp = useSearchParams();
  const initial = sp.get('tab') === 'import' ? 'import' : sp.get('tab') === 'brand' ? 'brand' : 'main';
  const [tab, setTab] = useState<'main' | 'import' | 'brand'>(initial);
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<any>('/users?pageSize=100') });
  const templates = useQuery({ queryKey: ['notif-templates'], queryFn: () => api<any>('/notifications/templates') });
  const pdn = useQuery({ queryKey: ['pdn'], queryFn: () => api<any>('/pdn') });
  const branding = useQuery({ queryKey: ['branding'], queryFn: () => api<any>('/branding') });
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: () => api<any[]>('/integrations/status') });
  const [brandForm, setBrandForm] = useState({ companyName: '', primaryColor: '', secondaryColor: '' });
  const [importMsg, setImportMsg] = useState('');
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '', password: '', firstName: '', lastName: '', role: SystemRole.RECRUITER as string,
  });
  const [userMsg, setUserMsg] = useState('');

  const saveBrand = useMutation({
    mutationFn: () =>
      api('/branding', {
        method: 'POST',
        body: JSON.stringify({
          companyName: brandForm.companyName || branding.data?.companyName,
          primaryColor: brandForm.primaryColor || branding.data?.primaryColor,
          secondaryColor: brandForm.secondaryColor || branding.data?.secondaryColor,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }),
  });

  const createUser = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: JSON.stringify(userForm) }),
    onSuccess: () => {
      setUserOpen(false);
      setUserForm({ email: '', password: '', firstName: '', lastName: '', role: SystemRole.RECRUITER });
      setUserMsg('');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => setUserMsg(e?.message || 'Ошибка создания'),
  });

  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  async function onImport(kind: 'candidates' | 'org-units', file?: File | null) {
    if (!file) return;
    try {
      const data = await uploadXlsx(kind, file);
      setImportMsg(`Импортировано: ${data.imported}`);
    } catch (e: any) {
      setImportMsg(`Ошибка: ${e?.message || e}`);
    }
  }

  return (
    <AppShell title="Администрирование" subtitle="Пользователи, бренд, интеграции, импорт/экспорт">
      <div className="flex border-b border-[var(--sk-line)] mb-4">
        <button className={clsx('sk-tab', tab === 'main' && 'active')} onClick={() => setTab('main')}>Общее</button>
        <button className={clsx('sk-tab', tab === 'import' && 'active')} onClick={() => setTab('import')}>Импорт и экспорт</button>
        <button className={clsx('sk-tab', tab === 'brand' && 'active')} onClick={() => setTab('brand')}>Брендирование</button>
      </div>

      {tab === 'brand' ? (
        <Card className="p-4 space-y-3 max-w-lg">
          <div className="font-bold text-[var(--brand-primary)]">Брендирование LogHR</div>
          <Input placeholder={branding.data?.companyName || 'Название'} value={brandForm.companyName} onChange={(e) => setBrandForm({ ...brandForm, companyName: e.target.value })} />
          <Input placeholder={branding.data?.primaryColor || '#0f2744'} value={brandForm.primaryColor} onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })} />
          <Input placeholder={branding.data?.secondaryColor || '#0d9488'} value={brandForm.secondaryColor} onChange={(e) => setBrandForm({ ...brandForm, secondaryColor: e.target.value })} />
          <Button onClick={() => saveBrand.mutate()}>Сохранить</Button>
        </Card>
      ) : tab === 'import' ? (
        <Card className="p-4 space-y-3 max-w-2xl">
          <div className="font-bold text-[var(--brand-primary)]">XLSX мастер</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => downloadXlsx('candidates')}>Экспорт кандидатов</Button>
            <Button variant="ghost" onClick={() => downloadXlsx('org-units')}>Экспорт орг. единиц</Button>
            <Button variant="ghost" onClick={() => downloadXlsx('hiring-requests')}>Экспорт заявок</Button>
            <Button variant="ghost" onClick={() => downloadXlsx('users')}>Экспорт пользователей</Button>
          </div>
          <label className="block text-sm">
            Импорт кандидатов
            <input type="file" accept=".xlsx" className="block mt-1 text-xs" onChange={(e) => onImport('candidates', e.target.files?.[0])} />
          </label>
          <label className="block text-sm">
            Импорт орг. единиц
            <input type="file" accept=".xlsx" className="block mt-1 text-xs" onChange={(e) => onImport('org-units', e.target.files?.[0])} />
          </label>
          {importMsg ? <div className="text-sm text-[var(--muted)]">{importMsg}</div> : null}
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="font-bold text-[var(--brand-primary)] mb-3">Интеграции</div>
            <div className="space-y-2">
              {(integrations.data || []).map((i: any) => (
                <div key={i.code} className="flex justify-between text-sm border-b border-[var(--line)] pb-2">
                  <span>{i.name}</span>
                  <Badge color={i.live ? 'green' : 'amber'}>
                    {i.note || (i.live ? 'настроено' : 'не настроено')}
                  </Badge>
                </div>
              ))}
            </div>
            <a className="text-sm text-[var(--brand-secondary)] underline block mt-3" href="http://localhost:3001/api/docs" target="_blank" rel="noreferrer">
              OpenAPI / Swagger для 1С
            </a>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="font-bold text-[var(--brand-primary)]">Брендирование</div>
            <Input placeholder={branding.data?.companyName || 'Название'} value={brandForm.companyName} onChange={(e) => setBrandForm({ ...brandForm, companyName: e.target.value })} />
            <Input placeholder={branding.data?.primaryColor || '#0B2A3D'} value={brandForm.primaryColor} onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })} />
            <Input placeholder={branding.data?.secondaryColor || '#3D8B9C'} value={brandForm.secondaryColor} onChange={(e) => setBrandForm({ ...brandForm, secondaryColor: e.target.value })} />
            <Button onClick={() => saveBrand.mutate()}>Сохранить</Button>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-[var(--brand-primary)]">Пользователи</div>
              <Button onClick={() => setUserOpen(true)}>Добавить</Button>
            </div>
            <div className="space-y-2 max-h-96 overflow-auto">
              {(users.data?.items || []).map((u: any) => (
                <div key={u.id} className="flex flex-wrap gap-2 justify-between text-sm border-b border-[var(--line)] pb-2 items-center">
                  <div>
                    <div className="font-medium">{u.lastName} {u.firstName}</div>
                    <div className="text-xs text-[var(--muted)]">{u.email}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Select
                      value={u.role}
                      onChange={(e) => patchUser.mutate({ id: u.id, body: { role: e.target.value } })}
                      style={{ height: 32, fontSize: 12, maxWidth: 160 }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      onClick={() => patchUser.mutate({ id: u.id, body: { isActive: !u.isActive } })}
                    >
                      {u.isActive ? 'Выкл.' : 'Вкл.'}
                    </Button>
                    <Badge color={u.isActive ? 'green' : 'amber'}>{u.isActive ? 'активен' : 'выкл'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-bold text-[var(--brand-primary)] mb-3">ПДн</div>
            {(pdn.data || []).map((d: any) => (
              <div key={d.id} className="mb-3 text-sm">
                <div className="font-medium">{d.title}</div>
                <div className="text-[var(--muted)] text-xs mt-1 whitespace-pre-wrap">{d.content}</div>
              </div>
            ))}
          </Card>

          <Card className="p-4 lg:col-span-2">
            <div className="font-bold text-[var(--brand-primary)] mb-3">Email-шаблоны ({templates.data?.length || 0})</div>
            <div className="max-h-80 overflow-auto space-y-2">
              {(templates.data || []).map((t: any) => (
                <div key={t.id} className="text-sm border-b border-[var(--line)] pb-2">
                  <div className="font-medium">{t.code}</div>
                  <div className="text-xs text-[var(--muted)]">{t.subject}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Modal open={userOpen} title="Новый пользователь" onClose={() => setUserOpen(false)}>
        <div className="space-y-3">
          <Input placeholder="Email" type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          <Input placeholder="Пароль (мин. 6)" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
          <Input placeholder="Фамилия" value={userForm.lastName} onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })} />
          <Input placeholder="Имя" value={userForm.firstName} onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })} />
          <Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
            ))}
          </Select>
          {userMsg ? <div className="text-sm" style={{ color: '#b91c1c' }}>{userMsg}</div> : null}
          <Button
            disabled={!userForm.email || !userForm.password || userForm.password.length < 6 || !userForm.firstName || !userForm.lastName || createUser.isPending}
            onClick={() => createUser.mutate()}
          >
            Создать
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
