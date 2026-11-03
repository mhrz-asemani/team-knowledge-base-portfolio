import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, apiRequest, apiStream } from './api';

type User = { id: string; email: string };
type Role = 'owner' | 'member' | 'viewer';
type Workspace = { id: string; name: string; role: Role; createdAt: string; updatedAt: string };
type Document = {
  id: string;
  workspaceId: string;
  createdBy: string;
  updatedBy: string;
  title: string;
  contentMarkdown: string;
  createdAt: string;
  updatedAt: string;
};
type Member = { userId: string; email: string; role: Role; createdAt: string };
type DocumentSummary = { summary: string; keyPoints: string[]; actionItems: string[]; model: string; latencyMs: number; usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number } | null };
type DocumentList = {
  documents: Document[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

const PAGE_SIZE = 10;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [sort, setSort] = useState<'updatedAt' | 'title' | 'createdAt'>('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState(0);
  const [summaryPreview, setSummaryPreview] = useState('');

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );

  const loadWorkspaces = useCallback(async (preferredId?: string) => {
    const result = await apiRequest<{ workspaces: Workspace[] }>('/workspaces');
    setWorkspaces(result.workspaces);
    const nextId = preferredId && result.workspaces.some((item) => item.id === preferredId)
      ? preferredId
      : result.workspaces[0]?.id ?? '';
    setWorkspaceId(nextId);
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!workspaceId) {
      setDocuments([]);
      setPageCount(0);
      setTotalDocuments(0);
      return;
    }
    setDocumentLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort,
        order,
      });
      if (appliedQuery) params.set('q', appliedQuery);
      const result = await apiRequest<DocumentList>(
        `/workspaces/${workspaceId}/documents?${params.toString()}`,
      );
      setDocuments(result.documents);
      setPageCount(result.pagination.totalPages);
      setTotalDocuments(result.pagination.totalItems);
      setError('');
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setDocumentLoading(false);
    }
  }, [workspaceId, page, sort, order, appliedQuery]);

  const loadMembers = useCallback(async () => {
    if (!workspaceId) {
      setMembers([]);
      return;
    }
    try {
      const result = await apiRequest<{ members: Member[] }>(`/workspaces/${workspaceId}/members`);
      setMembers(result.members);
    } catch (cause) {
      setMembers([]);
      setError(toMessage(cause));
    }
  }, [workspaceId]);

  const loadSession = useCallback(async () => {
    const result = await apiRequest<{ user: User }>('/auth/me');
    setUser(result.user);
    await loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    let active = true;
    apiRequest<{ user: User }>('/auth/me')
      .then(async (result) => {
        if (!active) return;
        setUser(result.user);
        const workspacesResult = await apiRequest<{ workspaces: Workspace[] }>('/workspaces');
        if (!active) return;
        setWorkspaces(workspacesResult.workspaces);
        setWorkspaceId(workspacesResult.workspaces[0]?.id ?? '');
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof ApiError && cause.status === 401)) {
          setError(toMessage(cause));
        }
      })
      .finally(() => {
        if (active) setBootLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setError('');
    setMessage('');
    try {
      if (authMode === 'register') {
        await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword }),
        });
        setAuthMode('login');
        setMessage('حساب ساخته شد. حالا با همان اطلاعات وارد شوید.');
      } else {
        await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: authEmail, password: authPassword }),
        });
        await loadSession();
        setMessage('با موفقیت وارد شدید.');
      }
      setAuthPassword('');
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    setError('');
    try {
      await apiRequest<void>('/auth/logout', { method: 'POST' });
      setUser(null);
      setWorkspaces([]);
      setWorkspaceId('');
      setDocuments([]);
      setMembers([]);
      setMessage('از حساب خارج شدید.');
    } catch (cause) {
      setError(toMessage(cause));
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest<{ workspace: Workspace }>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: workspaceName }),
      });
      setWorkspaceName('');
      await loadWorkspaces(result.workspace.id);
      setPage(1);
      setAppliedQuery('');
      setQuery('');
      setMessage('فضای کاری ساخته شد.');
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return;
    setSaving(true);
    setError('');
    try {
      if (editingDocument) {
        await apiRequest(`/workspaces/${workspaceId}/documents/${editingDocument.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: documentTitle, contentMarkdown: documentContent }),
        });
        setMessage('سند ذخیره شد.');
      } else {
        await apiRequest(`/workspaces/${workspaceId}/documents`, {
          method: 'POST',
          body: JSON.stringify({ title: documentTitle, contentMarkdown: documentContent }),
        });
        setMessage('سند ساخته شد.');
      }
      setEditingDocument(null);
      setViewingDocument(null);
      setDocumentTitle('');
      setDocumentContent('');
      setPage(1);
      await loadDocuments();
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function viewDocument(document: Document) {
    setViewingDocument(document);
    setSummary(null);
    setSummaryProgress(0);
    setSummaryPreview('');
    setMessage('');
    setError('');
  }

  async function summarizeDocument(document: Document) {
    setSummary(null);
    setSummaryProgress(0);
    setSummaryPreview('');
    setSummaryLoading(true);
    setError('');
    setMessage('');
    try {
      let completed = false;
      await apiStream(`/workspaces/${workspaceId}/documents/${document.id}/summarize`, (event) => {
        if (event.type === 'progress' && typeof event.receivedCharacters === 'number') setSummaryProgress(event.receivedCharacters);
        if (event.type === 'progress' && typeof event.partialSummary === 'string') setSummaryPreview(event.partialSummary);
        if (event.type === 'complete' && typeof event.result === 'object' && event.result !== null) {
          setSummary(event.result as DocumentSummary);
          completed = true;
        }
      });
      if (!completed) throw new ApiError('پاسخ خلاصه‌سازی ناقص بود. دوباره تلاش کنید.', 502, 'INCOMPLETE_AI_STREAM');
      setMessage('خلاصه سند آماده شد.');
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setSummaryLoading(false);
    }
  }
  function beginEdit(document: Document) {
    setViewingDocument(null);
    setEditingDocument(document);
    setDocumentTitle(document.title);
    setDocumentContent(document.contentMarkdown);
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteDocument(document: Document) {
    if (!window.confirm(`سند «${document.title}» حذف شود؟ این عملیات قابل بازگشت نیست.`)) return;
    setError('');
    try {
      await apiRequest<void>(`/workspaces/${workspaceId}/documents/${document.id}`, { method: 'DELETE' });
      if (documents.length === 1 && page > 1) setPage((current) => current - 1);
      else await loadDocuments();
      setMessage('سند حذف شد.');
    } catch (cause) {
      setError(toMessage(cause));
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/workspaces/${workspaceId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: memberEmail }),
      });
      setMemberEmail('');
      await loadMembers();
      setMessage('عضو به فضای کاری اضافه شد.');
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(member: Member, role: 'member' | 'viewer') {
    setError('');
    try {
      await apiRequest(`/workspaces/${workspaceId}/members/${member.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await loadMembers();
      setMessage('نقش عضو تغییر کرد.');
    } catch (cause) {
      setError(toMessage(cause));
    }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`عضویت ${member.email} حذف شود؟`)) return;
    setError('');
    try {
      await apiRequest<void>(`/workspaces/${workspaceId}/members/${member.userId}`, { method: 'DELETE' });
      await loadMembers();
      setMessage('عضو حذف شد.');
    } catch (cause) {
      setError(toMessage(cause));
    }
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  }

  function cancelEdit() {
    setEditingDocument(null);
    setViewingDocument(null);
    setDocumentTitle('');
    setDocumentContent('');
  }

  if (bootLoading) {
    return <main className="center-state" role="status">در حال بررسی نشست کاربر…</main>;
  }

  return (
    <div className="app" dir="rtl">
      <header className="topbar">
        <a className="brand" href="/" aria-label="صفحه اصلی پایگاه دانش">
          <span className="brand-mark" aria-hidden="true">K</span>
          <span><strong>پایگاه دانش تیم</strong><small>Team Knowledge Base</small></span>
        </a>
        <div className="topbar-actions">
          <span className="environment-label">نسخه اولیه · مرحله ۲</span>
          {user && <button className="button button-quiet" onClick={() => void logout()}>خروج</button>}
        </div>
      </header>

      {(error || message) && (
        <div className={`notice ${error ? 'notice-error' : 'notice-success'}`} role={error ? 'alert' : 'status'}>
          <span>{error || message}</span>
          <button className="notice-close" aria-label="بستن پیام" onClick={() => { setError(''); setMessage(''); }}>×</button>
        </div>
      )}

      {!user ? (
        <main className="auth-layout">
          <section className="auth-intro">
            <p className="eyebrow">دانش تیم، یک‌جا</p>
            <h1>دانش پراکنده را به دانشی مشترک تبدیل کنید.</h1>
            <p>فضاهای کاری بسازید، اسناد Markdown را مدیریت کنید و دانش تیم را در دسترس اعضای مجاز نگه دارید.</p>
            <div className="feature-points">
              <span>✓ فضای کاری مستقل</span><span>✓ دسترسی مبتنی بر نقش</span><span>✓ جست‌وجوی اسناد</span>
            </div>
          </section>
          <section className="panel auth-panel">
            <div className="panel-heading">
              <h2>{authMode === 'login' ? 'خوش برگشتید' : 'ساخت حساب کاربری'}</h2>
              <p>{authMode === 'login' ? 'برای ادامه وارد حساب خود شوید.' : 'برای شروع یک حساب بسازید.'}</p>
            </div>
            <form className="form-stack" onSubmit={(event) => void submitAuth(event)}>
              <label>ایمیل
                <input type="email" autoComplete="email" required maxLength={254} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" />
              </label>
              <label>گذرواژه
                <input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} required minLength={authMode === 'register' ? 12 : 1} maxLength={128} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder={authMode === 'register' ? 'حداقل ۱۲ نویسه' : 'گذرواژه شما'} />
              </label>
              <button className="button button-primary button-wide" disabled={authLoading} type="submit">
                {authLoading ? 'در حال پردازش…' : authMode === 'login' ? 'ورود به حساب' : 'ساخت حساب'}
              </button>
            </form>
            <p className="auth-switch">
              {authMode === 'login' ? 'حساب ندارید؟' : 'از قبل حساب دارید؟'}{' '}
              <button className="text-button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}>
                {authMode === 'login' ? 'ثبت‌نام کنید' : 'وارد شوید'}
              </button>
            </p>
          </section>
        </main>
      ) : (
        <main className="workspace-layout">
          <aside className="sidebar">
            <div className="sidebar-section">
              <p className="section-label">حساب کاربری</p>
              <div className="user-chip"><span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span><span className="user-email">{user.email}</span></div>
            </div>
            <div className="sidebar-section">
              <div className="section-heading"><p className="section-label">فضاهای کاری</p><span className="count-badge">{workspaces.length}</span></div>
              {workspaces.length === 0 && <p className="muted small">هنوز فضای کاری ندارید.</p>}
              <div className="workspace-list">
                {workspaces.map((workspace) => (
                  <button key={workspace.id} className={`workspace-option ${workspace.id === workspaceId ? 'is-selected' : ''}`} onClick={() => { setWorkspaceId(workspace.id); setPage(1); cancelEdit(); setViewingDocument(null); setMessage(''); }}>
                    <span className="workspace-icon">▦</span><span className="workspace-option-text"><strong>{workspace.name}</strong><small>{roleLabel(workspace.role)}</small></span>
                  </button>
                ))}
              </div>
              <form className="create-workspace-form" onSubmit={(event) => void createWorkspace(event)}>
                <label className="sr-only" htmlFor="workspace-name">نام فضای کاری جدید</label>
                <input id="workspace-name" required maxLength={120} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="نام فضای کاری جدید" />
                <button className="button button-outline button-wide" disabled={saving}>+ ساخت فضای کاری</button>
              </form>
            </div>
          </aside>

          <section className="main-content">
            {!selectedWorkspace ? (
              <div className="empty-hero panel">
                <span className="empty-icon">▦</span><h1>اولین فضای کاری خود را بسازید</h1>
                <p>فضای کاری محل نگهداری اسناد و مدیریت دسترسی اعضای تیم است.</p>
              </div>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">فضای کاری / {selectedWorkspace.name}</p>
                    <h1>{selectedWorkspace.name}</h1>
                    <p className="page-subtitle">اسناد تیم را ثبت کنید، پیدا کنید و به‌روز نگه دارید.</p>
                  </div>
                  <span className={`role-pill role-${selectedWorkspace.role}`}>{roleLabel(selectedWorkspace.role)}</span>
                </div>

                {viewingDocument && <section className="panel document-view-panel">
                  <div className="panel-heading document-view-heading"><div><p className="eyebrow">مشاهده سند</p><h2>{viewingDocument.title}</h2><p>آخرین تغییر: {formatDate(viewingDocument.updatedAt)}</p></div><div className="document-actions"><button className="button button-quiet" onClick={() => setViewingDocument(null)}>بستن</button>{selectedWorkspace.role !== 'viewer' && <button className="button button-primary" onClick={() => beginEdit(viewingDocument)}>ویرایش سند</button>}</div></div>
                  <pre className="markdown-content">{viewingDocument.contentMarkdown || 'این سند هنوز محتوایی ندارد.'}</pre>
                  <section className="ai-summary">
                    <div className="ai-summary-toolbar">
                      <div><h3>خلاصه‌سازی هوشمند</h3><p>خلاصه و نکات کلیدی از محتوای همین سند</p></div>
                      <button className="button button-primary" type="button" disabled={summaryLoading || !viewingDocument.contentMarkdown.trim()} onClick={() => void summarizeDocument(viewingDocument)}>
                        {summaryLoading ? 'در حال خلاصه‌سازی…' : summary ? 'تولید دوباره خلاصه' : 'خلاصه‌سازی با AI'}
                      </button>
                    </div>
                    {summaryLoading && <div className="ai-progress" role="status"><p>در حال تولید خلاصه… {summaryProgress.toLocaleString('fa-IR')} نویسه دریافت شد.</p>{summaryPreview && <p className="ai-stream-preview">{summaryPreview}</p>}</div>}
                    {summary && <div className="ai-summary-result">
                      <h4>خلاصه</h4><p>{summary.summary}</p>
                      <h4>نکات کلیدی</h4><ul>{summary.keyPoints.map((item, index) => <li key={index}>{item}</li>)}</ul>
                      {summary.actionItems.length > 0 && <><h4>اقدام‌های پیشنهادی</h4><ul>{summary.actionItems.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
                      <div className="ai-summary-meta"><span>مدل: {summary.model}</span><span>زمان: {(summary.latencyMs / 1000).toFixed(1)} ثانیه</span>
                        {summary.usage && <span>Token: {summary.usage.totalTokens.toLocaleString('fa-IR')} · هزینه تخمینی: ${summary.usage.estimatedCostUsd.toFixed(6)}</span>}
                      </div>
                    </div>}
                  </section>
                </section>}

                <section className="panel editor-panel">
                  <div className="panel-heading editor-heading">
                    <div><h2>{editingDocument ? 'ویرایش سند' : 'سند جدید'}</h2><p>محتوا به‌صورت Markdown ذخیره می‌شود.</p></div>
                    {editingDocument && <button className="button button-quiet" onClick={cancelEdit} type="button">لغو ویرایش</button>}
                  </div>
                  {selectedWorkspace.role === 'viewer' ? (
                    <p className="permission-note">نقش شما فقط اجازه مشاهده اسناد را می‌دهد.</p>
                  ) : (
                    <form className="document-form" onSubmit={(event) => void saveDocument(event)}>
                      <label>عنوان سند
                        <input required minLength={1} maxLength={200} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="مثلاً راهنمای شروع پروژه" />
                      </label>
                      <label>محتوای Markdown
                        <textarea rows={5} maxLength={100000} value={documentContent} onChange={(event) => setDocumentContent(event.target.value)} placeholder={'# عنوان\n\nمحتوای سند را اینجا بنویسید…'} />
                      </label>
                      <div className="form-footer"><span className="muted small">{documentContent.length.toLocaleString('fa-IR')} / ۱۰۰٬۰۰۰ نویسه</span><button className="button button-primary" disabled={saving}>{saving ? 'در حال ذخیره…' : editingDocument ? 'ذخیره تغییرات' : 'ایجاد سند'}</button></div>
                    </form>
                  )}
                </section>

                <section className="documents-section">
                  <div className="list-heading"><div><h2>اسناد</h2><p>{totalDocuments.toLocaleString('fa-IR')} سند در این فضا</p></div></div>
                  <div className="toolbar panel">
                    <form className="search-form" onSubmit={applySearch}>
                      <label className="sr-only" htmlFor="document-search">جست‌وجوی اسناد</label>
                      <span className="search-icon" aria-hidden="true">⌕</span>
                      <input id="document-search" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجو در عنوان و متن اسناد…" />
                      {appliedQuery && <button type="button" className="clear-search" onClick={() => { setQuery(''); setAppliedQuery(''); setPage(1); }}>پاک‌کردن</button>}
                      <button className="button button-outline" type="submit">جست‌وجو</button>
                    </form>
                    <div className="sort-controls">
                      <label>مرتب‌سازی
                        <select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1); }}>
                          <option value="updatedAt">آخرین تغییر</option><option value="createdAt">تاریخ ایجاد</option><option value="title">عنوان</option>
                        </select>
                      </label>
                      <button className="button button-quiet sort-direction" onClick={() => { setOrder(order === 'asc' ? 'desc' : 'asc'); setPage(1); }} aria-label={order === 'asc' ? 'نزولی کردن مرتب‌سازی' : 'صعودی کردن مرتب‌سازی'}>{order === 'asc' ? '↑ صعودی' : '↓ نزولی'}</button>
                    </div>
                  </div>

                  {documentLoading ? <div className="panel list-state" role="status"><span className="spinner" />در حال بارگذاری اسناد…</div> : documents.length === 0 ? (
                    <div className="panel list-state"><span className="empty-icon">⌕</span><h3>{appliedQuery ? 'نتیجه‌ای پیدا نشد' : 'هنوز سندی وجود ندارد'}</h3><p>{appliedQuery ? 'عبارت دیگری را جست‌وجو کنید.' : 'اولین سند این فضای کاری را با فرم بالا ایجاد کنید.'}</p></div>
                  ) : (
                    <div className="document-list">
                      {documents.map((document) => (
                        <article className="document-card panel" key={document.id}>
                          <div className="document-symbol">▤</div>
                          <div className="document-details">
                            <h3>{document.title}</h3>
                            <p className="document-preview">{document.contentMarkdown || 'این سند هنوز محتوایی ندارد.'}</p>
                            <div className="document-meta"><span>آخرین تغییر: {formatDate(document.updatedAt)}</span><span>نویسنده: {document.updatedBy === user.id ? 'شما' : 'عضو تیم'}</span></div>
                          </div>
                          <div className="document-actions">
                            <button className="button button-outline" onClick={() => viewDocument(document)}>مشاهده</button>{selectedWorkspace.role !== 'viewer' && <button className="button button-quiet" onClick={() => beginEdit(document)}>ویرایش</button>}
                            {selectedWorkspace.role !== 'viewer' && <button className="button button-danger-quiet" onClick={() => void deleteDocument(document)}>حذف</button>}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {pageCount > 1 && <div className="pagination"><span>صفحه {page.toLocaleString('fa-IR')} از {pageCount.toLocaleString('fa-IR')}</span><div><button className="button button-outline" disabled={page <= 1 || documentLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>قبلی</button><button className="button button-outline" disabled={page >= pageCount || documentLoading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>بعدی</button></div></div>}
                </section>

                <section className="panel members-panel">
                  <div className="panel-heading"><h2>اعضای فضای کاری</h2><p>مدیریت عضویت‌ها فقط برای مالک فعال است.</p></div>
                  {selectedWorkspace.role === 'owner' && <form className="add-member-form" onSubmit={(event) => void addMember(event)}><label className="sr-only" htmlFor="member-email">ایمیل عضو جدید</label><input id="member-email" type="email" required maxLength={254} value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="ایمیل کاربر ثبت‌نام‌شده" /><button className="button button-outline" disabled={saving}>افزودن عضو</button></form>}
                  <div className="members-list">
                    {members.map((member) => (
                      <div className="member-row" key={member.userId}>
                        <span className="avatar avatar-muted">{member.email.slice(0, 1).toUpperCase()}</span><span className="member-email">{member.email}</span>
                        {selectedWorkspace.role === 'owner' && member.role !== 'owner' ? <><select aria-label={`نقش ${member.email}`} value={member.role} onChange={(event) => void updateMember(member, event.target.value as 'member' | 'viewer')}><option value="member">عضو</option><option value="viewer">فقط مشاهده</option></select><button className="button button-danger-quiet" onClick={() => void removeMember(member)}>حذف</button></> : <span className={`role-pill role-${member.role}`}>{roleLabel(member.role)}</span>}
                      </div>
                    ))}
                    {members.length === 0 && <p className="muted small">فهرست اعضا خالی است یا بارگذاری نشده است.</p>}
                  </div>
                </section>
              </>
            )}
          </section>
        </main>
      )}
      <footer className="footer">Team Knowledge Base <span>·</span> دانش تیم، با دسترسی کنترل‌شده</footer>
    </div>
  );
}

function roleLabel(role: Role): string {
  return role === 'owner' ? 'مالک' : role === 'member' ? 'عضو' : 'فقط مشاهده';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function toMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return 'خطای پیش‌بینی‌نشده‌ای رخ داد. دوباره تلاش کنید.';
}
