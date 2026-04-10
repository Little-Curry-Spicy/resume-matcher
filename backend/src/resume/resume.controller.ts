import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { ResumeService } from './resume.service';

const MAX_BYTES = 8 * 1024 * 1024;

@Controller('resume')
export class ResumeController {
  constructor(private readonly resume: ResumeService) {}

  /**
   * multipart/form-data:
   * - 字段名 `resume`：PDF 或 DOCX 文件
   * - 字段名 `jobDescription`：岗位描述纯文本
   */
  @Post('analyze')
  @UseInterceptors(
    FileInterceptor('resume', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async analyze(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('jobDescription') jobDescription: string | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请使用字段名 resume 上传 PDF 或 DOCX');
    }
    const jd =
      typeof jobDescription === 'string'
        ? jobDescription
        : String(jobDescription ?? '');
    return this.resume.analyze(file.buffer, file.originalname ?? 'resume', jd);
  }

  /**
   * multipart/form-data：
   * - `resume`：PDF 或 DOCX
   * - `jobDescription`：岗位描述（与 analyze 一致，AI 美化需结合 JD）
   */
  @Post('polish')
  @UseInterceptors(
    FileInterceptor('resume', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async polish(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('jobDescription') jobDescription: string | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请使用字段名 resume 上传 PDF 或 DOCX');
    }
    const jd =
      typeof jobDescription === 'string'
        ? jobDescription
        : String(jobDescription ?? '');
    return this.resume.polish(file.buffer, file.originalname ?? 'resume', jd);
  }
}
