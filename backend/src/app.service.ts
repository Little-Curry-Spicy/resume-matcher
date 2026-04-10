import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'resume-matcher API — POST /resume/analyze';
  }
}
