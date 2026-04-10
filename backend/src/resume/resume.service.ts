import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import {
  analysisResultSchema,
  type AnalysisResultResponse,
} from './analysis-result.schema';
import { normalizeAnalysisPayload } from './normalize-analysis-payload';
import { polishResultSchema } from './polish-result.schema';

const MAX_RESUME_CHARS = 18_000;
const MAX_JD_CHARS = 14_000;

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  constructor(private readonly config: ConfigService) {}

  async analyze(
    buffer: Buffer,
    originalname: string,
    jobDescription: string,
  ): Promise<AnalysisResultResponse> {
    const jd = jobDescription.trim();
    if (!jd) {
      throw new BadRequestException('jobDescription 不能为空');
    }
    const jdClipped = jd.length > MAX_JD_CHARS ? jd.slice(0, MAX_JD_CHARS) : jd;

    const resumeText = await this.extractPlainText(buffer, originalname);
    const compact = resumeText.replace(/\s+/g, ' ').trim();
    if (compact.length < 40) {
      throw new BadRequestException(
        '从简历中抽取的正文过少，可能是扫描件/图片型 PDF。请提供可选中文字的 PDF 或 DOCX。',
      );
    }
    const digest =
      resumeText.length > 2_800
        ? `${resumeText.slice(0, 2_800)}…`
        : resumeText;
    const resumeClipped =
      resumeText.length > MAX_RESUME_CHARS
        ? resumeText.slice(0, MAX_RESUME_CHARS)
        : resumeText;

    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException('服务端未配置 OPENAI_API_KEY');
    }

    const model =
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      this.config.get<string>('MODEL_NAME')?.trim() ||
      'gpt-4o-mini';
    const baseURL = this.config.get<string>('OPENAI_BASE_URL')?.trim();

    const client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });

    const system = `你是资深招聘顾问与简历教练。根据「简历全文」与「岗位描述 JD」只输出一个 JSON 对象（不要 markdown 代码围栏，不要注释）。

必须包含且仅使用下列英文字段名（值用中文为主）：
- "headline": string，一句总结
- "gaps": array，3～6 个对象，每个对象必须含：
  "id"（如 "g1"）、"title"（短标题）、"detail"（具体说明）、"severity"（只能是 "high"|"medium"|"low"）、可选 "jdAnchor"（JD 原文短句）
- "interviews": array，4～6 个对象，每个必须含：
  "id"（如 "q1"）、"question"（面试问题）、"rationale"（为何会问）
- "revisedMarkdown": string，改写后的简历 Markdown；勿编造经历，可量化处沿用用户原文数字或占位。
  为便于候选人看出删改，请在正文里混用以下标记（与 GitHub Markdown 一致，本站预览为红删绿增）：
  - 拟删除或替换掉的旧表述：用双波浪线包裹，如 ~~旧公司名 / 旧职责~~（预览：红底 + 删除线）
  - 新增或强调补充的表述：用双加号包裹，如 ++新成果 / 新技能++（预览：绿底高亮）
  在关键改动处至少使用数处上述标记，其余段落可正常 Markdown。

禁止输出 JSON 以外的文字。`;

    const user = `【岗位描述 JD】\n${jdClipped}\n\n【简历全文】\n${resumeClipped}`;

    let content: string;
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      content = completion.choices[0]?.message?.content ?? '';
    } catch (e) {
      this.logger.warn(`OpenAI 调用失败: ${(e as Error).message}`);
      throw new InternalServerErrorException(
        '模型调用失败，请稍后重试或检查 OPENAI_API_KEY / 网络',
      );
    }

    if (!content) {
      throw new InternalServerErrorException('模型返回为空');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      throw new InternalServerErrorException('模型返回非合法 JSON');
    }

    const normalized = normalizeAnalysisPayload(parsed);
    const validated = analysisResultSchema.safeParse(normalized);
    if (!validated.success) {
      this.logger.warn(
        `JSON 校验失败: ${validated.error.message} | 原始片段: ${content.slice(0, 400)}`,
      );
      throw new InternalServerErrorException('模型输出结构不符合约定');
    }

    return {
      ...validated.data,
      originalDigest: digest,
    };
  }

  /** 结合 JD 润色简历为 Markdown（措辞与结构向岗位对齐，不编造经历） */
  async polish(
    buffer: Buffer,
    originalname: string,
    jobDescription: string,
  ): Promise<{ revisedMarkdown: string; originalDigest: string }> {
    const jd = jobDescription.trim();
    if (!jd) {
      throw new BadRequestException('jobDescription 不能为空');
    }
    const jdClipped = jd.length > MAX_JD_CHARS ? jd.slice(0, MAX_JD_CHARS) : jd;

    const resumeText = await this.extractPlainText(buffer, originalname);
    const compact = resumeText.replace(/\s+/g, ' ').trim();
    if (compact.length < 40) {
      throw new BadRequestException(
        '从简历中抽取的正文过少，可能是扫描件/图片型 PDF。请提供可选中文字的 PDF 或 DOCX。',
      );
    }
    const digest =
      resumeText.length > 2_800
        ? `${resumeText.slice(0, 2_800)}…`
        : resumeText;
    const resumeClipped =
      resumeText.length > MAX_RESUME_CHARS
        ? resumeText.slice(0, MAX_RESUME_CHARS)
        : resumeText;

    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException('服务端未配置 OPENAI_API_KEY');
    }

    const model =
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      this.config.get<string>('MODEL_NAME')?.trim() ||
      'gpt-4o-mini';
    const baseURL = this.config.get<string>('OPENAI_BASE_URL')?.trim();

    const client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });

    const system = `你是专业简历编辑与招聘顾问。用户会提供「岗位描述 JD」与「简历全文」。请输出一个 JSON 对象（不要 markdown 代码围栏，不要注释），仅含字段：
- "revisedMarkdown": string，将简历整理为结构清晰的中文 Markdown（可加适度英文技术词）。要求：
  - 紧扣 JD：Summary 与章节顺序、要点排序应突出与 JD 匹配的能力与关键词；可合理重排、合并同类要点，但不要虚构任何经历、公司、职级、时间或量化结果。
  - 不编造经历、公司、时间线、数字；仅基于原文做措辞强化、层级与排版优化。
  - 使用 # / ## / ### 组织章节（如 Summary、Experience、Education、Skills）；JD 强调的技能若原文已有，放在 Skills 靠前位置。
  - 列表用 - 要点，动词有力、避免空洞形容词堆砌。
  - 若希望标出相对原文的关键措辞调整，可选用与「匹配分析」相同的差异标记（不要滥用）：
    - ~~拟删或替换前的旧表述~~（预览：红底 + 删除线）
    - ++补充或替换后的新表述++（预览：绿底高亮）
 无删改对比需求时可全程不用上述标记，输出干净终稿即可。

禁止输出 JSON 以外的文字。`;

    const user = `【岗位描述 JD】\n${jdClipped}\n\n【简历全文】\n${resumeClipped}`;

    let content: string;
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.25,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      content = completion.choices[0]?.message?.content ?? '';
    } catch (e) {
      this.logger.warn(`OpenAI 润色调用失败: ${(e as Error).message}`);
      throw new InternalServerErrorException(
        '模型调用失败，请稍后重试或检查 OPENAI_API_KEY / 网络',
      );
    }

    if (!content) {
      throw new InternalServerErrorException('模型返回为空');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      throw new InternalServerErrorException('模型返回非合法 JSON');
    }

    const validated = polishResultSchema.safeParse(parsed);
    if (!validated.success) {
      this.logger.warn(
        `润色 JSON 校验失败: ${validated.error.message} | 片段: ${content.slice(0, 400)}`,
      );
      throw new InternalServerErrorException('模型输出结构不符合约定');
    }

    return {
      revisedMarkdown: validated.data.revisedMarkdown.trim(),
      originalDigest: digest,
    };
  }

  private async extractPlainText(buffer: Buffer, name: string): Promise<string> {
    const lower = name.toLowerCase();
    if (lower.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      return value ?? '';
    }
    if (lower.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      return data.text ?? '';
    }
    throw new BadRequestException('仅支持 .pdf 或 .docx 简历文件');
  }
}
