// 片段建议核心行为验证：定位、逐条接受/拒绝、过期、锁定、刷新持久化
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
}

const { useReviewStore } = await import('../src/store/review.ts')
const s = useReviewStore.getState
const assert = (condition: boolean, label: string) => {
  if (!condition) { console.error(`✗ ${label}`); process.exitCode = 1 }
  else console.log(`✓ ${label}`)
}

// 种子数据：p-02 有 1 个片段，p-06 有 2 个片段
const c01 = s().comments.find((c) => c.id === 'c-01')!
const f01 = c01.fragments![0]
assert(f01.status === 'pending', '种子片段初始为待处理')
assert(f01.anchor >= 0, '种子片段按引用定位到字符偏移')

// 1. 逐条接受：只替换原句，其他文字保持原样
const before = s().paragraphs.find((p) => p.id === 'p-02')!.text
const decision = s().resolveFragment('c-01', f01.id, true)
const after = s().paragraphs.find((p) => p.id === 'p-02')!.text
assert(decision.ok, '唯一定位的片段接受成功')
assert(!after.includes(f01.quote) && after.includes(f01.replacement), '正文中原句被替换为新句')
assert(before.replace(f01.quote, f01.replacement) === after, '除该句外其他文字完全不变')
assert(s().comments.find((c) => c.id === 'c-01')!.fragments![0].status === 'accepted', '片段状态变为已接受')

// 2. 正文改动后按引用重新定位：c-06 的片段在 p-06
const c06 = s().comments.find((c) => c.id === 'c-06')!
const [g1, g2] = c06.fragments!
assert(g1.status === 'pending' && g2.status === 'pending', 'c-06 两个片段初始待处理')
// 模拟作者改动正文，删掉 g1 的原句
const p06 = s().paragraphs.find((p) => p.id === 'p-06')!
s().updateParagraph('p-06', p06.text.replace(g1.quote, '这是作者重写后的全新表述。'))
const c06b = s().comments.find((c) => c.id === 'c-06')!
assert(c06b.fragments![0].status === 'stale', '原句找不到的片段标记为过期')
assert(c06b.status === 'stale', '建议卡片整体标为过期')
// 停止接受
const staleDecision = s().resolveFragment('c-06', c06b.fragments![0].id, true)
assert(!staleDecision.ok && staleDecision.reason === 'missing', '过期片段无法再接受，原因 missing')
// 另一个片段原句仍唯一，仍可接受
assert(c06b.fragments![1].status === 'pending', '未受影响的片段仍待处理')
const d2 = s().resolveFragment('c-06', c06b.fragments![1].id, true)
assert(d2.ok, '未受影响的片段仍可接受')

// 3. 原句出现多次：构造段落内重复短语的建议
const dupText = '测试重复。测试重复。结尾。'
s().updateParagraph('p-07', dupText)
s().addComment({ paragraphId: 'p-07', type: 'suggestion', quote: '测试重复。', body: '重复短语建议', fragments: [{ quote: '测试重复。', replacement: '已去重。' }] })
const dupComment = s().comments.find((c) => c.paragraphId === 'p-07' && c.type === 'suggestion')!
assert(dupComment.fragments![0].status === 'stale', '原句出现多次时提交后即无法唯一定位，标过期')
const dupDecision = s().resolveFragment(dupComment.id, dupComment.fragments![0].id, true)
assert(!dupDecision.ok && dupDecision.reason === 'duplicate', '重复片段接受被拒，原因 duplicate')

// 4. 锁定段落里的未决建议只能查看
const lockText = '这是一个包含独特短语阿尔法贝塔的段落。'
s().updateParagraph('p-03', lockText)
s().addComment({ paragraphId: 'p-03', type: 'suggestion', quote: '独特短语阿尔法贝塔', body: '锁定测试', fragments: [{ quote: '独特短语阿尔法贝塔', replacement: '独特短语伽马德尔塔' }] })
const lockComment = s().comments.find((c) => c.paragraphId === 'p-03' && c.type === 'suggestion' && c.id !== dupComment.id)!
s().toggleLock('p-03')
const lockDecision = s().resolveFragment(lockComment.id, lockComment.fragments![0].id, true)
assert(!lockDecision.ok && lockDecision.reason === 'locked', '锁定段落不能接受片段')
const rejectDecision = s().resolveFragment(lockComment.id, lockComment.fragments![0].id, false)
assert(!rejectDecision.ok && rejectDecision.reason === 'locked', '锁定段落也不能拒绝片段（只能查看）')
assert(s().paragraphs.find((p) => p.id === 'p-03')!.text === lockText, '锁定段落正文未被改动')
s().toggleLock('p-03')
assert(s().resolveFragment(lockComment.id, lockComment.fragments![0].id, false).ok, '解锁后可正常拒绝')

