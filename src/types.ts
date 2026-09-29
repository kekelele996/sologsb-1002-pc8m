export type Role = 'author' | 'reviewer' | 'editor'
export type ParagraphStatus = 'open' | 'accepted' | 'locked'
// stale：原句在正文中找不到或出现多次，建议已过期，不能再接受
export type CommentStatus = 'open' | 'accepted' | 'rejected' | 'merged' | 'stale'
export type CommentType = 'comment' | 'suggestion'
// 片段处理状态：待处理 / 已接受 / 已拒绝 / 过期（正文变动导致无法定位）
export type FragmentStatus = 'pending' | 'accepted' | 'rejected' | 'stale'
// 片段在正文中的实时定位结果
export type FragmentLocation = 'unique' | 'missing' | 'duplicate'

export interface Reply {
  id: string
  author: string
  role: Role
  body: string
  createdAt: number
}

export interface SuggestionFragment {
  id: string
  /** 审稿人选中的原句，用于按内容在段落正文中重新定位 */
  quote: string
  /** 替换后的新句 */
  replacement: string
  status: FragmentStatus
  /** 最后一次成功定位时在段落中的字符偏移；找不到/多次时保留旧值用于回看 */
  anchor: number
}

export interface Comment {
  id: string
  paragraphId: string
  author: string
  role: Role
  type: CommentType
  quote: string
  body: string
  /** 旧版整段建议，仅用于迁移历史草稿 */
  suggestion?: string
  /** 修改建议拆出的可定位替换片段 */
  fragments?: SuggestionFragment[]
  status: CommentStatus
  replies: Reply[]
  createdAt: number
  mergedInto?: string
}

export interface Paragraph {
  id: string
  section: string
  number: string
  text: string
  original: string
  status: ParagraphStatus
  highlighted: boolean
}

export interface Version {
  id: string
  label: string
  createdAt: number
  paragraphs: Paragraph[]
}

export interface EditConflict {
  id: string
  paragraphId: string
  localText: string
  remoteText: string
  localAuthor: string
  remoteAuthor: string
  detectedAt: number
}

export interface HistorySnapshot {
  paragraphs: Paragraph[]
  comments: Comment[]
  versions: Version[]
}

/** 统计 quote 在正文中出现的次数 */
export const countOccurrences = (text: string, quote: string): number => {
  if (!quote) return 0
  let count = 0
  let index = text.indexOf(quote)
  while (index !== -1) {
    count += 1
    index = text.indexOf(quote, index + quote.length)
  }
  return count
}

/** 按引用重新定位片段：恰好一次才算可定位 */
export const locateFragment = (text: string, fragment: Pick<SuggestionFragment, 'quote' | 'anchor'>): { location: FragmentLocation; anchor: number } => {
  const first = text.indexOf(fragment.quote)
  const count = countOccurrences(text, fragment.quote)
  if (count === 1) return { location: 'unique', anchor: first }
  if (count === 0) return { location: 'missing', anchor: fragment.anchor }
  return { location: 'duplicate', anchor: first }
}
