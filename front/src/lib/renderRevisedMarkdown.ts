import DOMPurify from 'dompurify'
import { marked } from 'marked'

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * 将 `++内容++` 转为带 class 的 `<ins>`，供 marked 前后混排（页面 CSS 为绿底高亮）。
 * `~~内容~~` 使用 GFM 删除线，marked 会输出 `<del>`（页面 CSS 为红底删除线）。
 */
export function preprocessDiffMarkers(md: string): string {
  return md.replace(/\+\+([\s\S]+?)\+\+/g, (_, inner: string) => {
    return `<ins class="resume-diff-add">${escapeHtml(inner)}</ins>`
  })
}

const PURIFY_CONFIG = {
  ADD_TAGS: ['ins', 'del', 's'] as string[],
  ADD_ATTR: ['class'] as string[],
}

/** 渲染改写稿 Markdown（含差异标记）为可安全插入页面的 HTML */
export async function renderRevisedMarkdownToHtml(md: string): Promise<string> {
  const pre = preprocessDiffMarkers(md)
  const raw = await marked.parse(pre, { gfm: true, breaks: true })
  return String(DOMPurify.sanitize(raw, PURIFY_CONFIG))
}

/**
 * 普通 Markdown → 安全 HTML（JD 正文、说明文档等，不含 ++ 差异语法）。
 * 使用 GFM + DOMPurify 默认规则，避免 XSS。
 */
export async function renderSafeMarkdownToHtml(md: string): Promise<string> {
  const t = md.trim()
  if (!t) return ''
  const raw = await marked.parse(t, { gfm: true, breaks: true })
  return String(DOMPurify.sanitize(raw))
}
