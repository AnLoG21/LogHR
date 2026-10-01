'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell, Button, Card, Icon, Input, Modal, Select, Textarea } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import {
  canMoveToStage,
  CHECK_STATUS_LABELS,
  CHECK_TYPE_LABELS,
  JOB_BOARD_LABELS,
  OFFER_STATUS_LABELS,
  ruLabel,
} from '@skillaz/shared';

const STATUS_FORMS = [
  { id: 'phone', label: 'Телефонное интервью', fields: ['result', 'comment'] },
  { id: 'reject', label: 'Отказ', fields: ['reason', 'comment'] },
  { id: 'interview', label: 'Интервью', fields: ['datetime', 'comment'] },
  { id: 'offer', label: 'К офферу', fields: ['salary', 'comment'] },
  { id: 'other', label: 'Прочее', fields: ['comment'] },
];

export default function CandidateDetailPage() {
  return (
    <Suspense fallback={<AppShell title="Кандидат"><div style={{ color: 'var(--sk-muted)' }}>Загрузка…</div></AppShell>}>
      <CandidateDetailInner />
    </Suspense>
  );
}

function CandidateDetailInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState(sp.get('tab') === 'comments' || sp.get('tab') === 'history' ? 'history' : 'resume');
  const [comment, setComment] = useState('');
  const [stageId, setStageId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(sp.get('edit') === '1');
  const [formType, setFormType] = useState(STATUS_FORMS[0].id);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState({
    firstName: '', lastName: '', middleName: '', phone: '', email: '', city: '', gender: '',
  });
  const [tagPick, setTagPick] = useState('');

  useEffect(() => {
    if (sp.get('tab') === 'comments' || sp.get('tab') === 'history') setTab('history');
    if (sp.get('edit') === '1') setEditOpen(true);
  }, [sp]);

  const { data: c, isLoading } = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => api<any>(`/candidates/${id}`),
  });
  const tagsCatalog = useQuery({ queryKey: ['tags'], queryFn: () => api<any[]>('/tags') });

  useEffect(() => {
    if (!c) return;
    setEditForm({
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      middleName: c.middleName || '',
      phone: c.phone || '',
      email: c.email || '',
      city: c.city || '',
      gender: c.gender || '',
    });
  }, [c]);

  const messengers = useQuery({
    queryKey: ['messengers', c?.phone],
    enabled: !!c?.phone,
    queryFn: () => api<any>(`/job-boards/messenger-links?phone=${encodeURIComponent(c.phone)}`),
  });

  const changeStage = useMutation({
    mutationFn: () =>
      api(`/candidates/${id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stageId, comment: formData.comment, formData }),
      }),
    onSuccess: () => {
      setFormOpen(false);
      setFormData({});
      qc.invalidateQueries({ queryKey: ['candidate', id] });
    },
  });

  const addComment = useMutation({
    mutationFn: () => api(`/candidates/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) }),
    onSuccess: () => {
      setComment('');
      qc.invalidateQueries({ queryKey: ['candidate', id] });
    },
  });

  const saveEdit = useMutation({
    mutationFn: () => api(`/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(editForm) }),
    onSuccess: () => {
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['candidate', id] });
      qc.invalidateQueries({ queryKey: ['candidate-ai', id] });
      qc.invalidateQueries({ queryKey: ['candidates'] });
    },
  });

  const saveTags = useMutation({
    mutationFn: (tagIds: string[]) =>
      api(`/candidates/${id}`, { method: 'PATCH', body: JSON.stringify({ tagIds }) }),
    onSuccess: () => {
      setTagPick('');
      qc.invalidateQueries({ queryKey: ['candidate', id] });
    },
  });

  const toggleFav = useMutation({
    mutationFn: () =>
      api(`/candidates/${id}/flags`, {
        method: 'PATCH',
        body: JSON.stringify({ isFavorite: !c?.isFavorite }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidate', id] });
      qc.invalidateQueries({ queryKey: ['candidates'] });
    },
  });

  const createOffer = useMutation({
    mutationFn: () =>
      api('/offers', {
        method: 'POST',
        body: JSON.stringify({
          candidateId: id,
          position: c?.vacancy?.title || c?.desiredPosition || 'Специалист',
          salary: 120000,
          conditions: 'Испытательный срок 3 месяца',
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidate', id] }),
  });

  const [approveLink, setApproveLink] = useState('');
  const createCheck = useMutation({
    mutationFn: (type: string) =>
      api('/checks', { method: 'POST', body: JSON.stringify({ candidateId: id, type }) }),
    onSuccess: (ch: any, type) => {
      qc.invalidateQueries({ queryKey: ['candidate', id] });
      if (type === 'FEEDBACK' && ch?.externalToken) {
        setApproveLink(`${window.location.origin}/public/check/${ch.externalToken}`);
      }
    },
  });

  const call = useMutation({
    mutationFn: () => api('/integrations/telephony/call', { method: 'POST', body: JSON.stringify({ phone: c.phone }) }),
    onSuccess: (res: any) => {
      if (res?.deeplink) window.open(res.deeplink, '_self');
    },
  });

  const insights = useQuery({
    queryKey: ['candidate-ai', id],
    queryFn: () => api<any>(`/ai/candidates/${id}/insights`),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const refreshInsights = useMutation({
    mutationFn: () => api<any>(`/ai/candidates/${id}/insights?refresh=1`),
    onSuccess: (res) => qc.setQueryData(['candidate-ai', id], res),
  });
  const refreshHh = useMutation({
    mutationFn: () => api(`/job-boards/candidates/${id}/refresh-resume`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidate', id] });
      qc.invalidateQueries({ queryKey: ['candidate-ai', id] });
    },
  });

  if (isLoading || !c) {
    return (
      <AppShell title="Кандидат">
        <div style={{ color: 'var(--sk-muted)' }}>Загрузка…</div>
      </AppShell>
    );
  }

  const stages = c.vacancy?.funnel?.stages || [];
  const stageOptions = stages.map((s: any) => {
    const allowed = !user || canMoveToStage(c.vacancy?.funnel?.transitions, s.code, user.role);
    return (
      <option key={s.id} value={s.id} disabled={!allowed && s.id !== c.stageId}>
        {allowed ? s.name : `🔒 ${s.name}`}
      </option>
    );
  });
  const currentTagIds = (c.tags || []).map((t: any) => t.tagId || t.tag?.id).filter(Boolean);
  const allTags = Array.isArray(tagsCatalog.data)
    ? tagsCatalog.data.flatMap((cat: any) => (cat.tags ? cat.tags.map((t: any) => ({ ...t, categoryName: cat.name })) : [cat]))
    : [];
  const tabs = [
    { id: 'resume', label: 'Резюме' },
    { id: 'history', label: 'История и комментарии' },
    { id: 'attachments', label: 'Вложения' },
    { id: 'checks', label: 'Проверки' },
    { id: 'offers', label: 'Офферы' },
    { id: 'messengers', label: 'Мессенджеры' },
    { id: 'responses', label: 'Отклики кандидата' },
  ];
  const age = c.birthDate ? new Date().getFullYear() - new Date(c.birthDate).getFullYear() : null;
  const wa = messengers.data?.whatsapp;

  return (
    <AppShell flush>
      <div className="detail-layout animate-rise">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                  {fullName(c)}
                  {age ? <span style={{ color: 'var(--sk-muted)', fontWeight: 400, fontSize: 18, marginLeft: 8 }}>{age} года</span> : null}
                </h1>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8, fontSize: 13, color: 'var(--sk-muted)' }}>
                  <span>Источник: {c.source === 'HH' ? 'HH' : 'Добавлен вручную'}</span>
                  {c.phone ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <a href={`tel:${c.phone}`} className="sk-link">{c.phone}</a>
                      {wa ? (
                        <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp"><Icon name="whatsapp" className="w-4 h-4" /></a>
                      ) : (
                        <Icon name="whatsapp" className="w-4 h-4" />
                      )}
                    </span>
                  ) : null}
                  {c.email ? <a href={`mailto:${c.email}`} className="sk-link">{c.email}</a> : null}
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {(c.tags || []).map((ct: any) => (
                    <span key={ct.id || ct.tagId} className="sk-status sk-status-blue" style={{ fontSize: 12 }}>
                      {ct.tag?.name || 'тег'}
                      <button
                        type="button"
                        style={{ marginLeft: 6, border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }}
                        onClick={() => saveTags.mutate(currentTagIds.filter((tid: string) => tid !== (ct.tagId || ct.tag?.id)))}
                        aria-label="remove tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <Select
                    value={tagPick}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      if (!currentTagIds.includes(v)) saveTags.mutate([...currentTagIds, v]);
                      setTagPick('');
                    }}
                    style={{ height: 32, maxWidth: 200, fontSize: 12 }}
                  >
                    <option value="">+ Тег</option>
                    {allTags.filter((t: any) => !currentTagIds.includes(t.id)).map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="candidate-avatar" style={{ width: 64, height: 64, fontSize: 18 }}>
                {c.photoUrl ? <img src={c.photoUrl} alt="" /> : `${(c.lastName || '?')[0]}${(c.firstName || '?')[0]}`}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--sk-line)' }}>
              <button
                type="button"
                className="sk-btn sk-btn-icon"
                title="Избранное"
                onClick={() => toggleFav.mutate()}
                style={c.isFavorite ? { color: '#f59e0b' } : undefined}
              >
                <Icon name="star" />
              </button>
              <Button variant="ghost" onClick={() => setEditOpen(true)}><Icon name="edit" className="w-4 h-4" /> Редактировать</Button>
              <Button variant="ghost" onClick={() => setTab('history')}><Icon name="comment" className="w-4 h-4" /> Добавить комментарий</Button>
              <Button variant="ghost" onClick={() => call.mutate()} disabled={!c.phone}>Позвонить</Button>
              <Button variant="ghost" onClick={() => setTab('messengers')} disabled={!c.phone}>
                <Icon name="whatsapp" className="w-4 h-4" /> WhatsApp
              </Button>
              <Button variant="ghost" onClick={() => createCheck.mutate('FEEDBACK')} disabled={createCheck.isPending}>
                На согласование
              </Button>
              {c.externalId && c.source === 'HH' ? (
                <Button
                  variant="ghost"
                  disabled={refreshHh.isPending}
                  onClick={() => refreshHh.mutate()}
                >
                  {refreshHh.isPending ? 'HH…' : 'Обновить с HH'}
                </Button>
              ) : null}
            </div>
            {approveLink ? (
              <div style={{ marginTop: 12, padding: 12, background: '#f0fdfa', borderRadius: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Ссылка для заказчика</div>
                <a href={approveLink} className="sk-link" target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{approveLink}</a>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="sk-link"
                    style={{ fontSize: 12 }}
                    onClick={() => navigator.clipboard?.writeText(approveLink)}
                  >
                    Скопировать
                  </button>
                  <button type="button" className="sk-link" style={{ fontSize: 12 }} onClick={() => setApproveLink('')}>Скрыть</button>
                </div>
              </div>
            ) : null}
          </Card>

          <AiWidgets
            data={insights.data}
            loading={insights.isLoading || refreshInsights.isPending}
            error={insights.isError}
            onRefresh={() => refreshInsights.mutate()}
          />

          <Card style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 20px', borderBottom: '1px solid var(--sk-line)', display: 'flex', overflowX: 'auto' }}>
              {tabs.map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} className={clsx('sk-tab', tab === t.id && 'active')} style={{ whiteSpace: 'nowrap' }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ padding: 20 }}>
              {tab === 'resume' && (
                <div>
                  <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Резюме кандидата</h2>
                  <div style={{ borderRadius: 8, background: '#f5f7f9', padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Общая информация</div>
                    <div className="meta-grid" style={{ marginTop: 0 }}>
                      <div className="meta-row"><span className="meta-label">ФИО</span><span>{fullName(c)}</span></div>
                      <div className="meta-row"><span className="meta-label">Дата рождения</span><span>{c.birthDate ? new Date(c.birthDate).toLocaleDateString('ru-RU') : '—'}</span></div>
                      <div className="meta-row"><span className="meta-label">Пол</span><span>{c.gender === 'FEMALE' ? 'Женский' : c.gender === 'MALE' ? 'Мужской' : '—'}</span></div>
                      <div className="meta-row"><span className="meta-label">Телефон</span><span>{c.phone || '—'}</span></div>
                      <div className="meta-row"><span className="meta-label">Email</span><span>{c.email || '—'}</span></div>
                      <div className="meta-row"><span className="meta-label">Город</span><span>{c.city || '—'}</span></div>
                    </div>
                  </div>
                  <div style={{ marginTop: 16, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--sk-label)' }}>
                    {c.about || c.resumeText || 'Текст резюме не загружен'}
                  </div>
                </div>
              )}
              {tab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий…" />
                    <Button disabled={!comment || addComment.isPending} onClick={() => addComment.mutate()}>Добавить</Button>
                  </div>
                  {(c.comments || []).map((cm: any) => (
                    <div key={cm.id} style={{ borderBottom: '1px solid var(--sk-line)', paddingBottom: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--sk-muted)' }}>
                        {cm.author ? `${cm.author.lastName} ${cm.author.firstName}` : 'Система'} · {new Date(cm.createdAt).toLocaleString('ru-RU')}
                      </div>
                      <div style={{ fontSize: 14, marginTop: 4 }}>{cm.body}</div>
                    </div>
                  ))}
                  {(c.statusHistory || []).map((h: any) => (
                    <div key={h.id} style={{ fontSize: 14, color: 'var(--sk-muted)' }}>
                      → <strong style={{ color: 'var(--sk-ink)' }}>{h.stage?.name}</strong>
                      {h.comment ? ` — ${h.comment}` : ''}{' '}
                      <span style={{ fontSize: 12 }}>{new Date(h.createdAt).toLocaleString('ru-RU')}</span>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'attachments' && (
                <div style={{ fontSize: 14, color: 'var(--sk-muted)' }}>
                  {(c.attachments || []).length ? (c.attachments || []).map((a: any) => <div key={a.id}>{a.fileName}</div>) : 'Нет вложений'}
                </div>
              )}
              {tab === 'checks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(c.checks || []).map((ch: any) => (
                    <div key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, borderBottom: '1px solid var(--sk-line)', padding: '8px 0', alignItems: 'center' }}>
                      <span>
                        {ruLabel(CHECK_TYPE_LABELS, ch.type)}
                        {ch.externalToken ? (
                          <>
                            {' · '}
                            <a className="sk-link" href={`/public/check/${ch.externalToken}`} target="_blank" rel="noreferrer">ссылка</a>
                          </>
                        ) : null}
                      </span>
                      <span style={{ fontWeight: 500 }}>{ruLabel(CHECK_STATUS_LABELS, ch.status)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 8, flexWrap: 'wrap' }}>
                    <Button variant="ghost" onClick={() => createCheck.mutate('SECURITY')}>СБ</Button>
                    <Button variant="ghost" onClick={() => createCheck.mutate('HIRE_REQUEST')}>Приём</Button>
                    <Button variant="ghost" onClick={() => createCheck.mutate('FEEDBACK')}>На согласование</Button>
                  </div>
                </div>
              )}
              {tab === 'offers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(c.offers || []).map((o: any) => (
                    <div key={o.id} style={{ fontSize: 14, borderBottom: '1px solid var(--sk-line)', padding: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{o.position} · {o.salary?.toLocaleString('ru-RU')} ₽</span><span>{ruLabel(OFFER_STATUS_LABELS, o.status)}</span>
                    </div>
                  ))}
                  <Button onClick={() => createOffer.mutate()}>Создать оффер</Button>
                </div>
              )}
              {tab === 'messengers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                  <WhatsappTemplatesBlock candidateId={id} hasPhone={Boolean(c.phone)} />
                  <a className="sk-link" href={messengers.data?.whatsapp} target="_blank" rel="noreferrer">WhatsApp WEB</a>
                  <a className="sk-link" href={messengers.data?.telegram} target="_blank" rel="noreferrer">Telegram WEB</a>
                  <a className="sk-link" href={messengers.data?.max} target="_blank" rel="noreferrer">MAX WEB</a>
                  <HhChatBlock candidateId={id} />
                </div>
              )}
              {tab === 'responses' && (
                <div style={{ fontSize: 14, color: 'var(--sk-muted)' }}>
                  {(c.responses || []).length
                    ? (c.responses || []).map((r: any) => <div key={r.id}>{ruLabel(JOB_BOARD_LABELS, r.board)} · {new Date(r.receivedAt).toLocaleString('ru-RU')}</div>)
                    : 'Откликов нет'}
                </div>
              )}
            </div>
          </Card>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--sk-muted)', marginBottom: 4 }}>Статус</div>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{c.stage?.name || 'Без статуса'}</div>
            <Button style={{ width: '100%', marginTop: 12 }} onClick={() => { setStageId(c.stageId || ''); setFormOpen(true); }}>
              Изменить статус кандидата
            </Button>
            <div style={{ marginTop: 12 }}>
              <Select value={stageId || c.stageId || ''} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Выберите этап</option>
                {stageOptions}
              </Select>
            </div>
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Проверки</div>
            {(c.checks || []).length === 0
              ? <div style={{ fontSize: 13, color: 'var(--sk-muted)' }}>Нет запущенных проверок</div>
              : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  {(c.checks || []).map((ch: any) => (
                    <li key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{ruLabel(CHECK_TYPE_LABELS, ch.type)}</span><span style={{ color: 'var(--sk-muted)' }}>{ruLabel(CHECK_STATUS_LABELS, ch.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
          <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div>
              <div style={{ color: 'var(--sk-muted)', marginBottom: 2 }}>Заявка</div>
              {c.hiringRequest
                ? <Link href={`/requests/${c.hiringRequest.id}`} className="sk-link" style={{ fontWeight: 500 }}>{c.hiringRequest.title}</Link>
                : <span style={{ color: 'var(--sk-muted)' }}>—</span>}
            </div>
            <div>
              <div style={{ color: 'var(--sk-muted)', marginBottom: 2 }}>Вакансия</div>
              {c.vacancy
                ? <Link href={`/vacancies/${c.vacancy.id}`} className="sk-link" style={{ fontWeight: 500 }}>{c.vacancy.title}</Link>
                : <span style={{ color: 'var(--sk-muted)' }}>—</span>}
            </div>
          </Card>
        </aside>
      </div>

      <Modal open={editOpen} title="Редактировать кандидата" onClose={() => setEditOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input placeholder="Фамилия" value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
          <Input placeholder="Имя" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
          <Input placeholder="Отчество" value={editForm.middleName} onChange={(e) => setEditForm({ ...editForm, middleName: e.target.value })} />
          <Input placeholder="Телефон" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          <Input placeholder="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          <Input placeholder="Город" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
          <Select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
            <option value="">Пол</option>
            <option value="MALE">Мужской</option>
            <option value="FEMALE">Женский</option>
          </Select>
          <Button disabled={!editForm.firstName || !editForm.lastName || saveEdit.isPending} onClick={() => saveEdit.mutate()}>
            Сохранить
          </Button>
        </div>
      </Modal>

      <Modal open={formOpen} title="Форма смены статуса" onClose={() => setFormOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">Этап воронки</option>
            {stageOptions}
          </Select>
          <Select value={formType} onChange={(e) => setFormType(e.target.value)}>
            {STATUS_FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>
          {(STATUS_FORMS.find((f) => f.id === formType)?.fields || []).map((field) =>
            field === 'comment' ? (
              <Textarea key={field} placeholder="Комментарий" value={formData[field] || ''} onChange={(e) => setFormData({ ...formData, [field]: e.target.value })} />
            ) : (
              <Input key={field} placeholder={field} value={formData[field] || ''} onChange={(e) => setFormData({ ...formData, [field]: e.target.value })} />
            ),
          )}
          <Button disabled={!stageId || changeStage.isPending} onClick={() => changeStage.mutate()}>Подтвердить перевод</Button>
          {changeStage.error ? <div style={{ fontSize: 13, color: '#b91c1c' }}>{(changeStage.error as Error).message}</div> : null}
        </div>
      </Modal>
    </AppShell>
  );
}

function AiWidgets({ data, loading, error, onRefresh }: { data: any; loading: boolean; error: boolean; onRefresh: () => void }) {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const hints = list(data?.hints);
  const risks = list(data?.risks);
  const strengths = list(data?.strengths);
  const score = typeof data?.score === 'number' ? data.score : null;
  const tone = score == null ? '#64748b' : score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  const source = !data
    ? ''
    : data.stub
      ? 'Эвристика (AI-провайдер недоступен)'
      : String(data.provider || '').startsWith('openrouter')
        ? 'OpenRouter'
        : 'AI';
  const placeholder = (text: string) => <div style={{ fontSize: 13, color: 'var(--sk-muted)' }}>{text}</div>;
  const header = (title: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {source ? <div style={{ fontSize: 11, color: 'var(--sk-muted)' }}>{source}</div> : null}
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      <Card style={{ padding: 16 }}>
        {header('AI скоринг')}
        {loading && !data ? placeholder('Анализируем профиль…') : error && !data ? placeholder('Не удалось получить оценку') : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                  display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700, color: tone,
                  background: `conic-gradient(${tone} ${(score ?? 0) * 3.6}deg, var(--sk-line) 0deg)`,
                }}
              >
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center' }}>
                  {score ?? '—'}
                </div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>{data?.rationale}</div>
            </div>
            {strengths.length ? (
              <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: '#047857' }}>
                {strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            ) : null}
            {risks.length ? (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: '#b91c1c' }}>
                {risks.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            ) : null}
          </>
        )}
      </Card>
      <Card style={{ padding: 16, display: 'flex', flexDirection: 'column' }}>
        {header('AI подсказки для интервью')}
        {loading && !data ? placeholder('Готовим вопросы…') : error && !data ? placeholder('Не удалось получить подсказки') : hints.length ? (
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hints.map((h, i) => <li key={i}>{h}</li>)}
          </ol>
        ) : placeholder('Подсказок нет')}
        <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--sk-muted)' }}>
          <span>{data?.generatedAt ? `Обновлено ${new Date(data.generatedAt).toLocaleString('ru-RU')}` : ''}</span>
          <button type="button" className="sk-link" onClick={onRefresh} disabled={loading} style={{ fontSize: 12 }}>
            {loading ? 'Обновляем…' : 'Пересчитать'}
          </button>
        </div>
      </Card>
    </div>
  );
}

function WhatsappTemplatesBlock({ candidateId, hasPhone }: { candidateId: string; hasPhone: boolean }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ phone: string; url: string } | null>(null);
  const templates = useQuery({
    queryKey: ['notification-templates'],
    queryFn: () => api<any[]>('/notifications/templates'),
    staleTime: 5 * 60_000,
  });
  const waTemplates = (templates.data || []).filter((t) => t.channel === 'WHATSAPP' && t.isActive);
  const render = useMutation({
    mutationFn: (templateCode: string) =>
      api<any>('/notifications/whatsapp', {
        method: 'POST',
        body: JSON.stringify({ candidateId, templateCode, dryRun: true }),
      }),
    onSuccess: (res) => {
      setText(res.text);
      setPreview({ phone: res.phone, url: res.url });
    },
  });
  const log = useMutation({
    mutationFn: () =>
      api('/notifications/whatsapp', {
        method: 'POST',
        body: JSON.stringify({ candidateId, templateCode: code || undefined, text }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidate', candidateId] }),
  });

  if (!hasPhone) {
    return <div style={{ fontSize: 13, color: 'var(--sk-muted)' }}>Укажите телефон кандидата, чтобы писать в WhatsApp.</div>;
  }
  const open = () => {
    if (!preview || !text.trim()) return;
    window.open(`https://wa.me/${preview.phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    log.mutate();
  };

  return (
    <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="whatsapp" className="w-4 h-4" /> Написать по шаблону
      </div>
      <Select
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          if (e.target.value) render.mutate(e.target.value);
        }}
      >
        <option value="">Выберите шаблон…</option>
        {waTemplates.map((t) => <option key={t.id} value={t.code}>{t.subject}</option>)}
      </Select>
      {render.error ? <div style={{ fontSize: 12, color: '#b91c1c' }}>{(render.error as Error).message}</div> : null}
      {preview ? (
        <>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button onClick={open} disabled={!text.trim()}>Открыть WhatsApp</Button>
            <span style={{ fontSize: 12, color: 'var(--sk-muted)' }}>
              +{preview.phone}. Текст подставится в чат, отправка — кнопкой в WhatsApp. Сообщение сохранится в истории.
            </span>
          </div>
          {log.isSuccess ? <div style={{ fontSize: 12, color: '#15803d' }}>Записано в комментарии кандидата</div> : null}
        </>
      ) : null}
    </div>
  );
}

