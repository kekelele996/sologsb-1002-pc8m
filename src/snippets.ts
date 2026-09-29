import type { Comment, Paragraph, SuggestionSnippet } from './types'

/** 统计 needle 在 text 中出现的次数（不重叠）；空串按 0 处理 */
export const countOccurrences = (text: string, needle: string): number => {
  if (!needle) return 0
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(needle, pos)) !== -1) {
    count += 1
    pos += needle.length
  }
  return count
}

/** 依据当前正文重新判定一条待处理片段是否过期：找不到 / 出现多次都无法唯一定位 */
export const deriveSnippetStale = (snippet: SuggestionSnippet, paragraphText: string | undefined) => {
  if (snippet.status !== 'pending' || paragraphText === undefined) return false as const
  const count = countOccurrences(paragraphText, snippet.quote)
  if (count === 0) return 'missing' as const
  if (count > 1) return 'multiple' as const
  return false as const
}

/** 正文每次改动后，按引用（原句文本）重新计算所有未决片段能否定位 */
export const recomputeSnippetStaleness = (comments: Comment[], paragraphs: Paragraph[]): Comment[] =>
  comments.map((comment) => {
    if (!comment.snippets.length) return comment
    const paragraph = paragraphs.find((item) => item.id === comment.paragraphId)
    return {
      ...comment,
      snippets: comment.snippets.map((snippet) => ({ ...snippet, stale: deriveSnippetStale(snippet, paragraph?.text) })),
    }
  })

/** 取出段落中可唯一定位的待处理片段（用于正文内高亮） */
export const locatablePendingSnippets = (comment: Comment, paragraphText: string) =>
  comment.snippets.filter((snippet) => snippet.status === 'pending' && !deriveSnippetStale(snippet, paragraphText))

/** 用新句替换正文中唯一的原句；原句缺失或不唯一时返回 null（停止接受） */
export const applySnippetReplacement = (text: string, quote: string, replacement: string): string | null => {
  if (countOccurrences(text, quote) !== 1) return null
  const index = text.indexOf(quote)
  return `${text.slice(0, index)}${replacement}${text.slice(index + quote.length)}`
}

/** 汇总片段状态，得到整条建议卡片的状态 */
export const rollupCommentStatus = (comment: Comment): Comment['status'] => {
  if (!comment.snippets.length) return comment.status
  if (comment.snippets.every((snippet) => snippet.status === 'accepted')) return 'accepted'
  if (comment.snippets.every((snippet) => snippet.status === 'rejected')) return 'rejected'
  return 'open'
}

export interface TextRange {
  start: number
  end: number
  kind: 'pending' | 'accepted'
  commentId: string
  snippetId: string
  quote: string
  replacement?: string
}

/**
 * 把片段按当前正文折算成互不重叠的区间，供正文逐段渲染高亮。
 * 待处理片段按原句定位；已接受片段按写入后的新句定位（修订模式下展示删除/新增）。
 * 只接受未合并的建议卡片上的片段。
 */
export const buildSnippetRanges = (
  text: string,
  items: Array<{ commentId: string; snippet: SuggestionSnippet }>,
): TextRange[] => {
  const ranges: TextRange[] = []
  for (const { commentId, snippet } of items) {
    if (snippet.status === 'pending') {
      if (snippet.stale) continue
      const start = text.indexOf(snippet.quote)
      if (start !== -1) ranges.push({ start, end: start + snippet.quote.length, kind: 'pending', commentId, snippetId: snippet.id, quote: snippet.quote })
    } else if (snippet.status === 'accepted') {
      const start = text.indexOf(snippet.replacement)
      if (start !== -1 && countOccurrences(text, snippet.replacement) === 1) {
        ranges.push({ start, end: start + snippet.replacement.length, kind: 'accepted', commentId, snippetId: snippet.id, quote: snippet.quote, replacement: snippet.replacement })
      }
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)
  // 丢弃与前一个区间重叠的区间，保证逐段切分不会交叉嵌套
  const result: TextRange[] = []
  for (const range of ranges) {
    const last = result[result.length - 1]
    if (last && range.start < last.end) continue
    result.push(range)
  }
  return result
}
