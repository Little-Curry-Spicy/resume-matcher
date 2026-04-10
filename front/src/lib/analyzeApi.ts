import type { AnalysisResult, GapItem, InterviewItem } from '@/types/analysis'

function extractErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return '请求失败'
  const o = body as Record<string, unknown>
  const m = o.message
  if (Array.isArray(m)) return m.map(String).join(' ')
  if (typeof m === 'string') return m
  if (typeof o.error === 'string') return o.error
  return '请求失败'
}

function isGapSeverity(x: unknown): x is GapItem['severity'] {
  return x === 'high' || x === 'medium' || x === 'low'
}

function parseGapItem(x: unknown, index: number): GapItem {
  if (!x || typeof x !== 'object') throw new Error(`gaps[${index}] 格式错误`)
  const o = x as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : `g${index + 1}`
  const title = typeof o.title === 'string' ? o.title : ''
  const detail = typeof o.detail === 'string' ? o.detail : ''
  if (!title || !detail) throw new Error(`gaps[${index}] 缺少 title/detail`)
  const sev = o.severity
  if (!isGapSeverity(sev)) throw new Error(`gaps[${index}].severity 非法`)
  const jdAnchor =
    typeof o.jdAnchor === 'string' && o.jdAnchor.trim() ? o.jdAnchor : undefined
  return { id, title, detail, severity: sev, jdAnchor }
}

function parseInterviewItem(x: unknown, index: number): InterviewItem {
  if (!x || typeof x !== 'object') throw new Error(`interviews[${index}] 格式错误`)
  const o = x as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : `q${index + 1}`
  const question = typeof o.question === 'string' ? o.question : ''
  const rationale = typeof o.rationale === 'string' ? o.rationale : ''
  if (!question || !rationale) throw new Error(`interviews[${index}] 缺少字段`)
  return { id, question, rationale }
}

function assertAnalysisResult(data: unknown): AnalysisResult {
  if (!data || typeof data !== 'object') throw new Error('响应不是 JSON 对象')
  const o = data as Record<string, unknown>
  const headline = typeof o.headline === 'string' ? o.headline.trim() : ''
  const revisedMarkdown =
    typeof o.revisedMarkdown === 'string' ? o.revisedMarkdown : ''
  const originalDigest =
    typeof o.originalDigest === 'string' ? o.originalDigest : ''
  if (!headline) throw new Error('缺少 headline')
  if (!revisedMarkdown) throw new Error('缺少 revisedMarkdown')
  if (!Array.isArray(o.gaps)) throw new Error('缺少 gaps 数组')
  if (!Array.isArray(o.interviews)) throw new Error('缺少 interviews 数组')
  const gaps = o.gaps.map((g, i) => parseGapItem(g, i))
  const interviews = o.interviews.map((q, i) => parseInterviewItem(q, i))
  return {
    headline,
    gaps,
    interviews,
    revisedMarkdown,
    originalDigest: originalDigest || '（服务端未返回摘要）',
  }
}

/**
 * 调用 Nest 后端 `POST /resume/analyze`（multipart）。
 */
export async function analyzeResumeViaApi(input: {
  baseUrl: string
  apiKey?: string
  file: File
  jobDescription: string
}): Promise<AnalysisResult> {
  const root = input.baseUrl.replace(/\/+$/, '')
  const url = `${root}/resume/analyze`
  const fd = new FormData()
  fd.append('resume', input.file)
  fd.append('jobDescription', input.jobDescription)

  const headers: Record<string, string> = {}
  const key = input.apiKey?.trim()
  if (key) headers['x-api-key'] = key

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', body: fd, headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`无法连接分析服务（${url}）：${msg}`)
  }

  const ct = res.headers.get('content-type') ?? ''
  let body: unknown
  const rawText = await res.text()
  if (ct.includes('application/json')) {
    try {
      body = rawText ? (JSON.parse(rawText) as unknown) : null
    } catch {
      throw new Error(`接口返回非 JSON（HTTP ${res.status}）`)
    }
  } else {
    if (!res.ok) {
      throw new Error(
        rawText.trim().slice(0, 280) || `HTTP ${res.status} ${res.statusText}`,
      )
    }
    throw new Error('期望 JSON 响应')
  }

  if (!res.ok) {
    throw new Error(extractErrorMessage(body) || `HTTP ${res.status}`)
  }

  return assertAnalysisResult(body)
}

function assertPolishResult(data: unknown): {
  revisedMarkdown: string
  originalDigest: string
} {
  if (!data || typeof data !== 'object') throw new Error('响应不是 JSON 对象')
  const o = data as Record<string, unknown>
  const revisedMarkdown =
    typeof o.revisedMarkdown === 'string' ? o.revisedMarkdown.trim() : ''
  const originalDigest =
    typeof o.originalDigest === 'string' ? o.originalDigest : ''
  if (!revisedMarkdown) throw new Error('缺少 revisedMarkdown')
  return {
    revisedMarkdown,
    originalDigest: originalDigest || '（服务端未返回摘要）',
  }
}

/** `POST /resume/polish`：简历文件 + JD，美化稿向岗位对齐 */
export async function polishResumeViaApi(input: {
  baseUrl: string
  apiKey?: string
  file: File
  jobDescription: string
}): Promise<{ revisedMarkdown: string; originalDigest: string }> {
  const root = input.baseUrl.replace(/\/+$/, '')
  const url = `${root}/resume/polish`
  const fd = new FormData()
  fd.append('resume', input.file)
  fd.append('jobDescription', input.jobDescription)

  const headers: Record<string, string> = {}
  const key = input.apiKey?.trim()
  if (key) headers['x-api-key'] = key

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', body: fd, headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`无法连接润色服务（${url}）：${msg}`)
  }

  const ct = res.headers.get('content-type') ?? ''
  let body: unknown
  const rawText = await res.text()
  if (ct.includes('application/json')) {
    try {
      body = rawText ? (JSON.parse(rawText) as unknown) : null
    } catch {
      throw new Error(`接口返回非 JSON（HTTP ${res.status}）`)
    }
  } else {
    if (!res.ok) {
      throw new Error(
        rawText.trim().slice(0, 280) || `HTTP ${res.status} ${res.statusText}`,
      )
    }
    throw new Error('期望 JSON 响应')
  }

  if (!res.ok) {
    throw new Error(extractErrorMessage(body) || `HTTP ${res.status}`)
  }

  return assertPolishResult(body)
}
