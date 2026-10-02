'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, ConfirmDelete, Empty, Input, Modal, Select } from '@/components/ui';
import { TokenField, TokenPalette, VACANCY_TOKENS, humanizeTemplate, type TokenFieldHandle } from '@/components/template-composer';
import { api } from '@/lib/api';
import clsx from 'clsx';
import { JOB_BOARD_LABELS, PUBLICATION_STATUS_LABELS, ruLabel } from '@skillaz/shared';

const BOARDS = ['HH', 'SUPERJOB', 'AVITO', 'ZARPLATA', 'RABOTA', 'TRUDVSEM'];

export default function PublicationsPage() {
  return (
    <Suspense fallback={<AppShell title="Публикации"><div className="text-[var(--muted)]">Загрузка…</div></AppShell>}>
      <PublicationsInner />
    </Suspense>
  );
}

function PublicationsInner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<'list' | 'templates' | 'search' | 'auto'>(
    sp.get('tab') === 'templates' ? 'templates' : sp.get('tab') === 'search' ? 'search' : sp.get('tab') === 'auto' ? 'auto' : 'list',
  );
  const qc = useQueryClient();
  const [vacancyId, setVacancyId] = useState('');
  const [board, setBoard] = useState('HH');
  const [templateId, setTemplateId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyTpl = { name: '', board: 'HH', title: '', description: '', city: '', pay: true, extra: {} as Record<string, unknown> };
  const [tplForm, setTplForm] = useState(emptyTpl);
  const titleRef = useRef<TokenFieldHandle>(null);
  const descRef = useRef<TokenFieldHandle>(null);
  const tplFocus = useRef<'title' | 'description'>('description');

  const pubs = useQuery({ queryKey: ['publications'], queryFn: () => api<any>('/publications') });
  const templates = useQuery({
    queryKey: ['pub-templates'],
    queryFn: () => api<any>('/publications/templates?all=1'),
  });
  const vacancies = useQuery({ queryKey: ['vacancies-mini'], queryFn: () => api<any>('/vacancies?pageSize=100') });
  const activeTemplates = useMemo(
    () => (templates.data || []).filter((t: any) => t.isActive && (!board || t.board === board || t.board === 'HH')),
    [templates.data, board],
  );

  const [autoForm, setAutoForm] = useState({ vacancyId: '', board: 'HH', intervalHours: '24', regionHint: '', templateId: '' });
  const autoRules = useQuery({
    queryKey: ['auto-rules'],
    queryFn: () => api<any[]>('/publications/auto-rules'),
    enabled: tab === 'auto',
  });
  const createAuto = useMutation({
    mutationFn: () =>
      api('/publications/auto-rules', {
        method: 'POST',
        body: JSON.stringify({
          vacancyId: autoForm.vacancyId,
          board: autoForm.board,
          intervalHours: Number(autoForm.intervalHours) || 24,
          regionHint: autoForm.regionHint || undefined,
          templateId: autoForm.templateId || undefined,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-rules'] }),
  });
  const runAuto = useMutation({
    mutationFn: () => api('/publications/auto-run/now', { method: 'POST' }),
  });
  const toggleAuto = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/publications/auto-rules/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-rules'] }),
  });
  const removeAuto = useMutation({
    mutationFn: (id: string) => api(`/publications/auto-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-rules'] }),
  });

  const search = useMutation({
    mutationFn: () => api('/job-boards/search', { method: 'POST', body: JSON.stringify({ board, text: searchText.trim() || ' ' }) }),
  });
  const syncHh = useMutation({
    mutationFn: () => api('/job-boards/sync-responses', { method: 'POST', body: JSON.stringify({ board: 'HH' }) }),
  });
  const refreshResumes = useMutation({
    mutationFn: () => api('/job-boards/refresh-resumes', { method: 'POST', body: JSON.stringify({ limit: 40 }) }),
  });
  const hhStatus = useQuery({ queryKey: ['hh-status'], queryFn: () => api<any>('/job-boards/hh-status') });
  const publish = useMutation({
    mutationFn: () =>
      api('/publications', {
        method: 'POST',
        body: JSON.stringify({ vacancyId, board, templateId: templateId || undefined }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['publications'] }),
  });

  const saveTpl = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        ...tplForm.extra,
        title: tplForm.title || undefined,
        description: tplForm.description || undefined,
        city: tplForm.city || undefined,
        pay: tplForm.pay,
      };
      const payload = { name: tplForm.name, board: tplForm.board, body };
      if (editId) {
        return api(`/publications/templates/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      }
      return api('/publications/templates', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pub-templates'] });
      setTplOpen(false);
      setEditId(null);
    },
  });

  const toggleTpl = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api(`/publications/templates/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pub-templates'] }),
  });
  const removeTpl = useMutation({
    mutationFn: (id: string) => api(`/publications/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pub-templates'] }),
  });

  function openCreate() {
    setEditId(null);
    setTplForm(emptyTpl);
    setTplOpen(true);
  }

  function openEdit(t: any) {
    const body = (t.body && typeof t.body === 'object' ? t.body : {}) as Record<string, any>;
    const { title, description, city, pay, ...rest } = body;
    setEditId(t.id);
    setTplForm({
      name: t.name || '',
      board: t.board || 'HH',
      title: title || '',
      description: description || '',
      city: city || '',
      pay: pay !== false,
      extra: rest,
    });
    setTplOpen(true);
  }

  return (
    <AppShell title="Публикации" subtitle="Размещение вакансий и работа с откликами площадок">
      <div className="flex border-b border-[var(--sk-line)] mb-4">
        <button className={clsx('sk-tab', tab === 'list' && 'active')} onClick={() => setTab('list')}>Аккаунты / публикации</button>
        <button className={clsx('sk-tab', tab === 'templates' && 'active')} onClick={() => setTab('templates')}>Шаблоны</button>
        <button className={clsx('sk-tab', tab === 'auto' && 'active')} onClick={() => setTab('auto')}>Авторазмещения</button>
        <button className={clsx('sk-tab', tab === 'search' && 'active')} onClick={() => setTab('search')}>Автопоиски</button>
      </div>

      {tab === 'auto' ? (
        <div className="space-y-4">
          <Card className="p-4 grid md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Вакансия</div>
              <Select value={autoForm.vacancyId} onChange={(e) => setAutoForm({ ...autoForm, vacancyId: e.target.value })}>
                <option value="">Выберите</option>
                {(vacancies.data?.items || []).map((v: any) => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </Select>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Площадка</div>
              <Select value={autoForm.board} onChange={(e) => setAutoForm({ ...autoForm, board: e.target.value })}>
                {BOARDS.map((b) => <option key={b} value={b}>{ruLabel(JOB_BOARD_LABELS, b)}</option>)}
              </Select>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Интервал (ч)</div>
              <Input value={autoForm.intervalHours} onChange={(e) => setAutoForm({ ...autoForm, intervalHours: e.target.value })} />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Регион (подсказка)</div>
              <Input value={autoForm.regionHint} onChange={(e) => setAutoForm({ ...autoForm, regionHint: e.target.value })} placeholder="из города вакансии" />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Шаблон</div>
              <Select value={autoForm.templateId} onChange={(e) => setAutoForm({ ...autoForm, templateId: e.target.value })}>
                <option value="">Без шаблона</option>
                {(templates.data || []).filter((t: any) => t.isActive).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button disabled={!autoForm.vacancyId || createAuto.isPending} onClick={() => createAuto.mutate()}>Добавить</Button>
              <Button variant="ghost" onClick={() => runAuto.mutate()} disabled={runAuto.isPending}>Запустить сейчас</Button>
            </div>
          </Card>
          {runAuto.data ? (
            <Card className="p-3 text-sm text-[var(--muted)]">
              Готово: обработано {(runAuto.data as any).processed ?? (runAuto.data as any).ran ?? '—'}
              {(runAuto.data as any).errors ? `, ошибок: ${(runAuto.data as any).errors}` : ''}
            </Card>
          ) : null}
          <Card className="divide-y divide-[var(--line)]">
            {(autoRules.data || []).map((r: any) => (
              <div key={r.id} className="px-4 py-3 flex justify-between gap-3 text-sm items-start">
                <div>
                  <div className="font-semibold">{r.vacancy?.title} · {ruLabel(JOB_BOARD_LABELS, r.board)}</div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    каждые {r.intervalHours} ч · регион: {r.regionHint || '—'} · следующий запуск: {r.nextRunAt ? new Date(r.nextRunAt).toLocaleString('ru-RU') : '—'}
                    {r.lastError ? ` · ошибка: ${String(r.lastError).replace(/MOCKED:.*?ключ[^\s,]*/gi, 'демо-режим').replace(/\.env/gi, 'настройках')}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color={r.isActive ? 'green' : 'amber'}>{r.isActive ? 'активно' : 'выкл'}</Badge>
                  <Button variant="ghost" onClick={() => toggleAuto.mutate({ id: r.id, isActive: !r.isActive })}>
                    {r.isActive ? 'Выкл.' : 'Вкл.'}
                  </Button>
                  <ConfirmDelete question="Удалить правило авторазмещения?" onConfirm={() => removeAuto.mutate(r.id)} pending={removeAuto.isPending} />
                </div>
              </div>
            ))}
            {!autoRules.isLoading && !(autoRules.data || []).length ? <Empty text="Правил авторазмещения нет" /> : null}
          </Card>
          <p className="text-xs text-[var(--muted)]">Правила выполняются автоматически каждые несколько минут. Можно запустить вручную кнопкой выше.</p>
        </div>
      ) : tab === 'search' ? (
        <Card className="p-4 space-y-3">
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Площадка</div>
              <Select value={board} onChange={(e) => setBoard(e.target.value)}>
                {BOARDS.map((b) => <option key={b} value={b}>{ruLabel(JOB_BOARD_LABELS, b)}</option>)}
              </Select>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Поисковый запрос</div>
              <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Например: водитель" />
            </div>
            <Button onClick={() => search.mutate()} disabled={search.isPending || !searchText.trim()}>Запустить автопоиск</Button>
          </div>
          {search.data ? (
            <div className="text-sm text-[var(--muted)]">
              Найдено: {(search.data as any).total ?? (search.data as any).items?.length ?? 'готово'}
            </div>
          ) : null}
          <div className="border-t border-[var(--line)] pt-3 space-y-2">
            <div className="font-semibold text-sm">HeadHunter: отклики и резюме</div>
            <p className="text-xs text-[var(--muted)]">
              {hhStatus.data?.note || 'Проверка подключения…'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => syncHh.mutate()} disabled={syncHh.isPending || hhStatus.data?.configured === false}>
                {syncHh.isPending ? 'Синхронизация…' : 'Синхронизировать отклики'}
              </Button>
              <Button variant="ghost" onClick={() => refreshResumes.mutate()} disabled={refreshResumes.isPending || hhStatus.data?.configured === false}>
                {refreshResumes.isPending ? 'Обновление…' : 'Обновить резюме'}
              </Button>
            </div>
            {syncHh.data ? (
              <div className="text-sm text-[var(--muted)]">
                Отклики: новых {(syncHh.data as any).imported ?? 0}, обновлено {(syncHh.data as any).updated ?? 0}
                {(syncHh.data as any).note ? ` · ${(syncHh.data as any).note}` : ''}
              </div>
            ) : null}
            {refreshResumes.data ? (
              <div className="text-sm text-[var(--muted)]">
                Резюме обновлено: {(refreshResumes.data as any).updated ?? 0}
                {(refreshResumes.data as any).note ? ` · ${(refreshResumes.data as any).note}` : ''}
              </div>
            ) : null}
          </div>
          <p className="text-sm text-[var(--muted)]">Пока площадка не подключена администратором, действия недоступны или работают в демо-режиме.</p>
        </Card>
      ) : tab === 'templates' ? (
        <>
          <div className="flex justify-end mb-3">
            <Button onClick={openCreate}>Добавить шаблон</Button>
          </div>
          <Card className="divide-y divide-[var(--line)]">
            {(templates.data || []).map((t: any) => {
              const body = t.body && typeof t.body === 'object' ? t.body : {};
              const preview = humanizeTemplate(body.title || body.description || '') || 'Данные берутся из вакансии';
              return (
                <div key={t.id} className="px-4 py-3 text-sm flex justify-between gap-3 items-start">
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-[var(--muted)] mt-1">{ruLabel(JOB_BOARD_LABELS, t.board)} · {String(preview).slice(0, 120)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge color={t.isActive ? 'green' : 'amber'}>{t.isActive ? 'активен' : 'выкл'}</Badge>
                    <Button variant="ghost" onClick={() => openEdit(t)}>Изменить</Button>
                    <Button
                      variant="ghost"
                      onClick={() => toggleTpl.mutate({ id: t.id, isActive: !t.isActive })}
                    >
                      {t.isActive ? 'Выкл.' : 'Вкл.'}
                    </Button>
                    <ConfirmDelete question="Удалить шаблон?" onConfirm={() => removeTpl.mutate(t.id)} pending={removeTpl.isPending} />
                  </div>
                </div>
              );
            })}
            {!templates.isLoading && !(templates.data || []).length ? <Empty text="Шаблонов пока нет — создайте первый" /> : null}
          </Card>
        </>
      ) : (
        <>
          <Card className="p-4 mb-4 grid md:grid-cols-5 gap-3 items-end">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Вакансия</div>
              <Select value={vacancyId} onChange={(e) => setVacancyId(e.target.value)}>
                <option value="">Выберите</option>
                {(vacancies.data?.items || []).map((v: any) => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </Select>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Площадка</div>
              <Select value={board} onChange={(e) => { setBoard(e.target.value); setTemplateId(''); }}>
                {BOARDS.map((b) => (
                  <option key={b} value={b}>{ruLabel(JOB_BOARD_LABELS, b)}</option>
                ))}
              </Select>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Шаблон</div>
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Без шаблона</option>
                {activeTemplates.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </div>
            <Button disabled={!vacancyId || publish.isPending} onClick={() => publish.mutate()}>Опубликовать</Button>
            <Button variant="ghost" onClick={() => search.mutate()}>Автопоиск</Button>
          </Card>
          {search.data ? (
            <Card className="p-4 mb-4 text-sm text-[var(--muted)]">
              Найдено: {(search.data as any).total ?? (search.data as any).items?.length ?? 'готово'}
            </Card>
          ) : null}
          <Card className="divide-y divide-[var(--line)]">
            {(pubs.data || []).map((p: any) => (
              <div key={p.id} className="px-4 py-3 flex justify-between text-sm">
                <div>
                  <div className="font-semibold">{p.vacancy?.title}</div>
                  <div className="text-xs text-[var(--muted)]">{ruLabel(JOB_BOARD_LABELS, p.board)} · {p.url || p.externalId || '—'}</div>
                </div>
                <Badge color={p.status === 'PUBLISHED' ? 'green' : p.status === 'FAILED' ? 'rose' : 'amber'}>{ruLabel(PUBLICATION_STATUS_LABELS, p.status)}</Badge>
              </div>
            ))}
            {!pubs.isLoading && !pubs.data?.length ? <Empty text="Публикаций нет" /> : null}
          </Card>
        </>
      )}

      <Modal open={tplOpen} title={editId ? 'Изменить шаблон' : 'Новый шаблон'} onClose={() => setTplOpen(false)} maxWidth={640}>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Название шаблона</div>
              <Input placeholder="Например, «Водители — Норильск»" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Площадка</div>
              <Select value={tplForm.board} onChange={(e) => setTplForm({ ...tplForm, board: e.target.value })}>
                {BOARDS.map((b) => <option key={b} value={b}>{ruLabel(JOB_BOARD_LABELS, b)}</option>)}
              </Select>
            </div>
          </div>

          <TokenPalette
            tokens={VACANCY_TOKENS}
            hint="Данные подставятся из вакансии при публикации. Перетащите в текст или нажмите."
            onInsert={(key) => (tplFocus.current === 'title' ? titleRef : descRef).current?.insertToken(key)}
          />

          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Заголовок объявления</div>
            <TokenField
              ref={titleRef}
              value={tplForm.title}
              onChange={(title) => setTplForm((f) => ({ ...f, title }))}
              onFocus={() => { tplFocus.current = 'title'; }}
              placeholder="Пусто — возьмём название вакансии"
            />
          </div>
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Описание</div>
            <TokenField
              ref={descRef}
              value={tplForm.description}
              onChange={(description) => setTplForm((f) => ({ ...f, description }))}
              onFocus={() => { tplFocus.current = 'description'; }}
              multiline
              placeholder="Пусто — возьмём описание вакансии"
            />
          </div>
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Город</div>
            <Input placeholder="Пусто — возьмём город вакансии" value={tplForm.city} onChange={(e) => setTplForm({ ...tplForm, city: e.target.value })} />
          </div>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={tplForm.pay} onChange={(e) => setTplForm({ ...tplForm, pay: e.target.checked })} />
            Указывать зарплату в объявлении
          </label>
          {saveTpl.isError ? <div className="text-sm text-rose-600">{(saveTpl.error as Error)?.message || 'Ошибка'}</div> : null}
          <Button disabled={!tplForm.name || saveTpl.isPending} onClick={() => saveTpl.mutate()}>
            {editId ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
