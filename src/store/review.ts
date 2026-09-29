import { create } from 'zustand'
import { locateFragment } from '../types'
import type {
  Comment, EditConflict, FragmentLocation, FragmentStatus, Paragraph, Reply, Role,
  SuggestionFragment, Version,
} from '../types'

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

/** 构造可定位片段并记录初始字符偏移 */
const makeFragment = (quote: string, replacement: string, text: string): SuggestionFragment => ({
  id: id('frag'),
  quote,
  replacement,
  status: 'pending',
  anchor: text.indexOf(quote),
})

const baseComments: Comment[] = [
  {
    id: 'c-01', paragraphId: 'p-02', author: '审稿人 A', role: 'reviewer', type: 'suggestion',
    quote: '其真实维护工作流中的影响', body: '建议把“影响”具体化为可观察的协作行为。', status: 'open',
    replies: [{ id: 'r-01', author: '作者', role: 'author', body: '可以，修改后会补充指标定义。', createdAt: Date.now() - 7200000 }],
    createdAt: Date.now() - 86400000,
    fragments: [
      makeFragment('其在真实维护工作流中的影响仍缺少系统证据。', '其在真实维护工作流中究竟改变了哪些协作行为，仍缺少系统证据。', baseParagraphs[1].text),
    ],
  },
  { id: 'c-02', paragraphId: 'p-02', author: '审稿人 B', role: 'reviewer', type: 'comment', quote: '缺少系统证据', body: '这里的“系统证据”范围过大，建议限定为本研究覆盖的议题语料。', status: 'open', replies: [], createdAt: Date.now() - 64000000 },
  { id: 'c-03', paragraphId: 'p-03', author: '审稿人 A', role: 'reviewer', type: 'comment', quote: '26 位核心维护者', body: '请说明抽样方式和地域分布，避免样本选择偏差。', status: 'open', replies: [], createdAt: Date.now() - 54000000 },
  { id: 'c-04', paragraphId: 'p-04', author: '审稿人 C', role: 'reviewer', type: 'comment', quote: '两名研究者独立完成', body: '建议报告编码者间一致性系数，并明确不一致处理规则。', status: 'open', replies: [], createdAt: Date.now() - 48000000 },
  { id: 'c-05', paragraphId: 'p-05', author: '审稿人 D', role: 'reviewer', type: 'comment', quote: '邀请第三位研究者裁决', body: '与上一段重复：都在说明编码分歧如何解决，建议合并意见。', status: 'open', replies: [], createdAt: Date.now() - 43000000 },
  {
    id: 'c-06', paragraphId: 'p-06', author: '审稿人 B', role: 'reviewer', type: 'suggestion',
    quote: '但没有显著降低维护者处理复杂议题的认知负担', body: '“显著”需要给出统计检验与效应量，建议拆成两个可检验指标。', status: 'open',
    replies: [], createdAt: Date.now() - 36000000,
    fragments: [
      makeFragment('但没有显著降低维护者处理复杂议题的认知负担。', '但对复杂议题处理时长未产生统计显著影响（p = 0.21）。', baseParagraphs[5].text),
      makeFragment('初步结果显示，辅助工具缩短了首次响应时间，', '初步结果显示，辅助工具使首次响应时间中位数缩短约 18%，', baseParagraphs[5].text),
    ],
  },
]

type PersistShape = Partial<{
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
  revisionMode: boolean
  selectedParagraphId: string
}>

const seed = typeof localStorage !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
const parsed = seed ? JSON.parse(seed) as PersistShape : null
const initialParagraphs = parsed?.paragraphs?.length ? parsed.paragraphs : baseParagraphs
const initialComments = parsed?.comments ?? baseComments
const initialVersions: Version[] = parsed?.versions ?? [
  { id: 'v-01', label: '投稿初稿 v1', createdAt: Date.now() - 1209600000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs)) as Paragraph[] },
  { id: 'v-02', label: '审阅基线 v2', createdAt: Date.now() - 172800000, paragraphs: JSON.parse(JSON.stringify(baseParagraphs.map((p) => p.id === 'p-04' ? { ...p, text: `${p.text} 编码规则在预注册方案中说明。` } : p))) as Paragraph[] },
]
const initialRevisionMode = parsed?.revisionMode ?? false
const initialSelectedParagraphId = parsed?.selectedParagraphId ?? 'p-02'

