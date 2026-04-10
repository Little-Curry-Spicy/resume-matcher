import type { AnalysisResult, GapItem, InterviewItem } from '@/types/analysis'

function extractKeywords(text: string, limit = 6): string[] {
  const stop = new Set([
    'and',
    'the',
    'for',
    'with',
    'you',
    'our',
    'are',
    'will',
    'this',
    'that',
    'from',
    'your',
    'have',
    'has',
    'not',
    'all',
    'any',
    'can',
    '可',
    '的',
    '和',
    '与',
    '等',
    '及',
    '在',
    '为',
    '了',
    '对',
    '将',
    '或',
  ])
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/g)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !stop.has(w))
    .slice(0, limit)
}

function buildGaps(jd: string): GapItem[] {
  const keys = extractKeywords(jd)
  const focus = keys[0] ?? '岗位核心栈'
  return [
    {
      id: 'g1',
      title: `与「${focus}」相关的可量化成果偏少`,
      detail:
        '招聘方通常会寻找可验证的业务影响（指标、规模、节省成本/时间）。建议在项目下补充 1–2 条结果型表述，并与岗位 KPI 对齐。',
      severity: 'high',
      jdAnchor: jd.slice(0, 80) || '（未粘贴完整 JD）',
    },
    {
      id: 'g2',
      title: '技术关键词覆盖不足',
      detail:
        'JD 中的工具链与领域词在简历前 1/3 出现频率较低。可在摘要与首段经历中自然嵌入关键技能，避免堆砌。',
      severity: 'medium',
    },
    {
      id: 'g3',
      title: '职责描述偏泛，缺少情境—行动—结果结构',
      detail:
        '将每条要点改写为「情境 + 你做了什么 + 结果」，并突出跨团队、ownership、权衡取舍等信号词。',
      severity: 'medium',
    },
    {
      id: 'g4',
      title: '英文简历拼写与大小写一致性',
      detail:
        '多段项目标题大小写不统一会影响专业度。统一产品名大小写，并检查动词时态（过去经历用过去式）。',
      severity: 'low',
    },
  ]
}

function buildInterviews(jd: string): InterviewItem[] {
  const keys = extractKeywords(jd)
  const k = keys.slice(0, 3).join(' / ') || '岗位关键技术栈'
  return [
    {
      id: 'q1',
      question: `请深入讲讲你如何在生产环境中落地「${k}」相关能力？`,
      rationale: '验证你是否真实主导过复杂场景，而不是仅罗列关键词。',
    },
    {
      id: 'q2',
      question: '描述一次你与产品/业务目标发生冲突的经历，你如何取舍？',
      rationale: '大厂常考察协作、优先级与沟通，尤其在岗位描述强调 cross-functional 时。',
    },
    {
      id: 'q3',
      question: '简历里最有挑战的一个项目：瓶颈是什么，你如何度量成功？',
      rationale: '结合项目与 JD 中的指标导向，考察问题拆解与数据思维。',
    },
    {
      id: 'q4',
      question: '如果要在 6 周内交付 JD 中的核心职责之一，你的计划与风险清单是什么？',
      rationale: '模拟真实工作节奏，观察结构化思考与风险管理。',
    },
  ]
}

