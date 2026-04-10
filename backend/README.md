# resume-matcher-backend

简历与岗位对齐的 NestJS API：接收 **PDF/DOCX + JD 文本**，抽取正文后调用 **OpenAI Chat Completions**（`response_format: json_object`），返回与前端 `AnalysisResult` 对齐的结构化 JSON。

已从其他项目剥离：**Qdrant、知识库入库、Clerk、LangChain Agent、邮件** 等与简历匹配无关的代码与依赖。

## 环境变量

见仓库内 [`.env.example`](./.env.example)。

大模型默认按示例配置为 **阿里云通义千问**（`OPENAI_BASE_URL` 指向 DashScope **兼容 OpenAI** 的 `.../compatible-mode/v1`，`OPENAI_MODEL` 填如 `qwen-plus`）。亦支持任意其它 OpenAI 兼容服务，只需改密钥、Base URL 与模型名。

## 运行

```bash
pnpm install
pnpm run start:dev
```

默认端口 `3001`（可用 `PORT` 覆盖）。

## 接口

### `POST /resume/analyze`

`multipart/form-data`：

| 字段 | 说明 |
|------|------|
| `resume` | 文件，仅 `.pdf` / `.docx`，最大约 8MB |
| `jobDescription` | 岗位描述纯文本 |

成功时响应 JSON 字段：`headline`, `gaps[]`, `interviews[]`, `revisedMarkdown`, `originalDigest`（服务端从简历抽取的摘要）。

若配置了 `RESUME_MATCHER_API_KEY`，请求需带：`x-api-key: <密钥>`。

### `POST /resume/polish`

`multipart/form-data`：

| 字段 | 说明 |
|------|------|
| `resume` | 文件，仅 `.pdf` / `.docx`，最大约 8MB |
| `jobDescription` | 岗位描述纯文本（**必填**，与 `analyze` 一致） |

返回 **`revisedMarkdown`** 与 **`originalDigest`**；润色会**结合 JD** 调整摘要、章节与关键词侧重（不编造经历）。模型可按需在稿内使用与 `analyze` 相同的 **`~~` / `++`** 标记标出关键删改（前端为**红删绿增**高亮）。模型配置与 `analyze` 相同。

### `GET /`

健康提示字符串。

## 与前端联调

前端将 `runMockAnalysis` 换为对该接口的 `fetch`/`axios` 即可；CORS 已在 `main.ts` 对浏览器放开（生产环境建议改为白名单域名）。
