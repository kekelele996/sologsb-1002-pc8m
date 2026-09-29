// 端到端逻辑校验：驱动真实 zustand store（注入内存 localStorage）
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
}

const { useReviewStore, migrateComment } = await import('../src/store/review.ts')
const assert = (condition: unknown, label: string) => {
  if (!condition) { console.error(`✗ ${label}`); process.exitCode = 1 }
  else console.log(`✓ ${label}`)
}
const get = () => useReviewStore.getState()

const findSnippet = (commentId: string, snippetId: string) =>
  get().comments.find((c) => c.id === commentId)!.snippets.find((s) => s.id === snippetId)!

// 1. 初始：示例片段按引用定位，过期/多次片段在加载时被标出
const c1 = get().comments.find((c) => c.id === 'c-01')!
assert(c1.snippets.length === 2, '一条建议可拆成多个可定位片段')
assert(findSnippet('c-01', 's-01').stale === false, '唯一原句的片段可正常定位')
assert(findSnippet('c-03', 's-03').stale === 'missing', '原句在正文中找不到 → 标出 missing 过期')
assert(findSnippet('c-07', 's-05').stale === 'multiple', '原句出现多次 → 标出 multiple 过期')
assert(findSnippet('c-07', 's-06').stale === false, '同条建议的其他片段不受影响，仍可定位')

// 2. 只替换选中的一句，段落其他文字保持原样
const p2Before = get().paragraphs.find((p) => p.id === 'p-02')!.text
const acceptS1 = get().resolveSnippet('c-01', 's-01', true)
const p2After = get().paragraphs.find((p) => p.id === 'p-02')!.text
assert(acceptS1.ok, '接受唯一定位的片段成功')
assert(!p2After.includes('但其在真实维护工作流中的影响仍缺少系统证据。'), '接受后原句已被替换')
assert(p2After.includes('但在真实维护工作流中究竟改变了哪些协作行为，仍缺少系统证据。'), '接受后新句已写入')
assert(p2After.includes('近年来，大型语言模型被广泛用于代码生成与缺陷定位，'), '段落其他文字保持原样')
assert(findSnippet('c-01', 's-01').status === 'accepted', '片段状态变为已接受')

// 3. 接受后另一片段按“新正文”重新定位
assert(findSnippet('c-01', 's-02').stale === false, '正文改动后剩余片段仍能按引用重新定位')
get().resolveSnippet('c-01', 's-02', true)
const p2Final = get().paragraphs.find((p) => p.id === 'p-02')!.text
assert(p2Final.includes('代码生成、缺陷定位与评审分派'), '第二条片段替换独立生效')
assert(get().comments.find((c) => c.id === 'c-01')!.status === 'accepted', '所有片段接受后整条建议汇总为已接受')

// 4. 拒绝不改正文，只改处理状态
const p6Before = get().paragraphs.find((p) => p.id === 'p-06')!.text
get().resolveSnippet('c-06', 's-04', false)
const p6After = get().paragraphs.find((p) => p.id === 'p-06')!.text
assert(p6Before === p6After, '拒绝片段时正文保持原样')
assert(findSnippet('c-06', 's-04').status === 'rejected', '拒绝后片段状态变为 rejected')

// 5. 原句找不到时接受被阻止
const blockedMissing = get().resolveSnippet('c-03', 's-03', true)
assert(!blockedMissing.ok && blockedMissing.reason === 'missing', '原句缺失时停止接受并返回 missing')
assert(findSnippet('c-03', 's-03').status === 'pending', '过期片段处理状态保持 pending（只能查看）')

// 6. 原句出现多次时接受被阻止
const blockedMultiple = get().resolveSnippet('c-07', 's-05', true)
assert(!blockedMultiple.ok && blockedMultiple.reason === 'multiple', '原句多次出现时停止接受并返回 multiple')
assert(findSnippet('c-07', 's-05').status === 'pending', '多次匹配片段保持 pending')

// 7. 作者改正文后片段按引用自动重新定位（过期 → 可定位）
get().setRole('author')
get().updateParagraph('p-03', '本文收集 12 个活跃开源项目连续 18 个月的议题记录，并访谈 20 余位核心维护者。')
assert(findSnippet('c-03', 's-03').stale === false, '正文恢复原句后过期标记自动解除')
const reAccept = get().resolveSnippet('c-03', 's-03', true)
assert(reAccept.ok, '重新定位后可以正常接受')

