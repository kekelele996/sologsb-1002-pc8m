import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightOutlined, BranchesOutlined, CheckOutlined, CloseOutlined,
  CommentOutlined, DiffOutlined, DeleteOutlined, EditOutlined, FileDoneOutlined, FileTextOutlined,
  HistoryOutlined, LockOutlined, MenuFoldOutlined, MessageOutlined, PlusOutlined,
  RedoOutlined, SaveOutlined, SendOutlined, SwapOutlined, UndoOutlined, UnlockOutlined, WarningOutlined,
} from '@ant-design/icons'
import { Alert, Badge, Button, Card, Checkbox, Empty, Input, Modal, Radio, Segmented, Select, Space, Tag, message } from 'antd'
import { submitRemotePatch } from './services/mockApi'
import { useReviewStore } from './store/review'
import { buildSnippetRanges, countOccurrences } from './snippets'
import type { Comment, CommentType, Paragraph, Role, SuggestionSnippet } from './types'

const roleMeta: Record<Role, { label: string; description: string; color: string }> = {
  author: { label: '作者工作区', description: '编辑正文，在修订模式里逐条接受或拒绝审稿人的替换片段', color: '#2f6f5e' },
  reviewer: { label: '审稿人工作区', description: '选中原句填写新句，提交可定位的替换片段并参与讨论', color: '#9a5b25' },
  editor: { label: '编辑工作区', description: '合并重复意见、锁定已确认段落并比较版本', color: '#5b4d8e' },
}
const roleIcon = (role: Role) => role === 'author' ? <FileDoneOutlined /> : role === 'reviewer' ? <CommentOutlined /> : <BranchesOutlined />
const formatDate = (value: number) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const staleText = (stale: SuggestionSnippet['stale']) => stale === 'missing'
  ? '原句在正文中已找不到，片段过期'
  : stale === 'multiple'
    ? '原句在段落中出现多次，无法唯一定位'
    : ''

