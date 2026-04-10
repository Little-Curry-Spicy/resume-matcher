# Resume Match（简历与岗位对齐）

面向「上传简历 + **粘贴 JD** → 获得差距分析 / 面试预测 / **修订对照（红删绿增）**」的前端演示应用；并支持**一键重置会话**。视觉参考仓库内的 `resume/design`（暖色稿纸 + 陶土色强调 + 衬线标题层级）。

## 技术栈

- Vue 3 + Vite + TypeScript
- Tailwind CSS v4 + shadcn-vue（Reka UI）
- **mammoth**：在浏览器内将 `.docx` 转为 HTML 预览
- **marked + DOMPurify**：将改写稿 Markdown 安全渲染为 HTML（见下文「修订对照」语法）
- **idb-keyval**：将小于约 3MB 的简历文件写入 IndexedDB，便于下次打开恢复
- **@vueuse/core `useStorage`**：JD 与上次分析结果写入 `localStorage`（免登录 C 端单页）

## 本地运行

在 **`resume-matcher/front`** 目录：

```bash
pnpm install
pnpm dev
```

复制 [`.env.example`](./.env.example) 为 `.env`，设置 **`VITE_API_BASE_URL`**（例如 `http://localhost:3001`）即可调用后端 **`POST /resume/analyze`** 与 **`POST /resume/polish`**（界面「AI美化」）；不配则分析由 `mockAnalysis`、润色由 `runMockPolish` 演示。

若后端启用了 **`RESUME_MATCHER_API_KEY`**，在 `.env` 中设置 **`VITE_API_KEY`** 为相同值。

## 与后端联调

1. 终端 A：`cd resume-matcher/backend && pnpm run start:dev`（默认 `3001`）
2. 终端 B：`cd resume-matcher/front && pnpm dev`
3. `front/.env` 中 `VITE_API_BASE_URL=http://localhost:3001`

浏览器需能访问该地址（注意 HTTPS 页面不能请求明文 HTTP，开发时用 `http://localhost:5173` 即可）。

生产构建：

```bash
pnpm build
pnpm preview
```

## 修订对照（改写稿差异高亮）

后端返回的 `revisedMarkdown` 中，模型可按约定使用：

- **`~~删除或替换前的表述~~`**：GFM 删除线，预览区为**红底 + 中划线**。
- **`++新增或强调补充++`**：非标准 Markdown，前端会先转为 `<ins>` 再净化，样式为**绿底高亮**。

渲染逻辑在 `src/lib/renderRevisedMarkdown.ts`。

## C 端单页：草稿

- JD、上次分析与（限额内）简历会缓存在本机，下次打开自动恢复。
- 「重置会话」可清空当前 JD / 上传 / 分析区；可选是否**保留** IndexedDB 中的简历文件草稿（取消勾选时会同时清除上次分析在 localStorage 中的缓存）。

## 当前能力边界（重要）

- **AI 匹配、差距与面试题**：未配置 `VITE_API_BASE_URL` 时由 `mockAnalysis` 模拟；配置后走 `POST /resume/analyze`。
- **AI美化**：需已填写 **JD**，请求与 `analyze` 一样携带 `jobDescription`，润色稿向岗位对齐；模型可选用 `~~` / `++` 标出关键措辞调整（与上文「修订标记」一致）。有匹配结果时保留差距/面试，只更新「美化简历」预览稿。
- **PDF 文本抽取**：当前仅提供 iframe 预览；正文解析需后续接入服务（或 pdf.js 工作线程方案）。
- **DOCX**：依赖 mammoth，复杂排版可能与 Word 不完全一致。

## 目录说明

| 路径 | 说明 |
|------|------|
| `src/App.vue` | 主界面：上传、JD、结果 Tabs、修订预览 |
| `src/lib/resumeFile.ts` | 文件解析与 PDF 对象 URL 生命周期 |
| `src/lib/analyzeApi.ts` | `analyze` / `polish` 的 HTTP 封装 |
| `src/lib/mockAnalysis.ts` | 模拟分析与模拟 AI 润色 |
| `src/lib/draftStorage.ts` | 本机草稿：IndexedDB 简历 + localStorage 分析 |
| `src/lib/renderRevisedMarkdown.ts` | 改写稿 Markdown → 安全 HTML（差异标记） |
| `src/types/analysis.ts` | 与后端对齐时可复用的结果类型 |

## 后续接入建议

1. 上传走预签名直传对象存储，后端异步解析 PDF/DOCX 为纯文本与结构化字段。
2. 模型输出对齐 `AnalysisResult` 字段；若需离线下载可再接入导出（HTML / DOCX 等）。
