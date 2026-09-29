'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, Empty, Input, Modal, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import clsx from 'clsx';

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
  const [tab, setTab] = useState<'list' | 'templates' | 'search'>(
    sp.get('tab') === 'templates' ? 'templates' : sp.get('tab') === 'search' ? 'search' : 'list',
  );
  const qc = useQueryClient();
  const [vacancyId, setVacancyId] = useState('');
  const [board, setBoard] = useState('HH');
  const [templateId, setTemplateId] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [tplForm, setTplForm] = useState({ name: '', board: 'HH', title: '', description: '', city: '', bodyJson: '' });

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

  const search = useMutation({
    mutationFn: () => api('/job-boards/search', { method: 'POST', body: JSON.stringify({ board, text: 'инженер' }) }),
  });
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
      let body: Record<string, unknown> = {
        title: tplForm.title || undefined,
        description: tplForm.description || undefined,
        city: tplForm.city || undefined,
      };
      if (tplForm.bodyJson.trim()) {
        try {
          body = { ...body, ...JSON.parse(tplForm.bodyJson) };
        } catch {
          throw new Error('Некорректный JSON в доп. полях');
        }
      }
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

  function openCreate() {
    setEditId(null);
    setTplForm({ name: '', board: 'HH', title: '', description: '', city: '', bodyJson: '' });
    setTplOpen(true);
  }

  function openEdit(t: any) {
    const body = (t.body && typeof t.body === 'object' ? t.body : {}) as Record<string, any>;
    const { title, description, city, ...rest } = body;
    setEditId(t.id);
    setTplForm({
      name: t.name || '',
      board: t.board || 'HH',
      title: title || '',
      description: description || '',
      city: city || '',
      bodyJson: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '',
    });
    setTplOpen(true);
  }

  return (
    <AppShell title="Публикации" subtitle="Job-борды: HH боевой адаптер, остальные — mock до ключей">
      <div className="flex border-b border-[var(--sk-line)] mb-4">
        <button className={clsx('sk-tab', tab === 'list' && 'active')} onClick={() => setTab('list')}>Аккаунты / публикации</button>
        <button className={clsx('sk-tab', tab === 'templates' && 'active')} onClick={() => setTab('templates')}>Шаблоны</button>
        <button className={clsx('sk-tab', tab === 'search' && 'active')} onClick={() => setTab('search')}>Автопоиски</button>
      </div>

      {tab === 'search' ? (
        <Card className="p-4 space-y-3">
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Площадка</div>
              <Select value={board} onChange={(e) => setBoard(e.target.value)}>
                {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </div>
            <Button onClick={() => search.mutate()} disabled={search.isPending}>Запустить автопоиск</Button>
          </div>
          {search.data ? <pre className="text-xs overflow-auto bg-[#f3f7f9] p-3 rounded-xl">{JSON.stringify(search.data, null, 2)}</pre> : null}
          <p className="text-sm text-[var(--muted)]">Без ключей площадки отвечают mock. HH — боевой при HH_ACCESS_TOKEN.</p>
        </Card>
      ) : tab === 'templates' ? (
        <>
          <div className="flex justify-end mb-3">
            <Button onClick={openCreate}>Добавить шаблон</Button>
          </div>
          <Card className="divide-y divide-[var(--line)]">
            {(templates.data || []).map((t: any) => {
              const body = t.body && typeof t.body === 'object' ? t.body : {};
              const preview = body.title || body.description || body.template || '—';
              return (
                <div key={t.id} className="px-4 py-3 text-sm flex justify-between gap-3 items-start">
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-[var(--muted)] mt-1">{t.board} · {String(preview).slice(0, 120)}</div>
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
                  <option key={b} value={b}>{b}</option>
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
            <Card className="p-4 mb-4 text-sm">
              <pre className="text-xs overflow-auto bg-[#f3f7f9] p-3 rounded-xl">{JSON.stringify(search.data, null, 2)}</pre>
            </Card>
          ) : null}
          <Card className="divide-y divide-[var(--line)]">
            {(pubs.data || []).map((p: any) => (
              <div key={p.id} className="px-4 py-3 flex justify-between text-sm">
                <div>
                  <div className="font-semibold">{p.vacancy?.title}</div>
                  <div className="text-xs text-[var(--muted)]">{p.board} · {p.url || p.externalId || '—'}</div>
                </div>
                <Badge color={p.status === 'PUBLISHED' ? 'green' : p.status === 'FAILED' ? 'rose' : 'amber'}>{p.status}</Badge>
              </div>
            ))}
            {!pubs.isLoading && !pubs.data?.length ? <Empty text="Публикаций нет" /> : null}
          </Card>
        </>
      )}

      <Modal open={tplOpen} title={editId ? 'Изменить шаблон' : 'Новый шаблон'} onClose={() => setTplOpen(false)}>
        <div className="space-y-3">
          <Input placeholder="Название" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} />
          <Select value={tplForm.board} onChange={(e) => setTplForm({ ...tplForm, board: e.target.value })}>
            {BOARDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
          <Input placeholder="Заголовок вакансии (опц.)" value={tplForm.title} onChange={(e) => setTplForm({ ...tplForm, title: e.target.value })} />
          <Textarea placeholder="Описание (опц.)" value={tplForm.description} onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })} />
          <Input placeholder="Город (опц.)" value={tplForm.city} onChange={(e) => setTplForm({ ...tplForm, city: e.target.value })} />
          <Textarea placeholder='Доп. JSON, напр. {"pay":true}' value={tplForm.bodyJson} onChange={(e) => setTplForm({ ...tplForm, bodyJson: e.target.value })} />
          {saveTpl.isError ? <div className="text-sm text-rose-600">{(saveTpl.error as Error)?.message || 'Ошибка'}</div> : null}
          <Button disabled={!tplForm.name || saveTpl.isPending} onClick={() => saveTpl.mutate()}>
            {editId ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
