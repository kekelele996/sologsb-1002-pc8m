import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftOutlined, ArrowRightOutlined, BranchesOutlined, CheckOutlined, CloseOutlined,
  CommentOutlined, DiffOutlined, DeleteOutlined, FileDoneOutlined, FileTextOutlined,
  HistoryOutlined, LockOutlined, MenuFoldOutlined, MessageOutlined, MinusCircleOutlined, PlusOutlined,
  RedoOutlined, SaveOutlined, SendOutlined, SwapOutlined, UndoOutlined, UnlockOutlined,
} from '@ant-design/icons'
import { Alert, Badge, Button, Card, Checkbox, Empty, Input, Modal, Radio, Segmented, Select, Space, Tag, Tooltip, message } from 'antd'
import { submitRemotePatch } from './services/mockApi'
import { locateCommentFragment, useReviewStore } from './store/review'
import { countOccurrences } from './types'
import type { Comment, CommentType, Paragraph, Role, SuggestionFragment } from './types'

const roleMeta: Record<Role, { label: string; description: string; color: string }> = {
  author: { label: '作者工作区', description: '在修订模式中逐条接受或拒绝可定位的替换片段', color: '#2f6f5e' },
  reviewer: { label: '审稿人工作区', description: '选中原文原句填写新句，提出可定位的替换片段', color: '#9a5b25' },
  editor: { label: '编辑工作区', description: '合并重复意见、锁定已确认段落并比较版本', color: '#5b4d8e' },
}
const roleIcon = (role: Role) => role === 'author' ? <FileDoneOutlined /> : role === 'reviewer' ? <CommentOutlined /> : <BranchesOutlined />
const formatDate = (value: number) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const isActionable = (status: string) => status === 'open' || status === 'stale'

interface TextMark {
  fragmentId: string
  commentId: string
  author: string
  start: number
  end: number
}