function HhChatBlock({ candidateId }: { candidateId: string }) {
  const [text, setText] = useState('');
  const qc = useQueryClient();
  const chat = useQuery({
    queryKey: ['hh-chat', candidateId],
    queryFn: () => api<any>(`/integrations/hh-chat/${candidateId}`),
  });
  const send = useMutation({
    mutationFn: () =>
      api(`/integrations/hh-chat/${candidateId}`, { method: 'POST', body: JSON.stringify({ text }) }),
    onSuccess: (res: any) => {
      if (res?.ok) {
        setText('');
        qc.invalidateQueries({ queryKey: ['hh-chat', candidateId] });
      }
    },
  });
  return (
    <div style={{ marginTop: 8, padding: 12, background: '#f5f7f9', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 600 }}>Чат HH</div>
        <Button variant="ghost" onClick={() => chat.refetch()} disabled={chat.isFetching}>Обновить</Button>
      </div>
      {chat.isLoading ? <div style={{ color: 'var(--sk-muted)' }}>Загрузка…</div> : null}
      {chat.data ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--sk-muted)' }}>{chat.data.note}</div>
          {!chat.data.configured ? (
            <div style={{ fontSize: 12, marginTop: 4 }}>Статус: не настроено (HH_CHAT_TOKEN / HH_ACCESS_TOKEN)</div>
          ) : (
            <>
              {chat.data.negotiationId ? (
                <div style={{ fontSize: 11, color: 'var(--sk-muted)', marginTop: 4 }}>negotiation: {chat.data.negotiationId}</div>
              ) : null}
              <div style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', display: 'grid', gap: 6 }}>
                {(chat.data.messages || []).map((m: any) => (
                  <div
                    key={m.id}
                    style={{
                      fontSize: 13,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: m.fromEmployer ? '#e8f5f3' : '#fff',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--sk-muted)', marginBottom: 2 }}>
                      {m.fromEmployer ? 'Работодатель' : 'Кандидат'}
                      {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString('ru-RU')}` : ''}
                    </div>
                    {m.text || '—'}
                  </div>
                ))}
                {chat.data.live && !(chat.data.messages || []).length ? (
                  <div style={{ fontSize: 12, color: 'var(--sk-muted)' }}>Сообщений нет</div>
                ) : null}
              </div>
              {chat.data.negotiationId ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Input
                    placeholder="Сообщение в HH…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button disabled={!text.trim() || send.isPending} onClick={() => send.mutate()}>Отправить</Button>
                </div>
              ) : null}
              {send.data && !(send.data as any).ok ? (
                <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{(send.data as any).note}</div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
