import { create } from 'zustand'
import type { Comment, CommentType, EditConflict, Paragraph, Reply, Role, SuggestionSnippet, Version } from '../types'
import { applySnippetReplacement, countOccurrences, recomputeSnippetStaleness, rollupCommentStatus } from '../snippets'

const DRAFT_KEY = 'sologsb-1002-draft-v1'
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const baseParagraphs: Paragraph[] = [
  { id: 'p-01', section: '摘要', number: '1.', text: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', original: '开源软件供应链的稳定性不仅取决于代码质量，也取决于维护者能否持续识别并回应社区需求。', status: 'accepted', highlighted: false },
  { id: 'p-02', section: '1 引言', number: '2.', text: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', original: '近年来，大型语言模型被广泛用于代码生成与缺陷定位，但其在真实维护工作流中的影响仍缺少系统证据。', status: 'open', highlighted: true },
  { id: 'p-03', section: '1 引言', number: '3.', text: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', original: '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 26 位核心维护者。', status: 'open', highlighted: true },
  { id: 'p-04', section: '2 方法', number: '4.', text: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', original: '我们采用混合研究方法，将议题生命周期划分为响应、评审与合并三个阶段。编码过程由两名研究者独立完成。', status: 'open', highlighted: false },
  { id: 'p-05', section: '2 方法', number: '5.', text: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', original: '当编码结果不一致时，研究者通过讨论达成一致；若仍有分歧，则邀请第三位研究者裁决。', status: 'accepted', highlighted: true },
  { id: 'p-06', section: '3 结果', number: '6.', text: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', original: '初步结果显示，辅助工具缩短了首次响应时间，但没有显著降低维护者处理复杂议题的认知负担。', status: 'open', highlighted: true },
  { id: 'p-07', section: '3 结果', number: '7.', text: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', original: '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。', status: 'open', highlighted: false },
]
const pending = (snippetId: string, quote: string, replacement: string): SuggestionSnippet =>
  ({ id: snippetId, quote, replacement, status: 'pending', stale: false })
const baseComments: Comment[] = [
  {
    id: 'c-01', paragraphId: 'p-02', author: '审稿人 A', role: 'reviewer', type: 'suggestion',
    quote: '但其在真实维护工作流中的影响仍缺少系统证据。',
    body: '建议把“影响”具体化为可观察的协作行为指标。', status: 'open',
    snippets: [
      pending('s-01', '但其在真实维护工作流中的影响仍缺少系统证据。', '但在真实维护工作流中究竟改变了哪些协作行为，仍缺少系统证据。'),
      pending('s-02', '代码生成与缺陷定位', '代码生成、缺陷定位与评审分派'),
    ],
    replies: [{ id: 'r-01', author: '作者', role: 'author', body: '可以，逐句采纳，采纳后会补充指标定义。', createdAt: Date.now() - 7200000 }],
    createdAt: Date.now() - 86400000,
  },
  { id: 'c-02', paragraphId: 'p-02', author: '审稿人 B', role: 'reviewer', type: 'comment', quote: '缺少系统证据', body: '这里的“系统证据”范围过大，建议限定为本研究覆盖的议题语料。', status: 'open', snippets: [], replies: [], createdAt: Date.now() - 64000000 },
  {
    id: 'c-03', paragraphId: 'p-03', author: '审稿人 A', role: 'reviewer', type: 'suggestion',
    quote: '并访谈 20 余位核心维护者。',
    body: '这条基于上一版稿本提出，正文数字更新后原句已找不到，请核对后再决定是否采纳。', status: 'open',
    snippets: [pending('s-03', '并访谈 20 余位核心维护者。', '并深度访谈 26 位核心维护者。')],
    replies: [], createdAt: Date.now() - 58000000,
  },
  { id: 'c-04', paragraphId: 'p-04', author: '审稿人 C', role: 'reviewer', type: 'comment', quote: '两名研究者独立完成', body: '建议报告编码者间一致性系数，并明确不一致处理规则。', status: 'open', snippets: [], replies: [], createdAt: Date.now() - 48000000 },
  { id: 'c-05', paragraphId: 'p-05', author: '审稿人 D', role: 'reviewer', type: 'comment', quote: '邀请第三位研究者裁决', body: '与上一段重复：都在说明编码分歧如何解决，建议合并意见。', status: 'open', snippets: [], replies: [], createdAt: Date.now() - 43000000 },
  {
    id: 'c-06', paragraphId: 'p-06', author: '审稿人 B', role: 'reviewer', type: 'suggestion',
    quote: '但没有显著降低维护者处理复杂议题的认知负担。',
    body: '“显著”需要给出统计检验与效应量。', status: 'open',
    snippets: [pending('s-04', '但没有显著降低维护者处理复杂议题的认知负担。', '但对复杂议题处理时长与自我报告认知负担均未产生统计显著影响。')],
    replies: [], createdAt: Date.now() - 36000000,
  },
  {
    id: 'c-07', paragraphId: 'p-07', author: '审稿人 C', role: 'reviewer', type: 'suggestion',
    quote: '建议',
    body: '短句“建议”在本段出现两次，无法唯一定位；第二条片段为可正常定位的完整句。', status: 'open',
    snippets: [
      pending('s-05', '建议', '提议'),
      pending('s-06', '维护者更关注建议是否可验证，而非建议生成速度。', '维护者更看重建议能否被独立验证，而非建议的生成速度。'),
    ],
    replies: [], createdAt: Date.now() - 30000000,
  },
]

const isRole = (value: unknown): value is Role => value === 'author' || value === 'reviewer' || value === 'editor'
const isFilter = (value: unknown): value is ReviewState['commentFilter'] => value === 'all' || value === 'open' || value === 'suggestion' || value === 'duplicate'

/** 兼容旧版草稿：把整段 suggestion 迁移为单片段，并补齐 snippets 字段 */
export const migrateComment = (comment: Comment): Comment => {
  if (Array.isArray(comment.snippets)) {
    return { ...comment, snippets: comment.snippets.map((snippet) => ({ ...snippet, stale: false })) }
  }
  if (comment.type === 'suggestion' && typeof comment.suggestion === 'string') {
    const status: SuggestionSnippet['status'] = comment.status === 'accepted' ? 'accepted' : comment.status === 'rejected' ? 'rejected' : 'pending'
    return {
      ...comment,
      snippets: [{ id: `${comment.id}-migrated`, quote: comment.quote ?? '', replacement: comment.suggestion, status, stale: false }],
    }
  }
  return { ...comment, snippets: [] }
}

const seed = typeof localStorage !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
const parsed = seed ? JSON.parse(seed) as Partial<{
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
  role: Role
  selectedParagraphId: string
  commentFilter: ReviewState['commentFilter']
  revisionMode: boolean
}> : null
const initialParagraphs = parsed?.paragraphs?.length ? parsed.paragraphs : baseParagraphs
const initialComments = recomputeSnippetStaleness((parsed?.comments ?? baseComments).map(migrateComment), initialParagraphs)
const initialVersions: Version[] = parsed?.versions ?? [
  { id: 'v-01', label: '投稿初稿 v1', createdAt: Date.now() - 1209600000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs)) as Paragraph[] },
  { id: 'v-02', label: '审阅基线 v2', createdAt: Date.now() - 172800000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs.map((p) => p.id === 'p-04' ? { ...p, text: `${p.text} 编码规则在预注册方案中说明。` } : p))) as Paragraph[] },
]
const initialRole: Role = isRole(parsed?.role) ? parsed.role : 'reviewer'
const initialCommentFilter = isFilter(parsed?.commentFilter) ? parsed.commentFilter : 'all'
const initialRevisionMode = typeof parsed?.revisionMode === 'boolean' ? parsed.revisionMode : false
const initialSelectedParagraphId = initialParagraphs.some((paragraph) => paragraph.id === parsed?.selectedParagraphId)
  ? (parsed!.selectedParagraphId as string) : 'p-02'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

interface ReviewState {
  role: Role
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
  selectedParagraphId: string
  commentFilter: 'all' | 'open' | 'suggestion' | 'duplicate'
  revisionMode: boolean
  dirty: boolean
  conflicts: EditConflict[]
  past: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[] }[]
  future: { paragraphs: Paragraph[]; comments: Comment[]; versions: Version[] }[]
  setRole: (role: Role) => void
  selectParagraph: (id: string) => void
  setCommentFilter: (filter: ReviewState['commentFilter']) => void
  setRevisionMode: (value: boolean) => void
  updateParagraph: (id: string, text: string) => void
  addComment: (input: { paragraphId: string; type: CommentType; quote: string; body: string; snippets?: Array<Pick<SuggestionSnippet, 'quote' | 'replacement'>> }) => void
  replyComment: (commentId: string, body: string) => void
  resolveSnippet: (commentId: string, snippetId: string, accepted: boolean) => { ok: boolean; reason?: 'missing' | 'multiple' }
  mergeComment: (commentId: string, targetId: string) => void
  toggleLock: (paragraphId: string) => void
  createVersion: (label: string) => void
  addConflict: (conflict: EditConflict) => void
  resolveConflict: (conflictId: string, strategy: 'local' | 'remote') => void
  dismissConflict: (conflictId: string) => void
  undo: () => void
  redo: () => void
  save: () => void
  resetDemo: () => void
}

export const useReviewStore = create<ReviewState>((set, get) => {
  // 文档与界面状态（角色、选中段落、筛选、修订模式）一并持久化，重开页面后恢复
  const persist = (
    paragraphs: Paragraph[] = get().paragraphs,
    comments: Comment[] = get().comments,
    versions: Version[] = get().versions,
  ) => {
    const state = get()
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      paragraphs, comments, versions,
      role: state.role, selectedParagraphId: state.selectedParagraphId,
      commentFilter: state.commentFilter, revisionMode: state.revisionMode,
    }))
  }

  const record = (producer: (state: ReviewState) => Partial<ReviewState>) => set((state) => {
    const history = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
    const next = producer(state)
    const paragraphs = next.paragraphs ?? state.paragraphs
    const comments = next.comments ?? state.comments
    const versions = next.versions ?? state.versions
    persist(paragraphs, comments, versions)
    return { ...next, past: [...state.past.slice(-49), history], future: [], dirty: true }
  })

  return {
    role: initialRole,
    paragraphs: initialParagraphs,
    comments: initialComments,
    versions: initialVersions,
    selectedParagraphId: initialSelectedParagraphId,
    commentFilter: initialCommentFilter,
    revisionMode: initialRevisionMode,
    dirty: false,
    conflicts: [],
    past: [],
    future: [],
    setRole: (role) => { set({ role, selectedParagraphId: get().paragraphs[0]?.id ?? '' }); persist() },
    selectParagraph: (selectedParagraphId) => { set({ selectedParagraphId }); persist() },
    setCommentFilter: (commentFilter) => { set({ commentFilter }); persist() },
    setRevisionMode: (revisionMode) => { set({ revisionMode }); persist() },
    updateParagraph: (paragraphId, text) => record((state) => {
      const paragraphs = state.paragraphs.map((paragraph) => paragraph.id === paragraphId && paragraph.status !== 'locked'
        ? { ...paragraph, text, status: 'open' as const, highlighted: true }
        : paragraph)
      // 正文改动后按引用重新判定各未决片段能否定位
      return { paragraphs, comments: recomputeSnippetStaleness(state.comments, paragraphs) }
    }),
    addComment: (input) => record((state) => ({
      comments: [{
        ...input,
        id: id('comment'),
        snippets: (input.snippets ?? []).map((snippet) => ({ ...snippet, id: id('snippet'), status: 'pending' as const, stale: false })),
        author: state.role === 'reviewer' ? '审稿人 A' : state.role === 'author' ? '作者' : '编辑',
        role: state.role,
        status: 'open',
        replies: [],
        createdAt: Date.now(),
      }, ...state.comments],
    })),
    replyComment: (commentId, body) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? {
        ...comment,
        replies: [...comment.replies, { id: id('reply'), author: state.role === 'author' ? '作者' : state.role === 'reviewer' ? '审稿人 A' : '编辑', role: state.role, body, createdAt: Date.now() } as Reply],
      } : comment),
    })),
    resolveSnippet: (commentId, snippetId, accepted) => {
      // 返回定位结果：原句缺失或出现多次时不写入正文，由界面标出过期
      const outcome: { ok: boolean; reason?: 'missing' | 'multiple' } = { ok: true }
      record((state) => {
        const comment = state.comments.find((item) => item.id === commentId)
        const snippet = comment?.snippets.find((item) => item.id === snippetId)
        const paragraph = state.paragraphs.find((item) => item.id === comment?.paragraphId)
        if (!comment || !snippet || snippet.status !== 'pending' || !paragraph) { outcome.ok = false; return {} }
        if (paragraph.status === 'locked') { outcome.ok = false; return {} }

        let paragraphs = state.paragraphs
        if (accepted) {
          const nextText = applySnippetReplacement(paragraph.text, snippet.quote, snippet.replacement)
          if (nextText === null) {
            const count = countOccurrences(paragraph.text, snippet.quote)
            outcome.ok = false
            outcome.reason = count === 0 ? 'missing' : 'multiple'
            // 接受被阻止时也刷新过期标记并持久化，处理状态保持 pending
            return { comments: recomputeSnippetStaleness(state.comments, state.paragraphs) }
          }
          paragraphs = state.paragraphs.map((item) => item.id === paragraph.id ? { ...item, text: nextText } : item)
        }

        const updated = state.comments.map((item) => item.id === commentId ? {
          ...item,
          snippets: item.snippets.map((itemSnippet) => itemSnippet.id === snippetId
            ? { ...itemSnippet, status: (accepted ? 'accepted' : 'rejected') as SuggestionSnippet['status'], stale: false as const, resolvedAt: Date.now() }
            : itemSnippet),
        } : item)
        // 写入新句后其他片段要按新正文重新定位；再汇总整条建议的状态
        const comments = recomputeSnippetStaleness(updated, paragraphs)
          .map((item) => item.id === commentId ? { ...item, status: rollupCommentStatus(item) } : item)
        return { comments, paragraphs }
      })
      return outcome
    },
    mergeComment: (commentId, targetId) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? { ...comment, status: 'merged', mergedInto: targetId } : comment),
    })),
    toggleLock: (paragraphId) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId ? {
        ...paragraph,
        status: paragraph.status === 'locked' ? 'accepted' : 'locked',
      } : paragraph),
    })),
    createVersion: (label) => record((state) => ({
      versions: [{ id: id('version'), label: label.trim() || `版本 ${state.versions.length + 1}`, createdAt: Date.now(), paragraphs: clone(state.paragraphs) }, ...state.versions],
    })),
    addConflict: (conflict) => set((state) => ({ conflicts: [conflict, ...state.conflicts] })),
    resolveConflict: (conflictId, strategy) => record((state) => {
      const conflict = state.conflicts.find((item) => item.id === conflictId)
      const paragraphs = conflict && strategy === 'remote'
        ? state.paragraphs.map((paragraph) => paragraph.id === conflict.paragraphId ? { ...paragraph, text: conflict.remoteText, highlighted: true } : paragraph)
        : state.paragraphs
      return {
        paragraphs,
        comments: recomputeSnippetStaleness(state.comments, paragraphs),
        conflicts: state.conflicts.filter((item) => item.id !== conflictId),
      }
    }),
    dismissConflict: (conflictId) => set((state) => ({ conflicts: state.conflicts.filter((item) => item.id !== conflictId) })),
    undo: () => set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
      persist(previous.paragraphs, previous.comments, previous.versions)
      return { ...previous, past: state.past.slice(0, -1), future: [current, ...state.future], dirty: true }
    }),
    redo: () => set((state) => {
      const next = state.future[0]
      if (!next) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
      persist(next.paragraphs, next.comments, next.versions)
      return { ...next, past: [...state.past, current], future: state.future.slice(1), dirty: true }
    }),
    save: () => {
      persist()
      set({ dirty: false })
    },
    resetDemo: () => {
      localStorage.removeItem(DRAFT_KEY)
      const comments = recomputeSnippetStaleness(clone(baseComments), baseParagraphs)
      set({ paragraphs: clone(baseParagraphs), comments, versions: clone(initialVersions), conflicts: [], past: [], future: [], dirty: false })
      persist(clone(baseParagraphs), comments, clone(initialVersions))
    },
  }
})
