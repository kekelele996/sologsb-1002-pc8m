export type Role = 'author' | 'reviewer' | 'editor'
export type ParagraphStatus = 'open' | 'accepted' | 'locked'
export type CommentStatus = 'open' | 'accepted' | 'rejected' | 'merged'
export type CommentType = 'comment' | 'suggestion'
// 片段处理状态：待处理 / 已接受（新句已写入正文）/ 已拒绝
export type SnippetStatus = 'pending' | 'accepted' | 'rejected'
// 待处理片段的定位结果：可唯一定位 / 原句找不到（过期）/ 原句出现多次（无法唯一定位，按过期处理）
export type SnippetStale = false | 'missing' | 'multiple'

export interface Reply {
  id: string
  author: string
  role: Role
  body: string
  createdAt: number
}

export interface SuggestionSnippet {
  id: string
  /** 审稿人在正文中选中的原句 */
  quote: string
  /** 审稿人填写的新句，接受后只替换原句这一段 */
  replacement: string
  status: SnippetStatus
  /** 依据当前正文动态判定的过期情况；accepted/rejected 一律为 false */
  stale: SnippetStale
  resolvedAt?: number
}

export interface Comment {
  id: string
  paragraphId: string
  author: string
  role: Role
  type: CommentType
  quote: string
  body: string
  /** @deprecated 旧版整段建议，迁移后统一使用 snippets */
  suggestion?: string
  /** 修改建议拆出的可定位替换片段；批注类意见为空 */
  snippets: SuggestionSnippet[]
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
