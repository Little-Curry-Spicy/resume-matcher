import { z } from 'zod';

export const polishResultSchema = z.object({
  revisedMarkdown: z.string().min(1),
});

export type PolishResultDto = z.infer<typeof polishResultSchema>;
