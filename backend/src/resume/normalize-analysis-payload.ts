/**
 * 模型常返回与约定不一致的键名（或漏掉 id）。在 Zod 校验前归一成约定结构。
 */
export function normalizeAnalysisPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;

  const o = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const normSeverity = (
    v: unknown,
  ): 'high' | 'medium' | 'low' => {
    const x = s(v).toLowerCase();
    if (x === 'high' || x === 'medium' || x === 'low') return x;
    const zh = s(v);
    if (/高|严重|critical/i.test(zh)) return 'high';
    if (/低|轻微/i.test(zh)) return 'low';
    return 'medium';
  };

  const gapsIn = o.gaps;
  const gaps = Array.isArray(gapsIn)
    ? gapsIn.map((item, i) => {
        const g =
          item && typeof item === 'object'
            ? (item as Record<string, unknown>)
            : {};
        const title =
          s(g.title) ||
          s(g.name) ||
          s(g.heading) ||
          s(g.topic) ||
          s(g.gap) ||
          s(g.issue) ||
          `差距项 ${i + 1}`;
        let detail =
          s(g.detail) ||
          s(g.description) ||
          s(g.desc) ||
          s(g.content) ||
          s(g.explanation) ||
          s(g.analysis) ||
          s(g.suggestion) ||
          '';
        if (!detail) detail = title;
        const id = s(g.id) || s(g.gap_id) || `g${i + 1}`;
        const severity = normSeverity(g.severity ?? g.level ?? g.priority);
        const jdAnchorRaw =
          s(g.jdAnchor) || s(g.jd_anchor) || s(g.anchor) || s(g.jd_quote);
        return {
          id,
          title,
          detail,
          severity,
          ...(jdAnchorRaw ? { jdAnchor: jdAnchorRaw } : {}),
        };
      })
    : [];

  const interviewsIn = o.interviews;
  const interviews = Array.isArray(interviewsIn)
    ? interviewsIn.map((item, i) => {
        const q =
          item && typeof item === 'object'
            ? (item as Record<string, unknown>)
            : {};
        const question =
          s(q.question) ||
          s(q.q) ||
          s(q.prompt) ||
          s(q.text) ||
          `面试题 ${i + 1}`;
        let rationale =
          s(q.rationale) ||
          s(q.reason) ||
          s(q.why) ||
          s(q.explanation) ||
          s(q.context) ||
          s(q.note) ||
          '';
        if (!rationale) rationale = '与岗位职责及简历经历相关。';
        const id = s(q.id) || s(q.question_id) || `q${i + 1}`;
        return { id, question, rationale };
      })
    : [];

  const headline =
    s(o.headline) ||
    s(o.summary) ||
    s(o.overview) ||
    '请结合下方差距项优化简历与面试准备。';

  let revisedMarkdown =
    s(o.revisedMarkdown) ||
    s(o.resumeMarkdown) ||
    s(o.markdown) ||
    s(o.resume_markdown) ||
    s(o.tailored_resume) ||
    '';
  if (!revisedMarkdown) {
    revisedMarkdown =
      '# 改写稿\n\n（模型未返回 revisedMarkdown 字段，请重试或更换模型。）';
  }

  return {
    headline,
    gaps,
    interviews,
    revisedMarkdown,
  };
}
