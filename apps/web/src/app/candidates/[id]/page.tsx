'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell, Button, Card, Icon, Input, Modal, Select, Textarea } from '@/components/ui';
import { api, fullName } from '@/lib/api';
import clsx from 'clsx';

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
  const [tab, setTab] = useState(sp.get('tab') === 'comments' || sp.get('tab') === 'history' ? 'history' : 'resume');
  const [comment, setComment] = useState('');
  const [stageId, setStageId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(sp.get('edit') === '1');
  const [formType, setFormType] = useState(STATUS_FORMS[0].id);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [aiBox, setAiBox] = useState<any>(null);
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

  const createCheck = useMutation({
    mutationFn: (type: string) =>
      api('/checks', { method: 'POST', body: JSON.stringify({ candidateId: id, type }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidate', id] }),
  });

  const call = useMutation({
    mutationFn: () => api('/integrations/telephony/call', { method: 'POST', body: JSON.stringify({ phone: c.phone }) }),
    onSuccess: (res: any) => {
      if (res?.deeplink) window.open(res.deeplink, '_self');
    },
  });

  const score = useMutation({
    mutationFn: () => api(`/ai/candidates/${id}/score`, { method: 'POST', body: '{}' }),
    onSuccess: (res) => setAiBox(res),
  });
  const hints = useMutation({
    mutationFn: () => api(`/ai/candidates/${id}/hints`, { method: 'POST', body: '{}' }),
    onSuccess: (res) => setAiBox(res),
  });

  if (isLoading || !c) {
    return (
      <AppShell title="Кандидат">
        <div style={{ color: 'var(--sk-muted)' }}>Загрузка…</div>
      </AppShell>
    );
  }

  const stages = c.vacancy?.funnel?.stages || [];
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
              <Button variant="ghost" onClick={() => score.mutate()} disabled={score.isPending}>AI скоринг</Button>
              <Button variant="ghost" onClick={() => hints.mutate()} disabled={hints.isPending}>AI подсказки</Button>
            </div>
            {aiBox ? (
              <div style={{ marginTop: 12, padding: 12, background: '#f0fdfa', borderRadius: 8, fontSize: 13 }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{JSON.stringify(aiBox, null, 2)}</pre>
              </div>
            ) : null}
          </Card>

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
                    <div key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderBottom: '1px solid var(--sk-line)', padding: '8px 0' }}>
                      <span>{ch.type}</span><span style={{ fontWeight: 500 }}>{ch.status}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
                    <Button variant="ghost" onClick={() => createCheck.mutate('SECURITY')}>СБ</Button>
                    <Button variant="ghost" onClick={() => createCheck.mutate('HIRE_REQUEST')}>Приём</Button>
                    <Button variant="ghost" onClick={() => createCheck.mutate('FEEDBACK')}>ОС</Button>
                  </div>
                </div>
              )}
              {tab === 'offers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(c.offers || []).map((o: any) => (
                    <div key={o.id} style={{ fontSize: 14, borderBottom: '1px solid var(--sk-line)', padding: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{o.position} · {o.salary?.toLocaleString('ru-RU')} ₽</span><span>{o.status}</span>
                    </div>
                  ))}
                  <Button onClick={() => createOffer.mutate()}>Создать оффер</Button>
                </div>
              )}
              {tab === 'messengers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                  <a className="sk-link" href={messengers.data?.whatsapp} target="_blank" rel="noreferrer">WhatsApp WEB</a>
                  <a className="sk-link" href={messengers.data?.telegram} target="_blank" rel="noreferrer">Telegram WEB</a>
                  <a className="sk-link" href={messengers.data?.max} target="_blank" rel="noreferrer">MAX WEB</a>
                  <HhChatBlock candidateId={id} />
                </div>
              )}
              {tab === 'responses' && (
                <div style={{ fontSize: 14, color: 'var(--sk-muted)' }}>
                  {(c.responses || []).length
                    ? (c.responses || []).map((r: any) => <div key={r.id}>{r.board} · {new Date(r.receivedAt).toLocaleString('ru-RU')}</div>)
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
                {stages.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                      <span>{ch.type}</span><span style={{ color: 'var(--sk-muted)' }}>{ch.status}</span>
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
            {stages.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
        </div>
      </Modal>
    </AppShell>
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
