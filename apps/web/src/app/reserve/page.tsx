'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Badge, Button, Card, ConfirmDelete, Empty, Icon, Input, Modal, Select, Textarea } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import { JOB_BOARD_LABELS, ruLabel } from '@skillaz/shared';
import clsx from 'clsx';

export default function ReservePage() {
  const qc = useQueryClient();
  const [vacancyFilter, setVacancyFilter] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [search, setSearch] = useState('');
  const [commentFor, setCommentFor] = useState<{ id: string; name: string } | null>(null);
  const [comment, setComment] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const list = useQuery({
    queryKey: ['reserve', onlyNew, search],
    queryFn: () => {
      const p = new URLSearchParams({
        pageSize: '200',
        view: 'full',
        hasVacancy: '1',
        sort: 'createdAt_desc',
      });
      if (onlyNew) p.set('unviewedOnly', '1');
      if (search.trim()) p.set('search', search.trim());
      return api<any>(`/candidates?${p}`);
    },
  });
  const stats = useQuery({
    queryKey: ['reserve-stats'],
    queryFn: () => api<{ total: number; unviewed: number }>('/candidates/reserve-stats'),
    refetchInterval: 60_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['reserve'] });
    qc.invalidateQueries({ queryKey: ['reserve-stats'] });
    qc.invalidateQueries({ queryKey: ['candidates'] });
  };

  const removeOne = useMutation({
    mutationFn: (id: string) => api(`/candidates/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const removeBulk = useMutation({
    mutationFn: (ids: string[]) => api('/candidates/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: () => {
      setSelected(new Set());
      setSelectMode(false);
      refresh();
    },
  });
  const addComment = useMutation({
    mutationFn: () =>
      api(`/candidates/${commentFor!.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: comment.trim() }),
      }),
    onSuccess: () => {
      setComment('');
      setCommentFor(null);
      refresh();
    },
  });
  const toggleFav = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      api(`/candidates/${id}/flags`, { method: 'PATCH', body: JSON.stringify({ isFavorite }) }),
    onSuccess: refresh,
  });
  const toggleTrack = useMutation({
    mutationFn: ({ id, isTracked }: { id: string; isTracked: boolean }) =>
      api(`/candidates/${id}/flags`, { method: 'PATCH', body: JSON.stringify({ isTracked }) }),
    onSuccess: refresh,
  });
  const markViewed = useMutation({
    mutationFn: (id: string) => api(`/candidates/${id}/viewed`, { method: 'POST', body: '{}' }),
    onSuccess: refresh,
  });

  const items: any[] = list.data?.items || [];
  const vacancies = useMemo(() => {
    const map = new Map<string, { id: string; title: string; count: number; unviewed: number }>();
    for (const c of items) {
      const v = c.vacancy;
      if (!v?.id) continue;
      const cur = map.get(v.id) || { id: v.id, title: v.title || 'Без названия', count: 0, unviewed: 0 };
      cur.count += 1;
      if (!c.viewedAt) cur.unviewed += 1;
      map.set(v.id, cur);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [items]);

  const filtered = items.filter((c) => !vacancyFilter || c.vacancy?.id === vacancyFilter);
  const grouped = useMemo(() => {
    const map = new Map<string, { vacancy: any; candidates: any[] }>();
    for (const c of filtered) {
      const key = c.vacancy?.id || 'none';
      const g = map.get(key) || { vacancy: c.vacancy, candidates: [] };
      g.candidates.push(c);
      map.set(key, g);
    }
    return [...map.values()];
  }, [filtered]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AppShell
      title="Резерв по вакансиям"
      subtitle="Все откликнувшиеся и привязанные к вакансиям кандидаты — можно писать, править и удалять прямо здесь"
      actions={
        <div className="flex flex-wrap gap-2 items-center">
          {stats.data?.unviewed ? (
            <Badge color="rose">Новых: {stats.data.unviewed}</Badge>
          ) : (
            <Badge color="green">Всё просмотрено</Badge>
          )}
          <Button
            variant="ghost"
            onClick={() => api('/job-boards/sync-responses', { method: 'POST', body: JSON.stringify({ board: 'HH' }) }).then(refresh)}
          >
            Подтянуть отклики с HH
          </Button>
        </div>
      }
    >
      <Card className="p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <div className="text-xs text-[var(--muted)] mb-1">Поиск</div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ФИО, телефон, email" />
        </div>
        <div className="min-w-[220px]">
          <div className="text-xs text-[var(--muted)] mb-1">Вакансия</div>
          <Select value={vacancyFilter} onChange={(e) => setVacancyFilter(e.target.value)}>
            <option value="">Все вакансии ({items.length})</option>
            {vacancies.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} ({v.count}{v.unviewed ? `, новых ${v.unviewed}` : ''})
              </option>
            ))}
          </Select>
        </div>
        <label className="text-sm flex items-center gap-2 pb-2">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          Только непросмотренные
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
          }}
        >
          {selectMode ? `Выбрано: ${selected.size}` : 'Выбрать'}
        </Button>
        {selectMode && selected.size > 0 ? (
          <ConfirmDelete
            label={`Удалить выбранных (${selected.size})`}
            question={`Удалить ${selected.size} кандидатов безвозвратно?`}
            onConfirm={() => removeBulk.mutate([...selected])}
            pending={removeBulk.isPending}
          />
        ) : null}
      </Card>

      {list.isLoading ? <Empty text="Загрузка…" /> : null}
      {!list.isLoading && !grouped.length ? (
        <Empty text={onlyNew ? 'Новых откликов нет' : 'Пока нет кандидатов, привязанных к вакансиям'} />
      ) : null}

      <div className="space-y-6">
        {grouped.map((g) => (
          <section key={g.vacancy?.id || 'none'}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h2 className="font-bold text-[var(--brand-primary)] text-lg m-0">
                {g.vacancy ? (
                  <Link href={`/vacancies/${g.vacancy.id}`} className="sk-link">
                    {g.vacancy.title}
                  </Link>
                ) : (
                  'Без вакансии'
                )}
              </h2>
              <Badge color="blue">{g.candidates.length}</Badge>
              {g.candidates.some((c) => !c.viewedAt) ? (
                <Badge color="rose">новых {g.candidates.filter((c) => !c.viewedAt).length}</Badge>
              ) : null}
            </div>
            <div className="space-y-3">
              {g.candidates.map((c) => {
                const isNew = !c.viewedAt;
                return (
                  <Card
                    key={c.id}
                    className={clsx('p-4', isNew && 'ring-1')}
                    style={isNew ? { boxShadow: 'inset 3px 0 0 var(--sk-danger)' } : undefined}
                  >
                    <div className="flex flex-wrap gap-3 items-start justify-between">
                      <div className="flex gap-3 min-w-0 flex-1">
                        {selectMode ? (
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="mt-1" />
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/candidates/${c.id}`} className="font-bold sk-link" style={{ fontSize: 16 }}>
                              {fullName(c)}
                            </Link>
                            {isNew ? <Badge color="rose">новый</Badge> : null}
                            {c.stage?.name ? <Badge color="amber">{c.stage.name}</Badge> : null}
                          </div>
                          <div className="text-sm text-[var(--sk-muted)] mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            {c.phone ? <a href={`tel:${c.phone}`} className="sk-link">{c.phone}</a> : null}
                            {c.email ? <span>{c.email}</span> : null}
                            <span>{ruLabel(JOB_BOARD_LABELS, c.source, 'Источник')}</span>
                            {c.createdAt ? <span>{new Date(c.createdAt).toLocaleString('ru-RU')}</span> : null}
                          </div>
                          {c.desiredPosition || c.currentPosition ? (
                            <div className="text-sm mt-1">{c.desiredPosition || c.currentPosition}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Link href={`/candidates/${c.id}?edit=1`} className="sk-btn sk-btn-icon" title="Редактировать">
                          <Icon name="edit" />
                        </Link>
                        <button
                          type="button"
                          className="sk-btn sk-btn-icon"
                          title="Комментарий"
                          onClick={() => {
                            setCommentFor({ id: c.id, name: fullName(c) });
                            setComment('');
                          }}
                        >
                          <Icon name="comment" />
                        </button>
                        <button
                          type="button"
                          className="sk-btn sk-btn-icon"
                          title="Избранное"
                          onClick={() => toggleFav.mutate({ id: c.id, isFavorite: !c.isFavorite })}
                          style={c.isFavorite ? { color: '#f59e0b' } : undefined}
                        >
                          <Icon name="star" />
                        </button>
                        <button
                          type="button"
                          className="sk-btn sk-btn-icon"
                          title={c.isTracked ? 'Не отслеживать' : 'Отслеживать'}
                          onClick={() => toggleTrack.mutate({ id: c.id, isTracked: !c.isTracked })}
                          style={c.isTracked ? { color: 'var(--brand-secondary)' } : undefined}
                        >
                          <Icon name={c.isTracked ? 'eye' : 'eye-off'} />
                        </button>
                        {isNew ? (
                          <button type="button" className="sk-btn sk-btn-icon" title="Отметить просмотренным" onClick={() => markViewed.mutate(c.id)}>
                            <Icon name="check" />
                          </button>
                        ) : null}
                        <ConfirmDelete
                          iconOnly
                          question={`Удалить ${fullName(c)}?`}
                          onConfirm={() => removeOne.mutate(c.id)}
                          pending={removeOne.isPending}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Modal open={!!commentFor} title={`Комментарий · ${commentFor?.name || ''}`} onClose={() => setCommentFor(null)}>
        <div className="space-y-3">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Напишите комментарий…" style={{ minHeight: 100 }} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCommentFor(null)}>Отмена</Button>
            <Button disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