const persistDraft = (paragraphs: Paragraph[], comments: Comment[], versions: Version[], revisionMode: boolean, selectedParagraphId: string) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ paragraphs, comments, versions, revisionMode, selectedParagraphId }))
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** 片段在当前正文中的实时定位（每次渲染时按引用重新计算） */
export const locateCommentFragment = (
  paragraph: Paragraph | undefined,
  fragment: SuggestionFragment,
): { location: FragmentLocation; anchor: number } => {
  if (!paragraph) return { location: 'missing', anchor: fragment.anchor }
  return locateFragment(paragraph.text, fragment)
}

/** 重新同步整条建议：正文改动后按引用重定位，待处理片段找不到或出现多次即标记过期 */
const refreshComment = (comment: Comment, paragraphs: Paragraph[]): Comment => {
  if (comment.type !== 'suggestion' || !comment.fragments?.length || comment.status === 'merged') return comment
  const paragraph = paragraphs.find((item) => item.id === comment.paragraphId)
  let changed = false
  const fragments = comment.fragments.map((fragment) => {
    if (fragment.status !== 'pending') return fragment
    const { location, anchor } = locateCommentFragment(paragraph, fragment)
    if (location === 'unique') {
      if (fragment.anchor !== anchor) changed = true
      return fragment.anchor === anchor ? fragment : { ...fragment, anchor }
    }
    changed = true
    return { ...fragment, status: 'stale' as FragmentStatus, anchor: location === 'duplicate' ? anchor : fragment.anchor }
  })
  if (!changed) return comment
  return { ...comment, fragments, status: rollUpCommentStatus({ ...comment, fragments }) }
}

/** 正文或建议变化后统一刷新所有待处理建议的过期状态 */
const refreshAllComments = (comments: Comment[], paragraphs: Paragraph[]): Comment[] =>
  comments.map((comment) => refreshComment(comment, paragraphs))

/** 汇总片段状态得到建议卡片状态：有过期片段优先标出过期（其余待处理片段仍可逐条处理）；再看是否仍有待处理；否则按接受/拒绝处理 */
const rollUpCommentStatus = (comment: Comment): Comment['status'] => {
  if (comment.status === 'merged') return 'merged'
  if (!comment.fragments?.length) return comment.status
  const statuses = comment.fragments.map((fragment) => fragment.status)
  if (statuses.includes('stale')) return 'stale'
  if (statuses.includes('pending')) return 'open'
  if (statuses.includes('accepted')) return statuses.includes('rejected') ? 'open' : 'accepted'
  return 'rejected'
}