export default function App() {
  const {
    role, paragraphs, comments, versions, selectedParagraphId, commentFilter, revisionMode, dirty, conflicts,
    setRole, selectParagraph, setCommentFilter, setRevisionMode, updateParagraph, addComment, replyComment,
    resolveSnippet, mergeComment, toggleLock, createVersion, addConflict, resolveConflict, dismissConflict,
    undo, redo, save, resetDemo,
  } = useReviewStore()
  const [composerOpen, setComposerOpen] = useState(false)
  const [commentType, setCommentType] = useState<CommentType>('comment')
  const [commentBody, setCommentBody] = useState('')
  const [quote, setQuote] = useState('')
  const [snippetDrafts, setSnippetDrafts] = useState<Array<{ quote: string; replacement: string }>>([])
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({})
  const [flashSnippetId, setFlashSnippetId] = useState('')
  const [versionOpen, setVersionOpen] = useState(false)
  const [versionA, setVersionA] = useState(versions[1]?.id ?? versions[0]?.id)
  const [versionB, setVersionB] = useState(versions[0]?.id)
  const [versionLabel, setVersionLabel] = useState('')

  const selected = paragraphs.find((paragraph) => paragraph.id === selectedParagraphId) ?? paragraphs[0]
  const sections = useMemo(() => Array.from(new Set(paragraphs.map((paragraph) => paragraph.section))), [paragraphs])
  const paragraphCommentCounts = useMemo(() => comments.reduce<Record<string, number>>((acc, comment) => {
    acc[comment.paragraphId] = (acc[comment.paragraphId] ?? 0) + 1
    return acc
  }, {}), [comments])
  const duplicateParagraphIds = useMemo(() => new Set(Object.entries(paragraphCommentCounts).filter(([, count]) => count > 1).map(([id]) => id)), [paragraphCommentCounts])
  const visibleComments = useMemo(() => comments.filter((comment) => {
    if (commentFilter === 'open') return comment.status === 'open'
    if (commentFilter === 'suggestion') return comment.type === 'suggestion' && comment.status === 'open'
    if (commentFilter === 'duplicate') return duplicateParagraphIds.has(comment.paragraphId) && comment.status === 'open'
    return true
  }).sort((a, b) => b.createdAt - a.createdAt), [commentFilter, comments, duplicateParagraphIds])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      const state = useReviewStore.getState()
      const index = state.paragraphs.findIndex((paragraph) => paragraph.id === state.selectedParagraphId)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.shiftKey ? state.redo() : state.undo()
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); state.redo()
      } else if (event.key.toLowerCase() === 'j') {
        event.preventDefault(); const next = state.paragraphs[Math.min(state.paragraphs.length - 1, index + 1)]; if (next) state.selectParagraph(next.id)
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault(); const previous = state.paragraphs[Math.max(0, index - 1)]; if (previous) state.selectParagraph(previous.id)
      } else if (event.key.toLowerCase() === 't') {
        event.preventDefault(); state.setRevisionMode(!state.revisionMode)
      } else if (event.key.toLowerCase() === 'l' && state.role === 'editor') {
        event.preventDefault(); state.toggleLock(state.selectedParagraphId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const scrollToParagraph = (id: string) => {
    selectParagraph(id)
    document.getElementById(`paragraph-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const focusSnippet = (paragraphId: string, commentId: string, snippetId: string) => {
    selectParagraph(paragraphId)
    setCommentFilter('all')
    window.setTimeout(() => {
      document.getElementById(`snippet-${snippetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      document.getElementById(`comment-${commentId}`)?.classList.add('flash')
      setFlashSnippetId(snippetId)
      window.setTimeout(() => {
        setFlashSnippetId('')
        document.getElementById(`comment-${commentId}`)?.classList.remove('flash')
      }, 1800)
    }, 80)
  }
  const openComposer = (type: CommentType) => {
    const selectedText = window.getSelection()?.toString().trim()
    const inParagraph = selectedText && selected?.text.includes(selectedText) ? selectedText : ''
    setQuote(inParagraph || (selected?.text.slice(0, 64) ?? ''))
    setCommentBody('')
    if (type === 'suggestion') {
      setSnippetDrafts([{ quote: inParagraph, replacement: '' }])
      if (!inParagraph) message.info('请先在正文中选中要替换的原句，也可在弹窗里手动填写')
    } else {
      setSnippetDrafts([])
    }
    setCommentType(type)
    setComposerOpen(true)
  }
  const submitComment = () => {
    if (!selected || !commentBody.trim()) { message.warning('请填写批注内容'); return }
    if (commentType === 'suggestion') {
      const valid = snippetDrafts
        .map((draft) => ({ quote: draft.quote.trim(), replacement: draft.replacement.trim() }))
        .filter((draft) => draft.quote && draft.replacement)
      if (!valid.length) { message.warning('请至少填写一条“原句 → 新句”片段'); return }
      addComment({ paragraphId: selected.id, type: 'suggestion', quote: valid[0].quote, body: commentBody.trim(), snippets: valid })
      message.success('可定位的替换片段已提交，作者可逐句接受')
    } else {
      addComment({ paragraphId: selected.id, type: 'comment', quote, body: commentBody.trim() })
      message.success('段落批注已添加')
    }
    setCommentBody(''); setSnippetDrafts([]); setQuote(''); setComposerOpen(false)
  }
  const handleResolveSnippet = (commentId: string, snippetId: string, accepted: boolean) => {
    const result = resolveSnippet(commentId, snippetId, accepted)
    if (!result.ok && result.reason) {
      message.error(result.reason === 'missing' ? '原句在正文中找不到，已停止接受并标出过期' : '原句在段落中出现多次，已停止接受并标出过期')
      return
    }
    if (!result.ok) { message.warning('该片段当前无法处理（段落可能已锁定）'); return }
    message.success(accepted ? '已采纳该句，段落其他文字保持原样' : '已拒绝该片段，正文保持原样')
  }
  const handleMockConflict = async () => {
    if (!selected) return
    const response = await submitRemotePatch(selected)
    addConflict({
      id: `conflict-${Date.now()}`, paragraphId: selected.id, localText: selected.text, remoteText: response.remoteText,
      localAuthor: roleMeta[role].label, remoteAuthor: response.remoteAuthor, detectedAt: Date.now(),
    })
    message.warning('模拟接口返回了同段落的远端修改，请处理冲突')
  }
  const handleCreateVersion = () => {
    createVersion(versionLabel.trim())
    setVersionLabel('')
    message.success('当前版本已保存')
  }
  const comparedA = versions.find((version) => version.id === versionA)
  const comparedB = versions.find((version) => version.id === versionB)
  const comparedRows = comparedA && comparedB ? comparedA.paragraphs.map((paragraph, index) => ({ a: paragraph, b: comparedB.paragraphs[index] })) : []

  /** 依据片段区间把段落正文切成普通文本与高亮片段；修订模式下已接受片段显示删除原句、插入新句 */
  const renderMarkedText = (paragraph: Paragraph, variant: 'normal' | 'revision') => {
    const items = comments
      .filter((comment) => comment.paragraphId === paragraph.id && comment.status !== 'merged')
      .flatMap((comment) => comment.snippets.map((snippet) => ({ commentId: comment.id, snippet })))
    const ranges = buildSnippetRanges(paragraph.text, items)
    const nodes: React.ReactNode[] = []
    let cursor = 0
    ranges.forEach((range, index) => {
      if (range.start > cursor) nodes.push(paragraph.text.slice(cursor, range.start))
      if (variant === 'revision' && range.kind === 'accepted') {
        nodes.push(
          <span key={index} className="snippet-revision-pair">
            <mark className="snippet-del">{range.quote}</mark>
            <mark className="snippet-ins">{range.replacement}</mark>
          </span>,
        )
      } else if (range.kind === 'pending') {
        nodes.push(
          <mark
            key={index}
            className={`snippet-pending${range.snippetId === flashSnippetId ? ' flash' : ''}`}
            title="点击在右侧查看并处理该替换片段"
            onClick={(event) => { event.stopPropagation(); focusSnippet(paragraph.id, range.commentId, range.snippetId) }}
          >
            {paragraph.text.slice(range.start, range.end)}
          </mark>,
        )
      } else {
        nodes.push(<mark key={index} className="snippet-accepted">{paragraph.text.slice(range.start, range.end)}</mark>)
      }
      cursor = range.end
    })
    if (cursor < paragraph.text.length) nodes.push(paragraph.text.slice(cursor))
    return nodes
  }

  const staleSnippetsOf = (paragraph: Paragraph) => comments
    .filter((comment) => comment.paragraphId === paragraph.id && comment.status !== 'merged')
    .flatMap((comment) => comment.snippets
      .filter((snippet) => snippet.status === 'pending' && snippet.stale)
      .map((snippet) => ({ commentId: comment.id, snippet })))

  return (
    <div className="review-app">
      <header className="app-header">
        <div className="paper-identity">
          <div className="paper-mark">CR</div>
          <div><h1>学术论文协作审阅台</h1><p>Collaborative Research Review · MS-2026-0417</p></div>
        </div>
        <div className="role-switch">
          <Segmented block value={role} onChange={(value) => setRole(value as Role)} options={(Object.keys(roleMeta) as Role[]).map((item) => ({ label: <span>{roleIcon(item)} {roleMeta[item].label.replace('工作区', '')}</span>, value: item }))} />
        </div>
        <Space>
          <Badge dot={dirty}><Button icon={<SaveOutlined />} onClick={() => { save(); message.success('草稿已保存到浏览器') }}>保存</Button></Badge>
          <Button icon={<UndoOutlined />} disabled={!useReviewStore.getState().past.length} onClick={undo} />
          <Button icon={<RedoOutlined />} disabled={!useReviewStore.getState().future.length} onClick={redo} />
          <Button danger={conflicts.length > 0} icon={<SwapOutlined />} onClick={() => void handleMockConflict()}>模拟冲突</Button>
        </Space>
      </header>

      <div className="role-banner" style={{ '--role-color': roleMeta[role].color } as React.CSSProperties}>
        <span className="role-badge">{roleIcon(role)} {roleMeta[role].label}</span>
        <span>{roleMeta[role].description}</span>
        <span className="paper-state"><FileTextOutlined /> 论文正文 v2.4</span>
      </div>

      {conflicts.length > 0 && (
        <div className="conflict-stack">
          {conflicts.map((conflict) => (
            <Alert
              key={conflict.id} type="error" showIcon message={`段落冲突：${conflict.localAuthor} 与 ${conflict.remoteAuthor} 同时修改`}
              description={(
                <div className="conflict-content">
                  <div><b>本页版本</b><p>{conflict.localText}</p></div>
                  <div><b>模拟远端版本</b><p>{conflict.remoteText}</p></div>
                  <Space><Button size="small" onClick={() => resolveConflict(conflict.id, 'local')}>保留本页</Button><Button size="small" type="primary" onClick={() => resolveConflict(conflict.id, 'remote')}>采用远端</Button><Button size="small" type="text" onClick={() => dismissConflict(conflict.id)}>稍后处理</Button></Space>
                </div>
              )}
            />
          ))}
        </div>
      )}

      <main className="workspace">
        <aside className="toc-panel">
          <div className="panel-title"><MenuFoldOutlined /> 侧边目录</div>
          <nav>
            {sections.map((section) => (
              <div key={section} className="toc-section">
                <strong>{section}</strong>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => (
                  <button key={paragraph.id} className={paragraph.id === selected?.id ? 'active' : ''} onClick={() => scrollToParagraph(paragraph.id)}>
                    <span>{paragraph.number}</span>
                    <span>{paragraph.text.slice(0, 24)}…</span>
                    {paragraph.status === 'locked' && <LockOutlined />}
                    {!!paragraphCommentCounts[paragraph.id] && <Badge count={paragraphCommentCounts[paragraph.id]} size="small" />}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="version-box">
            <div className="panel-title"><HistoryOutlined /> 版本</div>
            <Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="新版本名称" onPressEnter={handleCreateVersion} />
            <Button block icon={<PlusOutlined />} onClick={handleCreateVersion}>保存当前版本</Button>
            <Button block icon={<DiffOutlined />} onClick={() => setVersionOpen(true)}>比较两个版本</Button>
          </div>
        </aside>

        <section className="document-panel">
          <div className="document-toolbar">
            <div><h2>大语言模型辅助下的开源维护协作研究</h2><p>作者：林晓、陈默、王远 · 最近保存 {formatDate(Date.now())}</p></div>
            <Space>
              <Checkbox checked={revisionMode} onChange={(event) => setRevisionMode(event.target.checked)}>修订模式</Checkbox>
              <Tag color={dirty ? 'gold' : 'green'}>{dirty ? '有未保存修改' : '已保存'}</Tag>
            </Space>
          </div>

          <div className="paper-sheet">
            <div className="paper-kicker">RESEARCH ARTICLE · CONFIDENTIAL REVIEW</div>
            {sections.map((section) => (
              <section key={section} className="paper-section">
                <h3>{section}</h3>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => {
                  const isEditing = role === 'author' && !revisionMode && !!editingIds[paragraph.id] && paragraph.status !== 'locked'
                  const staleSnippets = staleSnippetsOf(paragraph)
                  return (
                    <article
                      id={`paragraph-${paragraph.id}`} key={paragraph.id} onMouseUp={() => setQuote(window.getSelection()?.toString().trim() ?? '')}
                      className={`paragraph-card ${paragraph.id === selected?.id ? 'selected' : ''} ${paragraph.highlighted ? 'highlighted' : ''} ${paragraph.status === 'locked' ? 'locked' : ''}`}
                      onClick={() => selectParagraph(paragraph.id)}
                    >
                      <div className="paragraph-meta">
                        <span className="paragraph-no">{paragraph.number}</span>
                        <span>段落 {paragraph.number.replace('.', '')}</span>
                        {paragraph.status === 'locked' && <Tag icon={<LockOutlined />} color="purple">已锁定</Tag>}
                        {paragraph.status === 'accepted' && <Tag icon={<CheckOutlined />} color="green">已确认</Tag>}
                        {!!paragraphCommentCounts[paragraph.id] && <Tag icon={<MessageOutlined />}>{paragraphCommentCounts[paragraph.id]} 条意见</Tag>}
                      </div>
                      {revisionMode ? (
                        <div className="revision-grid">
                          <div><small>原稿</small><p>{paragraph.original}</p></div>
                          <div><small>当前修订（<del className="legend-del">删除</del> / <ins className="legend-ins">新增</ins> / 待处理句）</small><p>{renderMarkedText(paragraph, 'revision')}</p></div>
                        </div>
                      ) : isEditing ? (
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} autoFocus value={paragraph.text} onChange={(event) => updateParagraph(paragraph.id, event.target.value)} />
                      ) : (
                        <p className="paragraph-text">{renderMarkedText(paragraph, 'normal')}</p>
                      )}
                      {staleSnippets.length > 0 && (
                        <div className="paragraph-stale">
                          {staleSnippets.map(({ commentId, snippet }) => (
                            <button key={snippet.id} onClick={(event) => { event.stopPropagation(); focusSnippet(paragraph.id, commentId, snippet.id) }}>
                              <WarningOutlined /> {staleText(snippet.stale)}：“{snippet.quote.slice(0, 20)}{snippet.quote.length > 20 ? '…' : ''}”
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="paragraph-actions">
                        {role === 'reviewer' && <><Button size="small" icon={<CommentOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('comment') }}>添加批注</Button><Button size="small" icon={<FileDoneOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('suggestion') }}>提出片段建议</Button></>}
                        {role === 'editor' && <Button size="small" icon={paragraph.status === 'locked' ? <UnlockOutlined /> : <LockOutlined />} onClick={(event) => { event.stopPropagation(); toggleLock(paragraph.id) }}>{paragraph.status === 'locked' ? '解除锁定' : '锁定段落'}</Button>}
                        {role === 'author' && !revisionMode && paragraph.status !== 'locked' && (
                          <Button size="small" type={isEditing ? 'primary' : 'text'} icon={<EditOutlined />} onClick={(event) => { event.stopPropagation(); setEditingIds((ids) => ({ ...ids, [paragraph.id]: !ids[paragraph.id] })) }}>{isEditing ? '完成编辑' : '编辑正文'}</Button>
                        )}
                        {role === 'author' && paragraph.status === 'locked' && <span className="author-tip"><LockOutlined /> 段落已锁定，未决片段只能查看</span>}
                        {role === 'author' && paragraph.status !== 'locked' && <span className="author-tip">点击高亮原句可在右侧逐句接受或拒绝；编辑正文后片段按引用重新定位</span>}
                      </div>
                    </article>
                  )
                })}
              </section>
            ))}
          </div>
        </section>

        <aside className="comments-panel">
          <div className="comments-header">
            <div><h2><CommentOutlined /> 审阅意见 <Badge count={comments.filter((comment) => comment.status === 'open').length} /></h2><p>引用原文、讨论与逐句替换片段</p></div>
          </div>
          <div className="comment-filters">
            <Radio.Group value={commentFilter} onChange={(event) => setCommentFilter(event.target.value)} buttonStyle="solid" size="small">
              <Radio.Button value="all">全部</Radio.Button><Radio.Button value="open">待处理</Radio.Button><Radio.Button value="suggestion">建议</Radio.Button><Radio.Button value="duplicate">重复</Radio.Button>
            </Radio.Group>
          </div>
          <div className="comment-list">
            {visibleComments.map((comment) => {
              const paragraph = paragraphs.find((item) => item.id === comment.paragraphId)
              const locked = paragraph?.status === 'locked'
              return (
                <Card key={comment.id} id={`comment-${comment.id}`} size="small" className={`comment-card ${comment.status}`} title={<span>{comment.author} <Tag>{comment.type === 'suggestion' ? '片段建议' : '段落批注'}</Tag></span>} extra={<small>{formatDate(comment.createdAt)}</small>}>
                  <button className="quote-line" onClick={() => paragraph && scrollToParagraph(paragraph.id)}>“{comment.quote}” · 段落 {paragraph?.number}</button>
                  <p className="comment-body">{comment.body}</p>
                  {comment.snippets.length > 0 && (
                    <div className="snippet-list">
                      {comment.snippets.map((snippet, index) => (
                        <div
                          key={snippet.id} id={`snippet-${snippet.id}`}
                          className={`snippet-row ${snippet.status}${snippet.stale ? ' stale' : ''}${snippet.id === flashSnippetId ? ' flash' : ''}`}
                        >
                          <div className="snippet-index">片段 {index + 1}</div>
                          <div className="snippet-flow">
                            <div className="snippet-cell old"><small>原句</small><q>{snippet.quote}</q></div>
                            <ArrowRightOutlined className="snippet-arrow" />
                            <div className="snippet-cell new"><small>新句</small><q>{snippet.replacement}</q></div>
                          </div>
                          {snippet.status === 'pending' && snippet.stale && (
                            <Alert
                              className="snippet-alert" type="warning" showIcon icon={<WarningOutlined />} banner
                              message={<>{staleText(snippet.stale)}，已停止接受；正文恢复原句后可重新处理</>}
                            />
                          )}
                          {snippet.status === 'pending' && !snippet.stale && locked && (
                            <Tag icon={<LockOutlined />} color="purple">段落已锁定，未决片段只能查看</Tag>
                          )}
                          {snippet.status === 'pending' && !snippet.stale && !locked && role === 'author' && (
                            <div className="decision-row">
                              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleResolveSnippet(comment.id, snippet.id, true)}>接受此句</Button>
                              <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleResolveSnippet(comment.id, snippet.id, false)}>拒绝</Button>
                            </div>
                          )}
                          {snippet.status === 'pending' && !snippet.stale && !locked && role !== 'author' && <Tag>待作者在修订模式中处理</Tag>}
                          {snippet.status === 'accepted' && <Tag color="green" icon={<CheckOutlined />}>已接受 · 新句已写入正文</Tag>}
                          {snippet.status === 'rejected' && <Tag color="red" icon={<CloseOutlined />}>已拒绝 · 正文保持原样</Tag>}
                        </div>
                      ))}
                    </div>
                  )}
                  {comment.status !== 'open' && !comment.snippets.length && <Tag color={comment.status === 'accepted' ? 'green' : comment.status === 'rejected' ? 'red' : 'blue'}>{comment.status === 'accepted' ? '已接受' : comment.status === 'rejected' ? '已拒绝' : '已合并'}</Tag>}
                  <div className="replies">
                    {comment.replies.map((reply) => <div key={reply.id} className="reply"><b>{reply.author}</b><span>{reply.body}</span></div>)}
                  </div>
                  <div className="reply-box">
                    <Input size="small" value={replyDrafts[comment.id] ?? ''} onChange={(event) => setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: event.target.value }))} placeholder="回复讨论…" onPressEnter={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                    <Button size="small" type="text" icon={<SendOutlined />} onClick={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                  </div>
                  {comment.status === 'open' && role === 'editor' && duplicateParagraphIds.has(comment.paragraphId) && (() => {
                    const sibling = comments.find((item) => item.id !== comment.id && item.paragraphId === comment.paragraphId && item.status === 'open')
                    return sibling ? <Button size="small" type="dashed" icon={<BranchesOutlined />} onClick={() => mergeComment(comment.id, sibling.id)}>合并到“{sibling.author}”意见</Button> : null
                  })()}
                </Card>
              )
            })}
            {!visibleComments.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下没有意见" />}
          </div>
          <div className="keyboard-hint"><span><kbd>J</kbd>/<kbd>K</kbd> 段落导航</span><span><kbd>T</kbd> 修订模式</span>{role === 'editor' && <span><kbd>L</kbd> 锁定</span>}<span><kbd>⌘Z</kbd> 撤销</span></div>
        </aside>
      </main>

      <Modal title={commentType === 'suggestion' ? '提出逐句替换建议' : '添加段落批注'} open={composerOpen} onCancel={() => setComposerOpen(false)} onOk={submitComment} okText="提交" width={680}>
        <div className="composer">
          {commentType === 'suggestion' ? (
            <>
              <p className="composer-tip">每条建议只替换选中的原句，段落其他文字保持原样；作者可逐条接受或拒绝。</p>
              {snippetDrafts.map((draft, index) => {
                const occurrences = selected ? countOccurrences(selected.text, draft.quote.trim()) : 0
                return (
                  <div key={index} className="composer-snippet">
                    <div className="composer-snippet-head">
                      <b>片段 {index + 1}</b>
                      {snippetDrafts.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setSnippetDrafts((drafts) => drafts.filter((_, itemIndex) => itemIndex !== index))}>删除片段</Button>}
                    </div>
                    <label>原句（审稿人选中的原文）</label>
                    <Input.TextArea value={draft.quote} onChange={(event) => setSnippetDrafts((drafts) => drafts.map((item, itemIndex) => itemIndex === index ? { ...item, quote: event.target.value } : item))} autoSize={{ minRows: 1, maxRows: 4 }} />
                    {draft.quote.trim() && (
                      <small className={occurrences === 1 ? 'occur-ok' : 'occur-bad'}>
                        {occurrences === 1 ? '原句在本段唯一出现，可精确定位' : occurrences === 0 ? '当前正文找不到该原句，提交后将标为过期，作者无法接受' : `原句在本段出现 ${occurrences} 次，无法唯一定位，作者无法接受`}
                      </small>
                    )}
                    <label>新句（接受后替换原句）</label>
                    <Input.TextArea value={draft.replacement} onChange={(event) => setSnippetDrafts((drafts) => drafts.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: event.target.value } : item))} autoSize={{ minRows: 1, maxRows: 4 }} />
                  </div>
                )
              })}
              <Button block type="dashed" icon={<PlusOutlined />} onClick={() => setSnippetDrafts((drafts) => [...drafts, { quote: '', replacement: '' }])}>再加一条片段</Button>
            </>
          ) : (
            <>
              <label>引用原文</label>
              <Input.TextArea value={quote} onChange={(event) => setQuote(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} />
            </>
          )}
          <label>说明</label>
          <Input.TextArea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="说明修改理由或希望作者关注的问题" autoSize={{ minRows: 2, maxRows: 5 }} />
        </div>
      </Modal>

      <Modal title="版本比较" open={versionOpen} onCancel={() => setVersionOpen(false)} footer={null} width={980}>
        <div className="compare-selectors">
          <Select value={versionA} onChange={setVersionA} options={versions.map((version) => ({ label: `${version.label} · ${formatDate(version.createdAt)}`, value: version.id }))} />
          <ArrowRightOutlined />
          <Select value={versionB} onChange={setVersionB} options={versions.map((version) => ({ label: `${version.label} · ${formatDate(version.createdAt)}`, value: version.id }))} />
        </div>
        <div className="version-table">
          <div className="version-head"><b>{comparedA?.label ?? '版本 A'}</b><b>{comparedB?.label ?? '版本 B'}</b></div>
          {comparedRows.map(({ a, b }) => (
            <div key={a.id} className={`version-row ${a.text !== b?.text ? 'changed' : ''}`}>
              <div><span>{a.number}</span>{a.text}</div><div><span>{b?.number ?? '—'}</span>{b?.text ?? '段落已删除'}</div>
            </div>
          ))}
        </div>
      </Modal>

      <footer className="app-footer">
        <span>本地草稿自动持久化 · 片段位置、处理状态与修订模式重开页面后仍保留 · 模拟接口演示冲突处理</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => { resetDemo(); message.success('已重置示例数据') }}>重置示例</Button>
      </footer>
    </div>
  )
}