function buildRevisedMarkdown(jd: string, digest: string): string {
  const keys = extractKeywords(jd).slice(0, 4)
  const stackLine =
    keys.length > 0
      ? `**Tech focus aligned to role:** ${keys.map((k) => `\`${k}\``).join(' · ')}`
      : '**Tech focus aligned to role:** _（连接真实模型后，将根据 JD 自动抽取）_'

  return [
    '# Your Name',
    '_City · Email · Portfolio / GitHub_',
    '',
    '## Summary',
    '',
    '> 前端演示稿：将原始简历要点与岗位关键词对齐，突出可验证成果与相关栈经验。',
    '',
    '以下演示 **修订对照** 语法：`~~删除线~~` 表示删改前表述（红底），`++绿底++` 表示新增补充。',
    '',
    '- ~~负责部分后台接口~~ ++独立负责核心 API 设计与性能优化（p99 下降 35%）++',
    '',
    stackLine,
    '',
    '## Selected impact',
    '',
    '- 将关键系统 **p99 延迟降低 ~35%**，通过缓存分层与观测驱动迭代（示例，替换为你的真实数据）。',
    '- 在 **跨职能团队** 中牵头需求澄清与里程碑管理，按期交付并减少返工（示例）。',
    '',
    '## Experience',
    '',
    '### Senior Role — Company',
    '_2022 — Present_',
    '',
    '- Own end-to-end delivery for customer-facing workflows; partner with design and PM on discovery.',
    '- Introduce lightweight quality gates (lint, preview environments) to shorten review cycles.',
    '',
    '### Earlier role — Company',
    '_2019 — 2022_',
    '',
    '- Shipped features used by **X** MAU; instrumented funnels to validate adoption.',
    '',
    '## Projects (tailored)',
    '',
    '### Project aligned to posting',
    `- _Digest from your file:_ ${digest.slice(0, 220)}${digest.length > 220 ? '…' : ''}`,
    '',
    '## Education & certifications',
    '',
    '- …',
    '',
    '---',
    '',
    '_本内容由前端占位逻辑生成；接入模型后替换 `revisedMarkdown` 即可预览。_',
  ].join('\n')
}

/** 浏览器内演示：结合 JD 的排版润色占位 */
export async function runMockPolish(input: {
  plainText: string
  jd: string
}): Promise<{ revisedMarkdown: string; originalDigest: string }> {
  await new Promise((r) => setTimeout(r, 900))
  const raw = input.plainText.trim()
  const jdShort = (input.jd.trim() || '（未填 JD）').slice(0, 120)
  const digest =
    raw.length > 2_800 ? `${raw.slice(0, 2_800)}…` : raw || '（无正文）'
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const slice = lines.slice(0, 14)
  let experienceBlock = slice.map((l) => `- ${l}`).join('\n')
  if (lines.length > slice.length) {
    experienceBlock +=
      '\n\n_…（演示省略后续；配置 API 后由模型输出完整润色稿）_'
  }
  if (!experienceBlock.trim()) {
    experienceBlock = '- （未能从文件中解析出可读段落）'
  }

  const revisedMarkdown = [
    '# 姓名',
    '',
    '_城市 · 邮箱 · 作品集 / GitHub_',
    '',
    '## Summary',
    '',
    `> **演示稿**：已按当前 JD 摘要做结构占位（真实环境由模型结合完整 JD 优化措辞与关键词）。JD 摘录：「${jdShort}${input.jd.trim().length > 120 ? '…' : ''}」`,
    '',
    '## Experience（节选）',
    '',
    experienceBlock,
    '',
    '## Skills',
    '',
    '- 根据原文与 JD 相关技术词整理（占位）。',
  ].join('\n')

  return { revisedMarkdown, originalDigest: digest }
}

/**
 * 模拟异步 AI：仅用于前端联调与体验走通。
 * 接入后端时，用接口响应替换此函数返回值即可。
 */
export async function runMockAnalysis(input: {
  jd: string
  originalDigest: string
}): Promise<AnalysisResult> {
  await new Promise((r) => setTimeout(r, 1200))
  const jd = input.jd.trim() || '（未提供岗位描述）'
  const digest =
    input.originalDigest.trim() ||
    '（未能从文件中提取文本，请上传可解析的 PDF / DOCX）'

  const gaps = buildGaps(jd)
  const interviews = buildInterviews(jd)
  const revisedMarkdown = buildRevisedMarkdown(jd, digest)

  const headline =
    jd.length < 40
      ? '建议补充更完整的岗位描述，以便匹配度与面试预测更贴近真实筛选逻辑。'
      : '整体叙事清晰；优先补齐可量化成果与 JD 关键词在前屏的映射，并准备围绕核心项目展开的深度追问。'

  return {
    headline,
    gaps,
    interviews,
    revisedMarkdown,
    originalDigest: digest,
  }
}