// 8. 正文改出多个匹配时，原本正常的片段转为过期
get().updateParagraph('p-07', '在高活跃度项目中，维护者更关注建议是否可验证，而非建议生成速度。建议复核。')
assert(findSnippet('c-07', 's-06').stale === false, '长句片段不受新增文字影响')

// 9. 撤销：片段写入可整笔回滚（步骤 8 对 p-07 的编辑也占一帧，共需 3 步）
get().undo() // 回滚 p-07 的正文编辑
get().undo() // 回滚 p-03 的片段接受
const p3AfterAcceptUndo = get().paragraphs.find((p) => p.id === 'p-03')!.text
assert(p3AfterAcceptUndo.includes('并访谈 20 余位'), '先撤销接受：正文恢复为含原句的状态')
assert(findSnippet('c-03', 's-03').status === 'pending' && findSnippet('c-03', 's-03').stale === false, '片段恢复 pending 且可定位')
get().undo() // 回滚 p-03 的正文编辑（重新定位前的状态）
const p3AfterUndo = get().paragraphs.find((p) => p.id === 'p-03')!.text
assert(p3AfterUndo.includes('并访谈 26 位核心维护者') && !p3AfterUndo.includes('深度访谈'), '再撤销正文编辑：恢复到编辑前')
assert(findSnippet('c-03', 's-03').stale === 'missing', '撤销恢复正文后片段重新标出过期')
get().redo(); get().redo(); get().redo()
assert(findSnippet('c-03', 's-03').status === 'accepted', '重做后片段再次为 accepted')

// 10. 锁定段落：未决片段不能接受，只能查看
get().setRole('editor')
get().addComment({
  paragraphId: 'p-04', type: 'suggestion',
  quote: '编码过程由两名研究者独立完成。',
  body: '锁定前提交的片段',
  snippets: [{ quote: '编码过程由两名研究者独立完成。', replacement: '编码过程由两名研究者独立完成，并报告 Cohen κ 系数。' }],
})
const lockedCommentId = get().comments[0].id
const lockedSnippetId = get().comments[0].snippets[0].id
get().toggleLock('p-04')
get().setRole('author')
const lockedResult = get().resolveSnippet(lockedCommentId, lockedSnippetId, true)
assert(!lockedResult.ok, '锁定段落里的未决片段不能被接受')
assert(findSnippet(lockedCommentId, lockedSnippetId).status === 'pending', '锁定段落的片段保持 pending，仅可查看')

// 11. 持久化：重开页面后片段位置/状态/修订模式/选中段落仍在
get().setRevisionMode(true)
get().selectParagraph('p-06')
get().setCommentFilter('suggestion')
const persisted = JSON.parse(globalThis.localStorage.getItem('sologsb-1002-draft-v1')!)
assert(persisted.revisionMode === true, '修订模式写入本地')
assert(persisted.selectedParagraphId === 'p-06', '选中段落写入本地')
assert(persisted.commentFilter === 'suggestion', '筛选状态写入本地')
assert(persisted.comments.find((c: { id: string }) => c.id === 'c-01').snippets.every((s: { status: string }) => s.status === 'accepted'), '片段处理状态写入本地')
assert(persisted.comments.find((c: { id: string }) => c.id === 'c-03').snippets[0].stale === false, '重新定位后的片段位置随本地状态保留')

// 12. 迁移：旧版整段 suggestion 草稿可迁移为单片段
const legacyComment = {
  id: 'old-1', paragraphId: 'p-05', author: '审稿人 X', role: 'reviewer', type: 'suggestion',
  quote: '若仍有分歧，则邀请第三位研究者裁决。', body: '旧版数据',
  suggestion: '若仍有分歧，则由第三位研究者最终裁决。', status: 'open', replies: [], createdAt: 1,
} as never
const migratedComment = migrateComment(legacyComment as never)
assert(migratedComment.snippets.length === 1, '旧版整段建议迁移为 1 个片段')
assert(migratedComment.snippets[0].quote === '若仍有分歧，则邀请第三位研究者裁决。', '迁移片段保留原句引用')
assert(migratedComment.snippets[0].replacement === '若仍有分歧，则由第三位研究者最终裁决。', '迁移片段保留新句')
assert(migratedComment.snippets[0].status === 'pending', '待处理旧建议迁移为 pending')
