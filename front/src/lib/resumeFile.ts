import mammoth from 'mammoth'
import type { ResumeFileKind } from '@/types/analysis'

export interface ParsedResumeFile {
  kind: ResumeFileKind
  /** DOCX 转 HTML，用于内嵌预览 */
  docxHtml?: string
  /** PDF 使用 blob URL 在 iframe 中预览 */
  pdfObjectUrl?: string
  /** 纯文本摘要，供分析与导出引用 */
  plainText: string
}

function readPlainTextFromHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export async function parseResumeFile(file: File): Promise<ParsedResumeFile> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) {
    const pdfObjectUrl = URL.createObjectURL(file)
    return {
      kind: 'pdf',
      pdfObjectUrl,
      plainText: `（PDF：${file.name} — 文本解析将在接入解析服务后提供，此处为占位摘要。）`,
    }
  }

  if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer()
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
    const plain = readPlainTextFromHtml(html)
    return {
      kind: 'docx',
      docxHtml: html,
      plainText: plain || `（DOCX：${file.name} — 未能提取可见文本）`,
    }
  }

  throw new Error('仅支持 PDF 或 DOCX（.pdf / .docx）')
}

export function revokeResumePreview(parsed: ParsedResumeFile | null) {
  if (parsed?.pdfObjectUrl) URL.revokeObjectURL(parsed.pdfObjectUrl)
}
