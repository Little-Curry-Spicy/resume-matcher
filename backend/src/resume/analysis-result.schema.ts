import { z } from 'zod';

export const gapSeveritySchema = z.enum(['high', 'medium', 'low']);

export const analysisResultSchema = z.object({
  headline: z.string(),
  gaps: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      detail: z.string(),
      severity: gapSeveritySchema,
      jdAnchor: z.string().optional(),
    }),
  ),
  interviews: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      rationale: z.string(),
    }),
  ),
  revisedMarkdown: z.string(),
});

export type AnalysisResultDto = z.infer<typeof analysisResultSchema>;

/** 与前端 `AnalysisResult` 对齐（含服务端填写的 digest） */
export type AnalysisResultResponse = AnalysisResultDto & {
  originalDigest: string;
};