/** 把可唯一定位的待处理片段渲染为正文内联标记，其余文字保持原样 */
function MarkedText({ text, marks, onLocate }: { text: string; marks: TextMark[]; onLocate?: (commentId: string, fragmentId: string) => void }) {
  const sorted = marks.filter((mark) => mark.start >= 0 && mark.end <= text.length && mark.end > mark.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const pieces: React.ReactNode[] = []
  let cursor = 0
  let key = 0
  for (const mark of sorted) {
    if (mark.start < cursor) continue // 片段重叠时跳过后者，避免破坏原文
    pieces.push(text.slice(cursor, mark.start))
    pieces.push(
      <mark
        key={key++} className="frag-mark" data-fragment={mark.fragmentId} title={`${mark.author} 的替换建议（点击查看）`}
        onClick={onLocate ? (event) => { event.stopPropagation(); onLocate(mark.commentId, mark.fragmentId) } : undefined}
      >
        {text.slice(mark.start, mark.end)}
      </mark>,
    )
    cursor = mark.end
  }
  pieces.push(text.slice(cursor))
  return <>{pieces}</>
}

export default function App() {
  const {
    role, paragraphs, comments, versions, selectedParagraphId, commentFilter, revisionMode, dirty, conflicts,
    setRole, selectParagraph, setCommentFilter, setRevisionMode, updateParagraph, addComment, replyComment,
    resolveFragment, resolveSuggestion, mergeComment, toggleLock, createVersion, addConflict, resolveConflict, dismissConflict,
    undo, redo, save, resetDemo,
  } = useReviewStore()
  const [composerOpen, setComposerOpen] = useState(false)
  const [commentType, setCommentType] = useState<CommentType>('comment')
  const [commentBody, setCommentBody] = useState('')
  const [quote, setQuote] = useState('')
  const [fragDrafts, setFragDrafts] = useState<{ quote: string; replacement: string }[]>([{ quote: '', replacement: '' }])
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
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
    if (commentFilter === 'open') return isActionable(comment.status)
    if (commentFilter === 'suggestion') return comment.type === 'suggestion' && isActionable(comment.status)
    if (commentFilter === 'duplicate') return duplicateParagraphIds.has(comment.paragraphId) && isActionable(comment.status)
    return true
  }).sort((a, b) => b.createdAt - a.createdAt), [commentFilter, comments, duplicateParagraphIds])
  const pendingCount = comments.filter((comment) => isActionable(comment.status)).length

  // 每个段落当前可唯一定位的待处理片段（每次正文变动后按引用重新计算）
  const marksByParagraph = useMemo(() => {
    const map = new Map<string, TextMark[]>()
    for (const paragraph of paragraphs) {
      const marks: TextMark[] = []
      for (const comment of comments) {
        if (comment.paragraphId !== paragraph.id || comment.type !== 'suggestion' || !comment.fragments) continue
        for (const fragment of comment.fragments) {
          if (fragment.status !== 'pending') continue
          const { location, anchor } = locateCommentFragment(paragraph, fragment)
          if (location === 'unique') {
            marks.push({ fragmentId: fragment.id, commentId: comment.id, author: comment.author, start: anchor, end: anchor + fragment.quote.length })
          }
        }
      }
      if (marks.length) map.set(paragraph.id, marks)
    }
    return map
  }, [paragraphs, comments])

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
  const scrollToFragment = (commentId: string, fragmentId: string) => {
    const card = document.getElementById(`comment-${commentId}`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    document.querySelectorAll('.fragment-row.flash').forEach((node) => node.classList.remove('flash'))
    const row = document.getElementById(`fragment-${fragmentId}`)
    row?.classList.add('flash')
    window.setTimeout(() => row?.classList.remove('flash'), 1600)
  }
  const openComposer = (type: CommentType) => {
    const selectedText = window.getSelection()?.toString().trim()
    const initialQuote = selectedText && selected?.text.includes(selectedText) ? selectedText : selected?.text.slice(0, 64) ?? ''
    setQuote(initialQuote)
    setCommentType(type)
    setFragDrafts(type === 'suggestion' ? [{ quote: selectedText && selected?.text.includes(selectedText) ? selectedText : '', replacement: '' }] : [{ quote: '', replacement: '' }])
    setComposerOpen(true)
  }
  const submitComment = () => {
    if (!selected || !commentBody.trim()) { message.warning('请填写说明内容'); return }
    if (commentType === 'comment') {
      if (!quote.trim()) { message.warning('请填写引用原文'); return }
      addComment({ paragraphId: selected.id, type: 'comment', quote: quote.trim(), body: commentBody.trim() })
      message.success('段落批注已添加')
    } else {
      const rows = fragDrafts
        .map((row) => ({ quote: row.quote.trim(), replacement: row.replacement.trim() }))
        .filter((row) => row.quote || row.replacement)
      if (!rows.length) { message.warning('请至少填写一条“原句 → 新句”替换片段'); return }
      if (rows.some((row) => !row.quote || !row.replacement)) { message.warning('每条片段都需要填写原句和新句'); return }
      const missing = rows.find((row) => !selected.text.includes(row.quote))
      if (missing) { message.warning(`原句未在当前段落中找到：${missing.quote.slice(0, 20)}…`); return }
      const duplicated = rows.find((row) => countOccurrences(selected.text, row.quote) > 1)
      addComment({ paragraphId: selected.id, type: 'suggestion', quote: rows[0].quote, body: commentBody.trim(), fragments: rows })
      message.success(duplicated ? '修改建议已提交（注意：有条原句在段中出现多次）' : '修改建议已提交')
    }
    setCommentBody(''); setQuote(''); setFragDrafts([{ quote: '', replacement: '' }]); setComposerOpen(false)
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
    createVersion(versionLabel.trim() || '')
    setVersionLabel('')
    message.success('当前版本已保存')
  }
  const onFragmentDecision = (commentId: string, fragmentId: string, accepted: boolean) => {
    const decision = resolveFragment(commentId, fragmentId, accepted)
    if (decision.ok) {
      message.success(accepted ? '已接受该替换片段，其他文字保持原样' : '已拒绝该替换片段')
      return
    }
    if (decision.reason === 'locked') message.warning('段落已锁定，未决建议只能查看')
    else if (decision.reason === 'missing') message.warning('原句在正文中已找不到，该片段已标记为过期')
    else if (decision.reason === 'duplicate') message.warning('原句在正文中出现多次，无法唯一定位，该片段已标记为过期')
    else message.error('操作未生效')
  }
  const onResolveAll = (commentId: string, accepted: boolean) => {
    const decision = resolveSuggestion(commentId, accepted)
    if (decision.ok) message.success(accepted ? '可定位片段已全部接受' : '待处理片段已全部拒绝')
    else if (decision.reason === 'locked') message.warning('段落已锁定，未决建议只能查看')
    else if (decision.reason === 'missing') message.warning('有片段的原句已找不到，已停止接受并标为过期')
    else if (decision.reason === 'duplicate') message.warning('有片段的原句出现多次，已停止接受并标为过期')
  }
  const comparedA = versions.find((version) => version.id === versionA)
  const comparedB = versions.find((version) => version.id === versionB)
  const comparedRows = comparedA && comparedB ? comparedA.paragraphs.map((paragraph, index) => ({ a: paragraph, b: comparedB.paragraphs[index] })) : []

  const renderParagraphBody = (paragraph: Paragraph) => {
    const marks = marksByParagraph.get(paragraph.id) ?? []
    if (revisionMode) {
      return (
        <div className="revision-grid">
          <div><small>原稿</small><p className="paragraph-text">{paragraph.original}</p></div>
          <div className={`revision-current ${marks.length ? 'has-marks' : ''}`}>
            <small>当前修订{marks.length ? ` · ${marks.length} 处待处理片段` : ''}</small>
            <p className="paragraph-text"><MarkedText text={paragraph.text} marks={marks} onLocate={scrollToFragment} /></p>
          </div>
        </div>
      )
    }
    if (role === 'author') {
      return <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} value={paragraph.text} readOnly={paragraph.status === 'locked'} onChange={(event) => updateParagraph(paragraph.id, event.target.value)} />
    }
    return <p className="paragraph-text">{marks.length ? <MarkedText text={paragraph.text} marks={marks} onLocate={scrollToFragment} /> : paragraph.text}</p>
  }

  const renderFragmentRow = (comment: Comment, paragraph: Paragraph | undefined, fragment: SuggestionFragment) => {
    const { location } = locateCommentFragment(paragraph, fragment)
    const locked = paragraph?.status === 'locked'
    const canDecide = role === 'author' && revisionMode && fragment.status === 'pending' && !locked
    return (
      <div key={fragment.id} id={`fragment-${fragment.id}`} className={`fragment-row status-${fragment.status}`}>
        <div className="fragment-sentences">
          <div className="frag-side frag-old"><small>原句</small><p>{fragment.quote}</p></div>
          <ArrowRightOutlined className="frag-arrow" />
          <div className="frag-side frag-new"><small>新句</small><p>{fragment.replacement}</p></div>
        </div>
        <div className="fragment-meta">
          {fragment.status === 'accepted' && <Tag color="green" icon={<CheckOutlined />}>已接受</Tag>}
          {fragment.status === 'rejected' && <Tag color="red" icon={<CloseOutlined />}>已拒绝</Tag>}
          {fragment.status === 'stale' && location === 'missing' && <Tag color="orange">已过期 · 原句找不到</Tag>}
          {fragment.status === 'stale' && location === 'duplicate' && <Tag color="orange">已过期 · 原句出现多次</Tag>}
          {fragment.status === 'pending' && location === 'unique' && <Tag color="blue">可定位 · 第 {fragment.anchor + 1} 字起</Tag>}
          {fragment.status === 'pending' && location === 'missing' && <Tag color="orange">原句在正文中已找不到</Tag>}
          {fragment.status === 'pending' && location === 'duplicate' && <Tag color="orange">原句出现 {countOccurrences(paragraph?.text ?? '', fragment.quote)} 次，无法定位</Tag>}
          {canDecide && (
            <Space size={4}>
              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => onFragmentDecision(comment.id, fragment.id, true)}>接受</Button>
              <Button danger size="small" icon={<CloseOutlined />} onClick={() => onFragmentDecision(comment.id, fragment.id, false)}>拒绝</Button>
            </Space>
          )}
        </div>
      </div>
    )
  }

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
          {revisionMode && role === 'author' && (
            <Alert className="revision-alert" type="info" showIcon message="修订模式已开启：右侧建议按片段逐条接受或拒绝，正文只替换被接受的原句" />
          )}

          <div className="paper-sheet">
            <div className="paper-kicker">RESEARCH ARTICLE · CONFIDENTIAL REVIEW</div>
            {sections.map((section) => (
              <section key={section} className="paper-section">
                <h3>{section}</h3>
                {paragraphs.filter((paragraph) => paragraph.section === section).map((paragraph) => (
                  <article
                    id={`paragraph-${paragraph.id}`} key={paragraph.id}
                    onMouseUp={() => {
                      const selectedText = window.getSelection()?.toString().trim()
                      if (selectedText) setQuote(selectedText)
                    }}
                    className={`paragraph-card ${paragraph.id === selected?.id ? 'selected' : ''} ${paragraph.highlighted ? 'highlighted' : ''} ${paragraph.status === 'locked' ? 'locked' : ''}`}
                    onClick={() => selectParagraph(paragraph.id)}
                  >
                    <div className="paragraph-meta">
                      <span className="paragraph-no">{paragraph.number}</span>
                      <span>段落 {paragraph.number.replace('.', '')}</span>
                      {paragraph.status === 'locked' && <Tag icon={<LockOutlined />} color="purple">已锁定</Tag>}
                      {paragraph.status === 'accepted' && <Tag icon={<CheckOutlined />} color="green">已确认</Tag>}
                      {!!paragraphCommentCounts[paragraph.id] && <Tag icon={<MessageOutlined />}>{paragraphCommentCounts[paragraph.id]} 条意见</Tag>}
                      {!!(marksByParagraph.get(paragraph.id)?.length) && <Tag color="blue">{marksByParagraph.get(paragraph.id)?.length} 处待处理替换</Tag>}
                    </div>
                    {renderParagraphBody(paragraph)}
                    <div className="paragraph-actions">
                      {role === 'reviewer' && <><Button size="small" icon={<CommentOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('comment') }}>添加批注</Button><Button size="small" icon={<FileDoneOutlined />} onClick={(event) => { event.stopPropagation(); selectParagraph(paragraph.id); openComposer('suggestion') }}>提出建议</Button></>}
                      {role === 'editor' && <Button size="small" icon={paragraph.status === 'locked' ? <UnlockOutlined /> : <LockOutlined />} onClick={(event) => { event.stopPropagation(); toggleLock(paragraph.id) }}>{paragraph.status === 'locked' ? '解除锁定' : '锁定段落'}</Button>}
                      {role === 'author' && <span className="author-tip">{revisionMode ? '在右侧意见栏逐条接受或拒绝替换片段' : '可直接修改正文；按 T 进入修订模式处理片段建议'}</span>}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </section>

        <aside className="comments-panel">
          <div className="comments-header">
            <div><h2><CommentOutlined /> 审阅意见 <Badge count={pendingCount} /></h2><p>引用原文、讨论与按句拆分的替换片段</p></div>
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
              const pendingFragments = comment.fragments?.filter((fragment) => fragment.status === 'pending') ?? []
              return (
                <Card key={comment.id} id={`comment-${comment.id}`} size="small" className={`comment-card ${comment.status}`} title={<span>{comment.author} <Tag>{comment.type === 'suggestion' ? `修改建议 · ${comment.fragments?.length ?? 0} 个片段` : '段落批注'}</Tag></span>} extra={<small>{formatDate(comment.createdAt)}</small>}>
                  <button className="quote-line" onClick={() => paragraph && scrollToParagraph(paragraph.id)}>“{comment.quote}” · 段落 {paragraph?.number}</button>
                  <p className="comment-body">{comment.body}</p>
                  {comment.fragments?.length ? (
                    <div className="fragment-list">
                      {comment.fragments.map((fragment) => renderFragmentRow(comment, paragraph, fragment))}
                    </div>
                  ) : null}
                  {comment.status === 'stale' && <Alert className="stale-alert" type="warning" showIcon message="建议已过期：正文改动后部分原句找不到或出现多次，已停止接受" />}
                  {locked && pendingFragments.length > 0 && <Alert className="stale-alert" type="warning" showIcon icon={<LockOutlined />} message="段落已锁定，未决建议只能查看" />}
                  {comment.status === 'accepted' && <Tag color="green" icon={<CheckOutlined />}>已全部接受</Tag>}
                  {comment.status === 'rejected' && <Tag color="red" icon={<CloseOutlined />}>已拒绝</Tag>}
                  {comment.status === 'merged' && <Tag color="blue">已合并</Tag>}
                  {role === 'author' && revisionMode && comment.type === 'suggestion' && pendingFragments.length > 0 && !locked && (
                    <div className="decision-row">
                      <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => onResolveAll(comment.id, true)}>全部接受</Button>
                      <Button size="small" icon={<CloseOutlined />} onClick={() => onResolveAll(comment.id, false)}>全部拒绝</Button>
                    </div>
                  )}
                  {role === 'author' && !revisionMode && comment.type === 'suggestion' && pendingFragments.length > 0 && !locked && (
                    <p className="decision-hint">按 <kbd>T</kbd> 开启修订模式后可逐条接受或拒绝</p>
                  )}
                  <div className="replies">
                    {comment.replies.map((reply) => <div key={reply.id} className="reply"><b>{reply.author}</b><span>{reply.body}</span></div>)}
                  </div>
                  <div className="reply-box">
                    <Input size="small" value={replyDrafts[comment.id] ?? ''} onChange={(event) => setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: event.target.value }))} placeholder="回复讨论…" onPressEnter={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                    <Button size="small" type="text" icon={<SendOutlined />} onClick={() => { const body = replyDrafts[comment.id]?.trim(); if (body) { replyComment(comment.id, body); setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' })) } }} />
                  </div>
                  {comment.status === 'open' && role === 'editor' && duplicateParagraphIds.has(comment.paragraphId) && (() => {
                    const sibling = comments.find((item) => item.id !== comment.id && item.paragraphId === comment.paragraphId && isActionable(item.status))
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

      <Modal
        title={commentType === 'suggestion' ? '提出修改建议（按原句拆分替换片段）' : '添加段落批注'}
        open={composerOpen} onCancel={() => setComposerOpen(false)} onOk={submitComment} okText="提交" width={680}
      >
        <div className="composer">
          {commentType === 'suggestion' ? (
            <>
              <label>替换片段（选中的原句 → 建议新句，可添加多条；作者会逐条处理）</label>
              <div className="frag-editor">
                {fragDrafts.map((row, index) => (
                  <div key={index} className="frag-editor-row">
                    <div className="frag-editor-side">
                      <small>原句（须与正文完全一致）</small>
                      <Input.TextArea value={row.quote} autoSize={{ minRows: 1, maxRows: 4 }} onChange={(event) => setFragDrafts((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, quote: event.target.value } : item))} />
                    </div>
                    <ArrowRightOutlined className="frag-arrow" />
                    <div className="frag-editor-side">
                      <small>新句</small>
                      <Input.TextArea value={row.replacement} autoSize={{ minRows: 1, maxRows: 4 }} onChange={(event) => setFragDrafts((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: event.target.value } : item))} />
                    </div>
                    {fragDrafts.length > 1 && (
                      <Tooltip title="删除该片段">
                        <Button type="text" danger size="small" icon={<MinusCircleOutlined />} onClick={() => setFragDrafts((rows) => rows.filter((_, itemIndex) => itemIndex !== index))} />
                      </Tooltip>
                    )}
                  </div>
                ))}
                <Button size="small" type="dashed" block icon={<PlusOutlined />} onClick={() => setFragDrafts((rows) => [...rows, { quote: '', replacement: '' }])}>再加一条片段</Button>
              </div>
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
        <span>片段位置、处理状态与修订模式均保存在浏览器本地 · 模拟接口用于演示多人修改后的冲突处理</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => { resetDemo(); message.success('已重置示例数据') }}>重置示例</Button>
      </footer>
    </div>
  )
}
