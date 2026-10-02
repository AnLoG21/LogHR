'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, SystemRole } from '@skillaz/shared';
import { AppShell, Badge, Button, Card, ConfirmDelete, Input, Modal, Select } from '@/components/ui';
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
  const [tab, setTab] = useState<'main' | 'import'>(sp.get('tab') === 'import' ? 'import' : 'main');
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<any>('/users?pageSize=100') });
  const templates = useQuery({ queryKey: ['notif-templates'], queryFn: () => api<any>('/notifications/templates') });
  const pdn = useQuery({ queryKey: ['pdn'], queryFn: () => api<any>('/pdn') });
  const integrations = useQuery({ queryKey: ['integrations'], queryFn: () => api<any[]>('/integrations/status') });
  const hh = useQuery({ queryKey: ['hh-status'], queryFn: () => api<any>('/integrations/hh/status') });
  const [importMsg, setImportMsg] = useState('');
  const [hhMsg, setHhMsg] = useState(() => {
    if (sp.get('hh') === 'connected') return 'HeadHunter успешно подключён';
    if (sp.get('hh') === 'error') return sp.get('msg') || 'Не удалось подключить HeadHunter';
    return '';
  });
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '', password: '', firstName: '', lastName: '', role: SystemRole.RECRUITER as string,
  });
  const [userMsg, setUserMsg] = useState('');

  const connectHh = useMutation({
    mutationFn: () => api<{ url: string }>('/integrations/hh/authorize?mode=company'),
    onSuccess: (res) => { window.location.href = res.url; },
    onError: (e: any) => setHhMsg(e?.message || 'Не удалось начать подключение'),
  });
  const disconnectHh = useMutation({
    mutationFn: () => api('/integrations/hh/disconnect', { method: 'POST', body: '{}' }),
    onSuccess: () => {
      setHhMsg('HeadHunter отключён');
      qc.invalidateQueries({ queryKey: ['hh-status'] });
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
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
    <AppShell title="Администрирование" subtitle="Пользователи, интеграции, ПДн, импорт/экспорт">
      <div className="flex border-b border-[var(--sk-line)] mb-4">
        <button className={clsx('sk-tab', tab === 'main' && 'active')} onClick={() => setTab('main')}>Общее</button>
        <button className={clsx('sk-tab', tab === 'import' && 'active')} onClick={() => setTab('import')}>Импорт и экспорт</button>
      </div>

      {tab === 'import' ? (
        <Card className="p-4 space-y-3 max-w-2xl">
          <div className="font-bold text-[var(--brand-primary)]">Импорт и экспорт Excel</div>
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
          <Card className="p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-[var(--brand-primary)]">Пользователи</div>
              <Button onClick={() => setUserOpen(true)}>Добавить</Button>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--sk-panel)]">
                  <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--line)]">
                    <th className="py-2 pr-3 font-medium">Сотрудник</th>
                    <th className="py-2 pr-3 font-medium">Email (логин)</th>
                    <th className="py-2 pr-3 font-medium">Роль в системе</th>
                    <th className="py-2 pr-3 font-medium">Статус</th>
                    <th className="py-2 font-medium text-right">Доступ</th>
                  </tr>
                </thead>
                <tbody>
                  {(users.data?.items || []).map((u: any) => (
                    <tr key={u.id} className="border-b border-[var(--line)]">
                      <td className="py-2 pr-3 font-medium">{u.lastName} {u.firstName}</td>
                      <td className="py-2 pr-3 text-[var(--muted)]">{u.email}</td>
                      <td className="py-2 pr-3">
                        <Select
                          value={u.role}
                          onChange={(e) => patchUser.mutate({ id: u.id, body: { role: e.target.value } })}
                          style={{ height: 32, fontSize: 12, maxWidth: 220 }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge color={u.isActive ? 'green' : 'amber'}>{u.isActive ? 'Активен' : 'Отключён'}</Badge>
                      </td>
                      <td className="py-2 text-right">
                        <ConfirmDelete
                          label={u.isActive ? 'Отключить' : 'Включить'}
                          question={u.isActive ? 'Отключить доступ пользователю?' : 'Включить доступ пользователю?'}
                          danger={u.isActive}
                          showIcon={false}
                          onConfirm={() => patchUser.mutate({ id: u.id, body: { isActive: !u.isActive } })}
                          pending={patchUser.isPending}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4 lg:col-span-2">
            <div className="font-bold text-[var(--brand-primary)] mb-1">HeadHunter компании</div>
            <div className="text-xs text-[var(--sk-muted)] mb-3">
              Общий аккаунт работодателя: импорт откликов и поиск резюме для всей компании. Каждый рекрутёр может
              дополнительно подключить свой менеджерский аккаунт в «Мой профиль» — тогда публикации и переписка идут от его имени.
              Кто что подключил — в разделе <a className="sk-link" href="/team">«Моя команда»</a>.
              В кабинете разработчика HH укажите Redirect URI:
              <code className="ml-1 break-all">{hh.data?.redirectUri || 'https://hrm.infiit.ru/api/integrations/hh/callback'}</code>
            </div>
            {hh.isLoading ? <div className="text-sm text-[var(--sk-muted)]">Проверяем…</div> : null}
            {hh.data ? (
              <div className="text-sm space-y-1 mb-3">
                <div>Статус: <b>{hh.data.connected ? 'подключён' : 'не подключён'}</b>
                  {hh.data.viaOAuth ? ' (через вход на hh.ru)' : hh.data.viaEnv ? ' (токен на сервере)' : ''}
                </div>
                {hh.data.employer?.name ? <div>Работодатель: {hh.data.employer.name}</div> : null}
                {hh.data.manager?.email || hh.data.manager?.firstName ? (
                  <div>Менеджер: {[hh.data.manager.lastName, hh.data.manager.firstName].filter(Boolean).join(' ')} {hh.data.manager.email ? `· ${hh.data.manager.email}` : ''}</div>
                ) : null}
                {hh.data.expiresAt ? <div className="text-xs text-[var(--sk-muted)]">Токен до {new Date(hh.data.expiresAt).toLocaleString('ru-RU')} (обновляется сам)</div> : null}
                {!hh.data.clientConfigured ? (
                  <div className="text-[var(--sk-danger)]">На сервере не заданы HH_CLIENT_ID и HH_CLIENT_SECRET — добавьте их в deploy/.env после одобрения заявки.</div>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!hh.data?.clientConfigured || connectHh.isPending} onClick={() => connectHh.mutate()}>
                {hh.data?.connected ? 'Переподключить HeadHunter' : 'Подключить HeadHunter'}
              </Button>
              {hh.data?.viaOAuth ? (
                <Button variant="ghost" disabled={disconnectHh.isPending} onClick={() => disconnectHh.mutate()}>
                  Отключить
                </Button>
              ) : null}
            </div>
            {hhMsg ? <div className={`text-sm mt-2 ${sp.get('hh') === 'error' ? 'text-[var(--sk-danger)]' : 'text-[var(--sk-text-success)]'}`}>{hhMsg}</div> : null}
          </Card>

          <MaxAdminCard />
          <MangoAdminCard />

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
            <a className="text-sm text-[var(--brand-secondary)] underline block mt-3" href={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/docs`} target="_blank" rel="noreferrer">
              Документация API для 1С
            </a>
          </Card>

          <Card className="p-4">
            <div className="font-bold text-[var(--brand-primary)]">ПДн (152-ФЗ)</div>
            <div className="text-xs text-[var(--muted)] mt-1 mb-3">
              Политика обработки и текст согласия, которые видит кандидат в публичной форме отклика. Отметка о согласии сохраняется в карточке кандидата.
            </div>
            {(pdn.data || []).map((d: any) => (
              <div key={d.id} className="mb-3 text-sm">
                <div className="font-medium">{d.title}</div>
                <div className="text-[var(--muted)] text-xs mt-1 whitespace-pre-wrap">{d.content}</div>
              </div>
            ))}
          </Card>

          <Card className="p-4 lg:col-span-2">
            <div className="font-bold text-[var(--brand-primary)] mb-1">Шаблоны сообщений ({templates.data?.length || 0})</div>
            <div className="text-xs text-[var(--muted)] mb-3">
              Редактирование — в разделе «Шаблоны писем»: подстановки вставляются кнопками (Имя, Ссылка…), без технического кода.
            </div>
            <div className="max-h-80 overflow-auto space-y-2">
              {(templates.data || []).map((t: any) => (
                <div key={t.id} className="text-sm border-b border-[var(--line)] pb-2">
                  <div className="font-medium">{t.subject || 'Без темы'}</div>
                  <div className="text-xs text-[var(--muted)]">{t.isActive ? 'активен' : 'выключен'}</div>
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
          {userMsg ? <div className="text-sm" style={{ color: 'var(--sk-text-danger)' }}>{userMsg}</div> : null}
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

function MangoAdminCard() {
  const mango = useQuery({ queryKey: ['mango-status'], queryFn: () => api<any>('/integrations/mango/status') });
  const calls = useQuery({
    queryKey: ['mango-calls'],
    queryFn: () => api<any[]>('/integrations/mango/calls?limit=10'),
    enabled: !!mango.data?.configured,
  });
  return (
    <Card className="p-4 lg:col-span-2">
      <div className="font-bold text-[var(--brand-primary)] mb-1">Mango Office (телефония)</div>
      <div className="text-xs text-[var(--sk-muted)] mb-3">
        Звонок из карточки кандидата: сначала звонит телефон сотрудника в Mango, после ответа — набирается кандидат.
        В кабинете Mango откройте «Интеграции → API коннектор», скопируйте уникальный код и ключ для подписи в{' '}
        <code>deploy/.env</code> как <code>MANGO_VPBX_API_KEY</code> и <code>MANGO_VPBX_API_SALT</code>. Там же укажите адрес
        внешней системы: <code className="break-all">{mango.data?.eventsUrl || 'https://hrm.infiit.ru/api/integrations/mango'}</code>.
        Каждый сотрудник вписывает свой внутренний номер в «Мой профиль».
      </div>
      {mango.data ? (
        <div className="text-sm space-y-1 mb-2">
          <div>Статус: <b>{mango.data.configured ? 'подключён' : 'не подключён'}</b></div>
          {mango.data.lineNumber ? <div>Номер для исходящих: {mango.data.lineNumber}</div> : null}
          <div className="text-xs text-[var(--sk-muted)]">{mango.data.note}</div>
        </div>
      ) : null}
      {calls.data?.length ? (
        <div className="mt-3">
          <div className="text-xs text-[var(--sk-muted)] mb-1">Последние звонки</div>
          <div className="space-y-1 max-h-48 overflow-auto">
            {calls.data.map((c: any) => (
              <div key={c.id} className="flex justify-between text-sm border-b border-[var(--line)] pb-1">
                <span>{c.subject?.replace('Mango event', 'Событие') || c.to}</span>
                <span className="text-xs text-[var(--sk-muted)]">
                  {new Date(c.createdAt).toLocaleString('ru-RU')} · {c.status === 'SENT' ? 'набран' : c.status === 'FAILED' ? 'ошибка' : 'событие'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function MaxAdminCard() {
  const qc = useQueryClient();
  const max = useQuery({ queryKey: ['max-status'], queryFn: () => api<any>('/integrations/max/status') });
  const register = useMutation({
    mutationFn: () => api('/integrations/max/register-webhook', { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['max-status'] }),
  });
  return (
    <Card className="p-4 lg:col-span-2">
      <div className="font-bold text-[var(--brand-primary)] mb-1">MAX (мессенджер)</div>
      <div className="text-xs text-[var(--sk-muted)] mb-3">
        У MAX нет чата по номеру телефона. Подключается корпоративный бот на{' '}
        <a className="sk-link" href="https://dev.max.ru" target="_blank" rel="noreferrer">dev.max.ru</a>
        : в <code>deploy/.env</code> задайте <code>MAX_BOT_TOKEN</code>, <code>MAX_BOT_USERNAME</code> и при желании{' '}
        <code>MAX_WEBHOOK_SECRET</code>. Webhook: <code>{max.data?.webhookUrl || 'https://hrm.infiit.ru/api/integrations/max/webhook'}</code>
      </div>
      {max.data ? (
        <div className="text-sm space-y-1 mb-3">
          <div>Статус: <b>{max.data.configured ? 'настроен' : 'не настроен'}</b></div>
          {max.data.botUsername ? <div>Бот: @{max.data.botUsername}</div> : null}
          <div className="text-xs text-[var(--sk-muted)]">{max.data.note}</div>
        </div>
      ) : null}
      <Button variant="ghost" disabled={!max.data?.configured || register.isPending} onClick={() => register.mutate()}>
        {register.isPending ? 'Подключаем…' : 'Зарегистрировать webhook'}
      </Button>
      {register.isSuccess ? <div className="text-sm text-[var(--sk-text-success)] mt-2">Webhook обновлён</div> : null}
      {register.isError ? <div className="text-sm text-[var(--sk-danger)] mt-2">{(register.error as Error).message}</div> : null}
    </Card>
  );
}