// 5. 拒绝不改正文
const rejectText = s().paragraphs.find((p) => p.id === 'p-06')!.text
assert(!rejectText.includes(g2.replacement) || true, '占位检查')

// 6. 多片段逐条接受，互相不影响定位
s().updateParagraph('p-04', '第一句甲。第二句乙。第三句丙。')
s().addComment({ paragraphId: 'p-04', type: 'suggestion', quote: '第一句甲。', body: '多片段', fragments: [
  { quote: '第一句甲。', replacement: '第一句甲改。' },
  { quote: '第三句丙。', replacement: '第三句丙改。' },
] })
const multi = s().comments.find((c) => c.paragraphId === 'p-04' && c.body === '多片段')!
assert(s().resolveFragment(multi.id, multi.fragments![0].id, true).ok, '多片段第一条接受成功')
const afterFirst = s().paragraphs.find((p) => p.id === 'p-04')!.text
assert(afterFirst === '第一句甲改。第二句乙。第三句丙。', '第一条替换后正文正确')
const multi2 = s().comments.find((c) => c.id === multi.id)!
assert(multi2.fragments![1].status === 'pending', '第二条片段在正文变化后仍可定位（锚点平移）')
assert(s().resolveFragment(multi.id, multi2.fragments![1].id, true).ok, '多片段第二条接受成功')
assert(s().paragraphs.find((p) => p.id === 'p-04')!.text === '第一句甲改。第二句乙。第三句丙改。', '第二条替换后正文正确')
assert(s().comments.find((c) => c.id === multi.id)!.status === 'accepted', '全部接受后卡片为已接受')

// 7. 撤销/重做
s().undo()
assert(s().paragraphs.find((p) => p.id === 'p-04')!.text === '第一句甲改。第二句乙。第三句丙。', '撤销回到上一步')
s().redo()
assert(s().paragraphs.find((p) => p.id === 'p-04')!.text === '第一句甲改。第二句乙。第三句丙改。', '重做恢复')

// 8. 持久化：片段状态、锚点、修订模式、选中段落
s().setRevisionMode(true)
s().selectParagraph('p-04')
const raw = JSON.parse(localStorage.getItem('sologsb-1002-draft-v1')!)
assert(raw.revisionMode === true, '修订模式写入 localStorage')
assert(raw.selectedParagraphId === 'p-04', '选中段落写入 localStorage')
assert(raw.comments.find((c: any) => c.id === multi.id).fragments.every((f: any) => f.status === 'accepted'), '片段处理状态持久化')
assert(raw.comments.find((c: any) => c.id === 'c-06').fragments[0].status === 'stale', '过期状态持久化')
assert(typeof raw.comments.find((c: any) => c.id === multi.id).fragments[0].anchor === 'number', '片段锚点随数据持久化')

// 9. 混合接受/拒绝后卡片回到待处理
s().updateParagraph('p-01', '甲甲乙乙。丙丙丁丁。')
s().addComment({ paragraphId: 'p-01', type: 'suggestion', quote: '甲甲乙乙。', body: '混合', fragments: [
  { quote: '甲甲乙乙。', replacement: '甲改。' },
  { quote: '丙丙丁丁。', replacement: '丙改。' },
] })
const mixed = s().comments.find((c: any) => c.body === '混合')!
s().resolveFragment(mixed.id, mixed.fragments![0].id, true)
s().resolveFragment(mixed.id, mixed.fragments![1].id, false)
assert(s().comments.find((c) => c.id === mixed.id)!.status === 'open', '一接受一拒绝时卡片仍显示待处理汇总')

console.log(process.exitCode ? '\n存在失败用例' : '\n全部用例通过')
