export type GapSeverity = 'high' | 'medium' | 'low'

export interface GapItem {
  id: string
  title: string
  detail: string
  severity: GapSeverity
  /** 与 JD 中可能对应的要求片段，便于对照 */
  jdAnchor?: string
}

export interface InterviewItem {
  id: string
  question: string
  rationale: string
}

export interface AnalysisResult {
  /** 一句话结论（模拟或后端模型） */
  headline: string
  gaps: GapItem[]
  interviews: InterviewItem[]
  /** 改写后的简历正文（Markdown），后续可接真实模型输出 */
  revisedMarkdown: string
  /** 从原始简历抽取的短摘要，用于对比卡片 */
  originalDigest: string
}

export type ResumeFileKind = 'pdf' | 'docx'