export interface FragmentDecision {
  ok: boolean
  reason?: 'locked' | 'stale' | 'missing' | 'duplicate' | 'not-found'
}

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
  addComment: (input: Pick<Comment, 'paragraphId' | 'type' | 'quote' | 'body'> & { fragments?: { quote: string; replacement: string }[] }) => void
  replyComment: (commentId: string, body: string) => void
  /** 作者在修订模式里逐条接受或拒绝某个替换片段 */
  resolveFragment: (commentId: string, fragmentId: string, accepted: boolean) => FragmentDecision
  /** 旧入口保留：整卡操作（锁定段落与过期片段会被拦下） */
  resolveSuggestion: (commentId: string, accepted: boolean) => FragmentDecision
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
  const persist = (state: Pick<ReviewState, 'paragraphs' | 'comments' | 'versions' | 'revisionMode' | 'selectedParagraphId'>) =>
    persistDraft(state.paragraphs, state.comments, state.versions, state.revisionMode, state.selectedParagraphId)
  const record = (producer: (state: ReviewState) => Partial<ReviewState>) => set((state) => {
    const history = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
    const produced = producer(state)
    const paragraphs = produced.paragraphs ?? state.paragraphs
    // 正文一旦变化，所有待处理片段都按引用重新定位，找不到/出现多次的立即标过期
    const comments = refreshAllComments(produced.comments ?? state.comments, paragraphs)
    const versions = produced.versions ?? state.versions
    persist({ ...state, ...produced, paragraphs, comments, versions })
    return { ...produced, paragraphs, comments, past: [...state.past.slice(-49), history], future: [], dirty: true }
  })

  return {
    role: 'reviewer',
    paragraphs: initialParagraphs,
    comments: refreshAllComments(initialComments, initialParagraphs),
    versions: initialVersions,
    selectedParagraphId: initialSelectedParagraphId,
    commentFilter: 'all',
    revisionMode: initialRevisionMode,
    dirty: false,
    conflicts: [],
    past: [],
    future: [],
    setRole: (role) => set((state) => {
      const selectedParagraphId = get().paragraphs[0]?.id ?? ''
      persist({ paragraphs: state.paragraphs, comments: state.comments, versions: state.versions, revisionMode: state.revisionMode, selectedParagraphId })
      return { role, selectedParagraphId }
    }),
    selectParagraph: (selectedParagraphId) => set((state) => {
      persist({ ...state, selectedParagraphId })
      return { selectedParagraphId }
    }),
    setCommentFilter: (commentFilter) => set({ commentFilter }),
    setRevisionMode: (revisionMode) => set((state) => {
      persist({ ...state, revisionMode })
      return { revisionMode }
    }),
    updateParagraph: (paragraphId, text) => record((state) => ({
      paragraphs: state.paragraphs.map((paragraph) => paragraph.id === paragraphId && paragraph.status !== 'locked'
        ? { ...paragraph, text, status: 'open' as const, highlighted: true }
        : paragraph),
    })),
    addComment: (input) => record((state) => {
      const paragraph = state.paragraphs.find((item) => item.id === input.paragraphId)
      const authorName = state.role === 'reviewer' ? '审稿人 A' : state.role === 'author' ? '作者' : '编辑'
      const fragments = input.type === 'suggestion' && paragraph
        ? input.fragments
          ?.map((item) => ({ quote: item.quote.trim(), replacement: item.replacement.trim() }))
          .filter((item) => item.quote && item.replacement)
          .map((item) => makeFragment(item.quote, item.replacement, paragraph.text))
        : undefined
      const comment: Comment = {
        paragraphId: input.paragraphId,
        author: authorName,
        role: state.role,
        type: input.type,
        quote: input.quote,
        body: input.body,
        id: id('comment'),
        status: 'open',
        replies: [],
        createdAt: Date.now(),
        ...(fragments?.length ? { fragments } : {}),
      }
      return { comments: [comment, ...state.comments] }
    }),
    replyComment: (commentId, body) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? {
        ...comment,
        replies: [...comment.replies, { id: id('reply'), author: state.role === 'author' ? '作者' : state.role === 'reviewer' ? '审稿人 A' : '编辑', role: state.role, body, createdAt: Date.now() } as Reply],
      } : comment),
    })),
    resolveFragment: (commentId, fragmentId, accepted) => {
      const state = get()
      const comment = state.comments.find((item) => item.id === commentId)
      const fragment = comment?.fragments?.find((item) => item.id === fragmentId)
      const paragraph = state.paragraphs.find((item) => item.id === comment?.paragraphId)
      if (!comment || !fragment || !paragraph) return { ok: false, reason: 'not-found' }
      // 锁定段落里的未决建议只能查看，不能接受或拒绝
      if (paragraph.status === 'locked') return { ok: false, reason: 'locked' }
      if (!accepted) {
        record((current) => ({
          comments: current.comments.map((item) => {
            if (item.id !== commentId) return item
            const fragments = item.fragments?.map((frag) => frag.id === fragmentId ? { ...frag, status: 'rejected' as FragmentStatus } : frag)
            return { ...item, fragments, status: rollUpCommentStatus({ ...item, fragments }) }
          }),
        }))
        return { ok: true }
      }
      // 接受前按引用重新定位；原句找不到或出现多次时停止接受并标出过期
      const { location, anchor } = locateCommentFragment(paragraph, fragment)
      if (location !== 'unique') {
        record((current) => ({
          comments: current.comments.map((item) => item.id !== commentId ? item : {
            ...item,
            status: 'stale',
            fragments: item.fragments?.map((frag) => frag.id === fragmentId
              ? { ...frag, status: 'stale' as FragmentStatus, anchor: location === 'duplicate' ? anchor : frag.anchor }
              : frag),
          }),
        }))
        return { ok: false, reason: location }
      }
      record((current) => {
        const targetParagraph = current.paragraphs.find((item) => item.id === comment.paragraphId)
        if (!targetParagraph) return {}
        const text = targetParagraph.text.slice(0, anchor) + fragment.replacement + targetParagraph.text.slice(anchor + fragment.quote.length)
        const paragraphs = current.paragraphs.map((item) => item.id === targetParagraph.id ? { ...item, text, status: 'accepted' as const, highlighted: true } : item)
        // 先替换正文，再让同段其他待处理片段按新正文重新定位（锚点随之平移，过期的会被标出）
        const comments = current.comments.map((item) => {
          if (item.id !== commentId) return item
          const fragments = item.fragments?.map((frag) => frag.id === fragmentId ? { ...frag, status: 'accepted' as FragmentStatus, anchor } : frag)
          return { ...item, fragments, status: rollUpCommentStatus({ ...item, fragments }) }
        })
        return { paragraphs, comments }
      })
      return { ok: true }
    },
    resolveSuggestion: (commentId, accepted) => {
      const comment = get().comments.find((item) => item.id === commentId)
      if (!comment?.fragments?.length) return { ok: false, reason: 'not-found' }
      // 整卡接受：逐条应用，遇到过期立即停止；拒绝则只作用于待处理片段
      const pending = comment.fragments.filter((fragment) => fragment.status === 'pending')
      if (!accepted) {
        pending.forEach((fragment) => get().resolveFragment(commentId, fragment.id, false))
        return { ok: true }
      }
      for (const fragment of pending) {
        const decision = get().resolveFragment(commentId, fragment.id, true)
        if (!decision.ok) return decision
      }
      return { ok: true }
    },
    mergeComment: (commentId, targetId) => record((state) => ({
      comments: state.comments.map((comment) => comment.id === commentId ? { ...comment, status: 'merged' as const, mergedInto: targetId } : comment),
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
      return {
        paragraphs: conflict && strategy === 'remote'
          ? state.paragraphs.map((paragraph) => paragraph.id === conflict.paragraphId ? { ...paragraph, text: conflict.remoteText, highlighted: true } : paragraph)
          : state.paragraphs,
        conflicts: state.conflicts.filter((item) => item.id !== conflictId),
      }
    }),
    dismissConflict: (conflictId) => set((state) => ({ conflicts: state.conflicts.filter((item) => item.id !== conflictId) })),
    undo: () => set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
      const paragraphs = previous.paragraphs
      const comments = refreshAllComments(previous.comments, paragraphs)
      persist({ ...state, paragraphs, comments, versions: previous.versions })
      return { paragraphs, comments, versions: previous.versions, past: state.past.slice(0, -1), future: [current, ...state.future], dirty: true }
    }),
    redo: () => set((state) => {
      const next = state.future[0]
      if (!next) return state
      const current = { paragraphs: clone(state.paragraphs), comments: clone(state.comments), versions: clone(state.versions) }
      const paragraphs = next.paragraphs
      const comments = refreshAllComments(next.comments, paragraphs)
      persist({ ...state, paragraphs, comments, versions: next.versions })
      return { paragraphs, comments, versions: next.versions, past: [...state.past, current], future: state.future.slice(1), dirty: true }
    }),
    save: () => {
      persist(get())
      set({ dirty: false })
    },
    resetDemo: () => {
      const freshComments = refreshAllComments(clone(baseComments), baseParagraphs)
      localStorage.removeItem(DRAFT_KEY)
      set({
        paragraphs: clone(baseParagraphs), comments: freshComments, versions: clone(initialVersions),
        conflicts: [], past: [], future: [], dirty: false, revisionMode: false, selectedParagraphId: 'p-02',
      })
      persistDraft(baseParagraphs, freshComments, initialVersions, false, 'p-02')
    },
  }
})
