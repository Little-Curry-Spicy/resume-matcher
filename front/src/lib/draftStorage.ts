import { del, get, set } from 'idb-keyval'
import type { AnalysisResult } from '@/types/analysis'

const FILE_KEY = 'resume-match:v1:resume-file'
const MAX_FILE_BYTES = 3 * 1024 * 1024

export interface StoredResumeFile {
  name: string
  mime: string
  buffer: ArrayBuffer
}

export async function saveResumeDraft(file: File): Promise<'ok' | 'too-large' | 'error'> {
  try {
    if (file.size > MAX_FILE_BYTES) return 'too-large'
    const buffer = await file.arrayBuffer()
    const payload: StoredResumeFile = {
      name: file.name,
      mime: file.type || guessMime(file.name),
      buffer,
    }
    await set(FILE_KEY, payload)
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function loadResumeDraft(): Promise<File | null> {
  try {
    const payload = (await get(FILE_KEY)) as StoredResumeFile | undefined
    if (!payload?.buffer || !payload.name) return null
    const mime = payload.mime || guessMime(payload.name)
    return new File([payload.buffer], payload.name, { type: mime })
  } catch {
    return null
  }
}

export async function clearResumeDraft(): Promise<void> {
  try {
    await del(FILE_KEY)
  } catch {
    /* ignore */
  }
}

function guessMime(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  return 'application/octet-stream'
}

/** localStorage：上次分析 JSON（体积需可控，异常时吞掉） */
const LS_ANALYSIS = 'resume-match:v1:last-analysis'

export function readStoredAnalysis(): AnalysisResult | null {
  try {
    const raw = localStorage.getItem(LS_ANALYSIS)
    if (!raw) return null
    return JSON.parse(raw) as AnalysisResult
  } catch {
    return null
  }
}

export function writeStoredAnalysis(value: AnalysisResult | null) {
  try {
    if (value == null) {
      localStorage.removeItem(LS_ANALYSIS)
      return
    }
    localStorage.setItem(LS_ANALYSIS, JSON.stringify(value))
  } catch {
    /* 配额不足等：静默失败，避免打断主流程 */
  }
}
