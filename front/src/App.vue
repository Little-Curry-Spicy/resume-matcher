<script setup lang="ts">
import { useStorage, watchDebounced } from '@vueuse/core'
import {
  AlertCircle,
  FileText,
  Info,
  Loader2,
  RotateCcw,
  Sparkles,
  UploadCloud,
  Wand2,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  clearResumeDraft,
  loadResumeDraft,
  readStoredAnalysis,
  saveResumeDraft,
  writeStoredAnalysis,
} from '@/lib/draftStorage'
import { analyzeResumeViaApi, polishResumeViaApi } from '@/lib/analyzeApi'
import {
  renderRevisedMarkdownToHtml,
  renderSafeMarkdownToHtml,
} from '@/lib/renderRevisedMarkdown'
import { runMockAnalysis, runMockPolish } from '@/lib/mockAnalysis'
import {
  parseResumeFile,
  revokeResumePreview,
  type ParsedResumeFile,
} from '@/lib/resumeFile'
import type { AnalysisResult, GapSeverity } from '@/types/analysis'

/** JD 与上次分析仅存本机，免登录 */
const jd = useStorage('resume-match:v1:jd', '')
/** JD 正文：编辑源码 vs Markdown 渲染预览 */
const jdBodyView = useStorage<'edit' | 'preview'>(
  'resume-match:v1:jd-body-view',
  'edit',
)
const jdHtml = ref('')
const file = ref<File | null>(null)
const parsed = ref<ParsedResumeFile | null>(null)
const parseError = ref<string | null>(null)
const docxWeakWarning = ref<string | null>(null)
const draftHint = ref<string | null>(null)
const showDraftRestoredTip = ref(false)
const analyzing = ref(false)
const progress = ref(12)
const result = ref<AnalysisResult | null>(null)
const revisedHtml = ref('')
const dragActive = ref(false)
const beautifying = ref(false)

/** 重置会话：是否保留 IndexedDB 简历草稿（默认保留） */
const keepLocalDraftOnReset = ref(true)
const resetDialogOpen = ref(false)

const fileLabel = computed(() => file.value?.name ?? '尚未选择文件')
const jdLooksThin = computed(
  () => jd.value.trim().length > 0 && jd.value.trim().length < 90,
)

/** 配置了 `VITE_API_BASE_URL` 时走 Nest 后端，否则本地模拟 */
const apiBaseUrl = computed(
  () => import.meta.env.VITE_API_BASE_URL?.trim() ?? '',
)
const apiKey = computed(() => import.meta.env.VITE_API_KEY?.trim() ?? '')
const useLiveApi = computed(() => apiBaseUrl.value.length > 0)

watch(
  () => result.value?.revisedMarkdown,
  async (md) => {
    if (!md) {
      revisedHtml.value = ''
      return
    }
    revisedHtml.value = await renderRevisedMarkdownToHtml(md)
  },
  { immediate: true },
)

watchDebounced(
  jd,
  async (text) => {
    jdHtml.value = await renderSafeMarkdownToHtml(text)
  },
  { debounce: 320, maxWait: 2000, immediate: true },
)

watch(jdBodyView, async (v) => {
  if (v === 'preview') {
    jdHtml.value = await renderSafeMarkdownToHtml(jd.value)
  }
})

watch(
  result,
  (v) => {
    writeStoredAnalysis(v)
  },
  { deep: true },
)

let progressTimer: ReturnType<typeof setInterval> | null = null

function startProgress() {
  progress.value = 8
  progressTimer = setInterval(() => {
    progress.value = Math.min(94, progress.value + Math.random() * 9)
  }, 220)
}

function stopProgress() {
  if (progressTimer) clearInterval(progressTimer)
  progressTimer = null
  progress.value = 100
  setTimeout(() => {
    progress.value = 0
  }, 400)
}

function describeFileError(e: unknown, name: string): string {
  const msg = e instanceof Error ? e.message : ''
  if (msg.includes('仅支持')) {
    return `${msg} 当前文件：「${name}」。`
  }
  return msg || `无法读取「${name}」。若文件已加密或损坏，请换一份导出稿再试。`
}

async function applyParsedFile(
  f: File,
  options: { clearAnalysis: boolean },
) {
  parseError.value = null
  docxWeakWarning.value = null
  draftHint.value = null
  if (options.clearAnalysis) {
    result.value = null
    writeStoredAnalysis(null)
  }
  revokeResumePreview(parsed.value)
  parsed.value = null
  file.value = f
  try {
    parsed.value = await parseResumeFile(f)
    const plain = parsed.value.plainText.replace(/\s/g, '')
    if (parsed.value.kind === 'docx' && plain.length < 40) {
      docxWeakWarning.value =
        '从该 Word 中读到的正文很少，常见于扫描件、图片型简历或复杂排版。可尝试导出为可选中文字的 PDF，或「另存为」简化版 DOCX。'
    }
    const draftSave = await saveResumeDraft(f)
    if (draftSave === 'too-large') {
      draftHint.value =
        '文件超过约 3MB，未写入本机草稿；关闭页面后需重新上传。本次会话仍可正常使用。'
    } else if (draftSave === 'error') {
      draftHint.value =
        '未能写入本机草稿（可能为无痕模式或存储已满），不影响本次编辑与分析。'
    }
  } catch (e) {
    file.value = null
    parsed.value = null
    parseError.value = describeFileError(e, f.name)
    await clearResumeDraft()
  }
}

async function onPickFile(f: File | null | undefined) {
  if (!f) return
  await applyParsedFile(f, { clearAnalysis: true })
}

function onInputChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0]
  void onPickFile(f)
  input.value = ''
}

async function onDrop(ev: DragEvent) {
  dragActive.value = false
  const f = ev.dataTransfer?.files?.[0]
  await onPickFile(f)
}

function severityVariant(s: GapSeverity) {
  if (s === 'high') return 'destructive' as const
  if (s === 'medium') return 'warning' as const
  return 'success' as const
}

function severityLabel(s: GapSeverity) {
  if (s === 'high') return '高优先级'
  if (s === 'medium') return '中优先级'
  return '低优先级'
}

async function analyze() {
  if (!file.value || !parsed.value) {
    parseError.value =
      '还没有可用的简历文件。请上传 PDF 或 DOCX；若刚从其他页面返回，可等待草稿恢复或重新选择文件。'
    return
  }
  if (!jd.value.trim()) {
    parseError.value =
      '岗位描述（JD）为空。请粘贴完整招聘文案后再运行分析。'
    return
  }
  const plain = parsed.value.plainText.replace(/\s/g, '')
  if (parsed.value.kind === 'docx' && plain.length < 25) {
    parseError.value =
      '当前简历几乎抽不到正文，无法可靠对齐 JD。请检查是否为扫描版/图片简历，或改用文本型 PDF 后再分析。'
    return
  }
  parseError.value = null
  analyzing.value = true
  result.value = null
  startProgress()
  try {
    if (useLiveApi.value && file.value) {
      result.value = await analyzeResumeViaApi({
        baseUrl: apiBaseUrl.value,
        apiKey: apiKey.value || undefined,
        file: file.value,
        jobDescription: jd.value.trim(),
      })
    } else {
      result.value = await runMockAnalysis({
        jd: jd.value,
        originalDigest: parsed.value.plainText,
      })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    parseError.value = msg
      ? `分析未完成：${msg}`
      : '分析未完成：请检查网络或稍后重试。若持续失败，可尝试缩短 JD 或更换简历文件。'
  } finally {
    stopProgress()
    analyzing.value = false
  }
}

/** 结合当前 JD 润色简历 Markdown；有分析结果时保留差距与面试，只更新下方预览稿 */
async function aiBeautifyResume() {
  if (!file.value || !parsed.value) {
    parseError.value =
      '请先上传简历。AI 美化依赖可从文件中抽取的正文。'
    return
  }
  if (!jd.value.trim()) {
    parseError.value =
      '岗位描述（JD）为空。AI 美化需结合 JD 调整结构与关键词，请先粘贴招聘文案。'
    return
  }
  const plain = parsed.value.plainText.replace(/\s/g, '')
  if (plain.length < 25) {
    parseError.value =
      '简历可抽取正文过少，请改用可选中文字的 PDF / DOCX。'
    return
  }
  parseError.value = null
  beautifying.value = true
  try {
    const out =
      useLiveApi.value && file.value
        ? await polishResumeViaApi({
            baseUrl: apiBaseUrl.value,
            apiKey: apiKey.value || undefined,
            file: file.value,
            jobDescription: jd.value.trim(),
          })
        : await runMockPolish({
            plainText: parsed.value.plainText,
            jd: jd.value,
          })
    const digest =
      out.originalDigest ||
      (parsed.value.plainText.length > 2_800
        ? `${parsed.value.plainText.slice(0, 2_800)}…`
        : parsed.value.plainText)
    if (result.value) {
      result.value = {
        ...result.value,
        revisedMarkdown: out.revisedMarkdown,
        originalDigest: digest,
      }
    } else {
      result.value = {
        headline:
          '以下为 AI 简历润色稿，尚未结合岗位 JD 做匹配分析。可点击「运行匹配分析」查看差距与面试预测。',
        gaps: [],
        interviews: [],
        revisedMarkdown: out.revisedMarkdown,
        originalDigest: digest,
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    parseError.value = msg
      ? `AI 美化未完成：${msg}`
      : 'AI 美化未完成：请检查网络或稍后重试。'
  } finally {
    beautifying.value = false
  }
}

async function confirmResetSession() {
  parseError.value = null
  docxWeakWarning.value = null
  draftHint.value = null
  showDraftRestoredTip.value = false
  jd.value = ''
  revokeResumePreview(parsed.value)
  parsed.value = null
  file.value = null
  result.value = null
  writeStoredAnalysis(null)
  if (!keepLocalDraftOnReset.value) {
    await clearResumeDraft()
  }
  resetDialogOpen.value = false
}

function dismissDraftTip() {
  showDraftRestoredTip.value = false
}

onMounted(async () => {
  const restored = readStoredAnalysis()
  if (restored) {
    result.value = restored
  }
  const draftFile = await loadResumeDraft()
  if (draftFile) {
    await applyParsedFile(draftFile, { clearAnalysis: false })
    if (!parsed.value) {
      await clearResumeDraft()
    }
  }
  if (draftFile || restored) {
    showDraftRestoredTip.value = true
  }
})

onBeforeUnmount(() => {
  stopProgress()
  revokeResumePreview(parsed.value)
})
</script>

<template>
  <div class="min-h-svh bg-background text-foreground">
    <header
      class="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md supports-backdrop-filter:bg-background/80"
    >
      <div
        class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10"
      >
        <div class="flex items-center gap-4">
          <div
            class="flex size-10 items-center justify-center rounded-2xl bg-primary text-sm font-medium text-primary-foreground font-serif shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
            aria-hidden="true"
          >
            R
          </div>
          <div>
            <p class="font-serif text-lg font-medium leading-tight tracking-tight sm:text-xl">
              Resume Match
            </p>
            <p class="text-muted-foreground mt-0.5 text-xs leading-relaxed sm:text-sm">
              简历与岗位对齐
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="rounded-xl"
            @click="resetDialogOpen = true"
          >
            <RotateCcw class="size-4" aria-hidden="true" />
            <span class="ml-2">重置会话</span>
          </Button>
        </div>
      </div>
    </header>

    <main
      class="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:space-y-14 sm:px-8 sm:py-14 lg:space-y-16 lg:px-10 lg:py-16"
    >
      <section class="max-w-3xl lg:max-w-160">
        <p
          class="text-primary mb-5 text-[11px] font-medium tracking-[0.22em] uppercase sm:text-xs"
        >
          AI-assisted tailoring
        </p>
        <h1
          class="font-serif text-foreground text-[clamp(1.85rem,4vw,2.85rem)] font-medium leading-[1.1] tracking-tight sm:leading-[1.08]"
        >
          让简历
          <span class="text-primary">对齐</span>
          岗位叙事，而不是堆砌关键词。
        </h1>
        <p
          class="text-muted-foreground mt-6 max-w-2xl text-[15px] leading-[1.65] sm:mt-8 sm:text-[1.0625rem] sm:leading-[1.7]"
        >
          上传 PDF / DOCX，粘贴岗位描述（JD），一键查看差距分析、面试题方向与美化简历稿。
        </p>
      </section>

      <section v-if="showDraftRestoredTip" class="mb-2">
        <Alert
          class="border-border/80 bg-card/95 rounded-3xl px-6 py-5 shadow-[0_0_0_1px_rgba(240,238,230,0.85)] sm:px-9 sm:py-6"
        >
          <Info class="text-primary size-4 shrink-0" />
          <AlertTitle class="font-serif text-base">已恢复本机草稿</AlertTitle>
          <AlertDescription
            class="text-muted-foreground flex flex-col gap-3 text-sm leading-relaxed sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              已尝试载入上次保存的 JD、简历文件（若在大小限额内）与分析结果。若你已更新内容，请重新运行匹配分析。
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              class="shrink-0 rounded-lg"
              @click="dismissDraftTip"
            >
              知道了
            </Button>
          </AlertDescription>
        </Alert>
      </section>

      <!-- 输入：单卡内宽屏双栏，避免「左输入 / 右结果」来回扫视 -->
      <Card
        class="gap-0 rounded-3xl border-border/55 py-0 shadow-[0_24px_72px_-20px_rgba(20,20,19,0.09)] ring-1 ring-black/3"
      >
        <CardHeader
          class="gap-2 border-b border-border/50 px-6 pb-8 pt-10 sm:px-10 sm:pt-12"
        >
          <CardTitle class="font-serif text-xl font-medium sm:text-2xl">
            简历与岗位
          </CardTitle>
          <CardDescription class="text-[15px] leading-relaxed text-muted-foreground">
            先上传简历，再粘贴目标岗位的 JD 全文
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6 px-6 py-10 sm:space-y-8 sm:px-10 sm:py-12">
          <div class="grid gap-10 md:grid-cols-2 md:items-stretch lg:gap-14">
            <div class="flex flex-col space-y-6">
              <Label
                class="text-muted-foreground/90 mb-0.5 block text-[11px] font-medium tracking-widest uppercase"
              >
                简历文件
              </Label>
              <div
                role="button"
                tabindex="0"
                class="border-border/90 bg-card/50 hover:bg-card/85 focus-visible:ring-ring rounded-3xl border border-dashed p-8 transition-colors focus-visible:ring-[3px] focus-visible:outline-none sm:p-10"
                :class="dragActive ? 'border-primary bg-primary/5' : ''"
                @dragenter.prevent="dragActive = true"
                @dragover.prevent="dragActive = true"
                @dragleave.prevent="dragActive = false"
                @drop.prevent="onDrop"
              >
                <div class="flex flex-col items-center gap-4 text-center">
                  <div
                    class="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl"
                  >
                    <UploadCloud class="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p class="text-[15px] font-medium leading-snug">拖拽到此处或选择文件</p>
                    <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
                      <code class="text-foreground">.pdf</code> ·
                      <code class="text-foreground">.docx</code>
                    </p>
                  </div>
                  <Button
                    as-child
                    variant="secondary"
                    size="sm"
                    class="mt-1 min-h-11 rounded-xl px-4"
                  >
                    <label class="cursor-pointer px-4 py-2.5">
                      <span class="inline-flex items-center gap-2">
                        <FileText class="size-4" aria-hidden="true" />
                        选择文件
                      </span>
                      <input
                        class="sr-only"
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        @change="onInputChange"
                      />
                    </label>
                  </Button>
                  <p class="text-muted-foreground text-xs">
                    当前：<span class="text-foreground font-medium">{{ fileLabel }}</span>
                  </p>
                </div>
              </div>

              <div v-if="parseError">
                <Alert variant="destructive">
                  <AlertCircle class="size-4" />
                  <AlertTitle>需要先处理的问题</AlertTitle>
                  <AlertDescription>{{ parseError }}</AlertDescription>
                </Alert>
              </div>

              <div v-if="docxWeakWarning">
                <Alert
                  class="border-border/80 bg-card/90 rounded-3xl px-6 py-5 shadow-[0_0_0_1px_rgba(240,238,230,0.85)] sm:px-8 sm:py-6"
                >
                  <Info class="text-primary size-4 shrink-0" />
                  <AlertTitle class="font-serif text-base">简历正文偏少</AlertTitle>
                  <AlertDescription class="text-muted-foreground text-sm leading-relaxed">
                    {{ docxWeakWarning }}
                  </AlertDescription>
                </Alert>
              </div>

              <div v-if="draftHint">
                <Alert
                  class="border-border/80 bg-card/90 rounded-3xl px-6 py-5 shadow-[0_0_0_1px_rgba(240,238,230,0.85)] sm:px-8 sm:py-6"
                >
                  <Info class="text-primary size-4 shrink-0" />
                  <AlertTitle class="font-serif text-base">草稿提示</AlertTitle>
                  <AlertDescription class="text-muted-foreground text-sm leading-relaxed">
                    {{ draftHint }}
                  </AlertDescription>
                </Alert>
              </div>

              <div v-if="parsed?.kind === 'pdf' && parsed.pdfObjectUrl" class="space-y-3">
                <Label
                  class="text-muted-foreground/90 block text-[11px] font-medium tracking-widest uppercase"
                >
                  PDF 预览
                </Label>
                <div
                  class="border-border/80 bg-background overflow-hidden rounded-3xl border shadow-[0_0_0_1px_rgba(240,238,230,0.75)]"
                >
                  <iframe
                    title="PDF 预览"
                    class="h-[min(68vh,620px)] w-full min-h-[360px]"
                    :src="parsed.pdfObjectUrl"
                  />
                </div>
              </div>

              <div v-if="parsed?.kind === 'docx' && parsed.docxHtml" class="space-y-3">
                <Label
                  class="text-muted-foreground/90 block text-[11px] font-medium tracking-widest uppercase"
                >
                  DOCX 预览
                </Label>
                <div
                  class="border-border/80 bg-card h-[min(42vh,300px)] min-h-[200px] overflow-y-auto overscroll-y-contain rounded-3xl border p-5 text-sm leading-relaxed shadow-[0_0_0_1px_rgba(240,238,230,0.75)] sm:p-6"
                >
                  <div
                    class="prose-resume prose-headings:font-serif prose-headings:font-medium max-w-none"
                    v-html="parsed.docxHtml"
                  />
                </div>
              </div>
            </div>

            <div class="flex min-h-0 flex-col gap-4 md:h-full md:gap-5">
              <Label
                class="text-muted-foreground/90 mb-0.5 block text-[11px] font-medium tracking-widest uppercase"
              >
                岗位描述（JD）
              </Label>
              <p class="text-muted-foreground shrink-0 text-sm leading-relaxed">
                将招聘公告全文粘贴到下方「JD 正文」；职责与要求越具体，差距清单与面试预测越贴近真实筛选。
              </p>

              <Tabs
                v-model="jdBodyView"
                class="flex min-h-0 w-full flex-1 flex-col gap-3"
              >
                <div
                  class="text-muted-foreground flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span
                    class="text-muted-foreground/90 text-[11px] font-medium tracking-widest uppercase"
                  >
                    JD 正文
                  </span>
                  <TabsList
                    class="bg-secondary/70 inline-flex h-8 w-full shrink-0 items-center gap-0.5 rounded-xl p-0.5 sm:w-auto"
                  >
                    <TabsTrigger
                      value="edit"
                      class="h-7 min-h-7 rounded-md px-2.5 text-xs leading-tight data-[state=active]:bg-card data-[state=active]:shadow-sm sm:px-3"
                    >
                      编辑
                    </TabsTrigger>
                    <TabsTrigger
                      value="preview"
                      class="h-7 min-h-7 rounded-md px-2.5 text-xs leading-tight data-[state=active]:bg-card data-[state=active]:shadow-sm sm:px-3"
                    >
                      Markdown 预览
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent
                  value="edit"
                  class="mt-0 flex min-h-0 flex-1 flex-col space-y-2"
                >
                  <Textarea
                    id="jd"
                    v-model="jd"
                    rows="12"
                    placeholder="此处为参与分析的 JD 正文，请粘贴招聘全文（可含 Markdown）。"
                    class="min-h-[360px] flex-1 resize-y rounded-2xl border-border/80 bg-card text-[15px] leading-[1.65] shadow-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0 md:h-[min(68vh,620px)]"
                  />
                </TabsContent>
                <TabsContent
                  value="preview"
                  class="mt-0 flex min-h-0 flex-1 flex-col"
                >
                  <div
                    class="border-border/80 bg-card flex min-h-[360px] flex-1 flex-col overflow-y-auto overscroll-y-contain rounded-3xl border p-6 text-[15px] leading-[1.65] shadow-[0_0_0_1px_rgba(240,238,230,0.75)] md:min-h-0 md:h-[min(68vh,620px)] sm:p-7"
                  >
                    <div
                      v-if="!jd.trim()"
                      class="text-muted-foreground text-sm leading-relaxed"
                    >
                      暂无 JD 正文，请切换到「编辑」并粘贴招聘文案。
                    </div>
                    <div
                      v-else
                      class="prose-resume prose-headings:font-serif prose-headings:font-medium prose-a:text-primary max-w-none"
                      v-html="jdHtml"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div v-if="jdLooksThin">
                <Alert
                  class="border-border/80 bg-card/90 rounded-3xl px-6 py-5 shadow-[0_0_0_1px_rgba(240,238,230,0.85)] sm:px-8 sm:py-6"
                >
                  <Info class="text-primary size-4 shrink-0" />
                  <AlertTitle class="font-serif text-base">JD 可能过短</AlertTitle>
                  <AlertDescription
                    class="text-muted-foreground text-[15px] leading-[1.65]"
                  >
                    建议粘贴更完整的岗位职责与技能要求，分析会更贴近真实筛选。
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter
          class="bg-secondary/20 flex flex-col gap-4 border-t border-border/50 px-6 py-10 sm:px-10"
        >
          <Button
            class="min-h-12 w-full rounded-2xl text-base shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_50%,transparent)] sm:max-w-md sm:self-center"
            size="lg"
            :disabled="analyzing"
            @click="analyze"
          >
            <Loader2
              v-if="analyzing"
              class="size-4 animate-spin"
              aria-hidden="true"
            />
            <Sparkles v-else class="size-4" aria-hidden="true" />
            <span class="ml-2">运行匹配分析</span>
          </Button>
        </CardFooter>
      </Card>

      <!-- 结果：全宽独立区块，自上而下阅读 -->
      <section class="scroll-mt-28 space-y-6 lg:space-y-8" aria-labelledby="results-title">
        <div class="max-w-3xl">
          <h2
            id="results-title"
            class="font-serif text-foreground text-2xl font-medium tracking-tight sm:text-3xl"
          >
            分析结果
          </h2>
          <p class="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-[15px]">
            差距、面试方向与美化简历稿集中展示；「AI美化」会结合上方 JD 优化结构与关键词。
          </p>
        </div>
        <Card
          class="gap-0 rounded-3xl border-border/55 py-0 shadow-[0_24px_72px_-20px_rgba(20,20,19,0.09)] ring-1 ring-black/3"
        >
          <CardContent class="space-y-6 px-6 py-10 sm:space-y-8 sm:px-10 sm:py-12">
              <div v-if="analyzing" class="space-y-4 py-4 sm:py-6">
                <div class="flex items-center gap-2 text-sm">
                  <Loader2 class="text-primary size-4 animate-spin" aria-hidden="true" />
                  <span v-if="useLiveApi">正在请求简历分析服务，请稍候…</span>
                  <span v-else>正在模拟模型推理与排版预览管线…</span>
                </div>
                <Progress v-model="progress" class="h-1.5" />
              </div>

              <div
                v-else-if="!result"
                class="text-muted-foreground flex flex-col items-start gap-4 py-12 text-[15px] leading-relaxed sm:py-16"
              >
                <p class="max-w-lg">
                  完成上方「简历 + JD」后点击
                  <span class="text-foreground font-medium">运行匹配分析</span>
                  ，此处将展示：
                </p>
                <ul class="list-disc space-y-3 pl-5">
                  <li>与 JD 不对齐的风险点（按优先级分组）</li>
                  <li>围绕项目与岗位的高概率面试题</li>
                  <li>美化简历稿预览（匹配分析稿可含修订标记，红删绿增对照）</li>
                </ul>
                <div v-if="parsed" class="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    class="h-9 rounded-lg px-3 text-xs sm:text-sm"
                    :disabled="beautifying || analyzing || !jd.trim()"
                    @click="aiBeautifyResume"
                  >
                    <Loader2
                      v-if="beautifying"
                      class="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    <Wand2 v-else class="size-3.5" aria-hidden="true" />
                    <span class="ml-2">AI美化</span>
                  </Button>
                  <p
                    v-if="!jd.trim()"
                    class="text-muted-foreground w-full text-xs leading-relaxed"
                  >
                    请先填写 JD，AI 美化需按岗位要求调整简历。
                  </p>
                </div>
              </div>

              <div v-else class="space-y-6 sm:space-y-8">
                <Alert
                  class="border-border/80 bg-card/90 rounded-3xl px-6 py-5 shadow-[0_0_0_1px_rgba(240,238,230,0.8)] sm:px-9 sm:py-6"
                >
                  <Sparkles class="text-primary size-4" />
                  <AlertTitle class="font-serif text-lg">匹配摘要</AlertTitle>
                  <AlertDescription
                    class="text-muted-foreground text-[15px] leading-[1.65]"
                  >
                    {{ result.headline }}
                  </AlertDescription>
                </Alert>

                <Tabs default-value="gaps" class="w-full">
                  <TabsList
                    class="bg-secondary/70 grid h-auto w-full grid-cols-3 gap-1.5 rounded-2xl p-1.5"
                  >
                    <TabsTrigger
                      value="gaps"
                      class="min-h-11 rounded-xl text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm"
                    >
                      差距分析
                    </TabsTrigger>
                    <TabsTrigger
                      value="interviews"
                      class="min-h-11 rounded-xl text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm"
                    >
                      面试预测
                    </TabsTrigger>
                    <TabsTrigger
                      value="preview"
                      class="min-h-11 rounded-xl text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm"
                    >
                      <span class="sm:hidden">美化</span>
                      <span class="hidden sm:inline">美化简历</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="gaps" class="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
                    <p
                      v-if="result.gaps.length === 0"
                      class="text-muted-foreground py-8 text-center text-sm leading-relaxed"
                    >
                      暂无差距项。请先运行「匹配分析」；若刚做过「AI美化」尚未对齐 JD，也可再运行匹配分析生成差距清单。
                    </p>
                    <article
                      v-for="g in result.gaps"
                      :key="g.id"
                      class="border-border/80 bg-card/75 rounded-3xl border p-5 shadow-[0_0_0_1px_rgba(240,238,230,0.75)] sm:p-6"
                    >
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="font-serif text-base font-medium sm:text-[1.0625rem]">
                          {{ g.title }}
                        </h3>
                        <Badge :variant="severityVariant(g.severity)">
                          {{ severityLabel(g.severity) }}
                        </Badge>
                      </div>
                      <p class="text-muted-foreground mt-3 text-[15px] leading-[1.65]">
                        {{ g.detail }}
                      </p>
                      <template v-if="g.jdAnchor">
                        <Separator class="my-4" />
                        <p class="text-muted-foreground text-xs leading-relaxed">
                          <span class="text-foreground font-medium">JD 参照：</span>
                          {{ g.jdAnchor }}
                        </p>
                      </template>
                    </article>
                  </TabsContent>

                  <TabsContent value="interviews" class="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
                    <p
                      v-if="result.interviews.length === 0"
                      class="text-muted-foreground py-8 text-center text-sm leading-relaxed"
                    >
                      暂无面试预测。结合 JD 的分析会填充此 Tab。
                    </p>
                    <article
                      v-for="q in result.interviews"
                      :key="q.id"
                      class="border-border/80 bg-card/75 rounded-3xl border p-5 sm:p-6"
                    >
                      <p class="font-serif text-base font-medium leading-snug sm:text-[1.0625rem]">
                        {{ q.question }}
                      </p>
                      <p class="text-muted-foreground mt-3 text-[15px] leading-[1.65]">
                        {{ q.rationale }}
                      </p>
                    </article>
                  </TabsContent>

                  <TabsContent value="preview" class="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
                    <div
                      class="text-muted-foreground flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <span
                          class="border-destructive/35 bg-destructive/15 text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-0.5 line-through decoration-destructive/70"
                        >
                          ~~删除 / 替换前~~
                        </span>
                        <span
                          class="border-emerald-700/25 bg-emerald-600/15 text-foreground inline-flex items-center rounded-md border px-2 py-0.5"
                        >
                          ++新增 / 强调补充++
                        </span>
                        <span
                          class="text-muted-foreground max-w-[min(100%,20rem)] text-xs sm:text-sm"
                        >
                          匹配分析或 AI 美化稿中模型按此约定输出时即高亮对照
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        class="h-9 shrink-0 rounded-lg px-3 text-xs sm:text-sm"
                        :disabled="beautifying || analyzing || !parsed || !jd.trim()"
                        @click="aiBeautifyResume"
                      >
                        <Loader2
                          v-if="beautifying"
                          class="size-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        <Wand2 v-else class="size-3.5" aria-hidden="true" />
                        <span class="ml-2">AI美化</span>
                      </Button>
                    </div>
                    <div
                      class="border-border/80 bg-card h-[min(58vh,560px)] min-h-[280px] overflow-y-auto overscroll-y-contain rounded-3xl border p-6 text-[15px] leading-[1.65] shadow-[0_0_0_1px_rgba(240,238,230,0.75)] sm:p-8"
                    >
                      <div
                        class="prose-resume prose-headings:font-serif prose-headings:font-medium prose-a:text-primary max-w-none"
                        v-html="revisedHtml"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
          </CardContent>
        </Card>
      </section>

      <Dialog v-model:open="resetDialogOpen">
        <DialogContent class="max-h-[min(90vh,720px)] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle class="font-serif text-lg">重置会话</DialogTitle>
            <DialogDescription class="text-[15px] leading-relaxed">
              将清空当前 JD、已选简历与下方分析结果。可按需保留本机「简历文件」草稿（IndexedDB）。
            </DialogDescription>
          </DialogHeader>
          <div class="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/50 p-4">
            <Checkbox
              id="keep-local-draft"
              class="mt-0.5"
              v-model:checked="keepLocalDraftOnReset"
            />
            <label for="keep-local-draft" class="cursor-pointer text-sm leading-relaxed">
              保留 IndexedDB 中的简历文件草稿，便于下次打开恢复。取消勾选时一并删除该草稿；当前页的 JD、分析结果与「上次分析」缓存仍会清空。
            </label>
          </div>
          <DialogFooter class="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              class="rounded-xl"
              @click="resetDialogOpen = false"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              class="rounded-xl"
              @click="confirmResetSession"
            >
              确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  </div>
</template>

<style scoped>
.prose-resume :where(h1, h2, h3) {
  font-family: var(--font-serif);
  font-weight: 500;
  color: var(--foreground);
}
.prose-resume h1 {
  font-size: 1.35rem;
  margin: 0 0 0.65rem;
  line-height: 1.25;
}
.prose-resume h2 {
  font-size: 1.1rem;
  margin: 1.5rem 0 0.65rem;
  line-height: 1.3;
}
.prose-resume h3 {
  font-size: 1rem;
  margin: 1.25rem 0 0.5rem;
  line-height: 1.35;
}
.prose-resume p {
  margin: 0.5rem 0 0.85rem;
  line-height: 1.65;
}
.prose-resume ul {
  padding-left: 1.15rem;
  margin: 0.5rem 0 1rem;
}
.prose-resume li {
  margin: 0.35rem 0;
}
.prose-resume blockquote {
  margin: 0.75rem 0 1rem;
  padding: 0.85rem 1rem;
  border-left: 3px solid var(--primary);
  background: color-mix(in oklab, var(--secondary) 55%, transparent);
  color: var(--muted-foreground);
  font-size: 0.92rem;
}
.prose-resume code {
  font-size: 0.85em;
  padding: 0.1rem 0.35rem;
  border-radius: 0.35rem;
  background: var(--secondary);
}
/* 修订标记：红删绿增（与图例一致） */
.prose-resume :deep(del),
.prose-resume :deep(s) {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  background-color: color-mix(in oklab, #b53333 22%, transparent);
  padding: 0.06em 0.2em;
  border-radius: 0.25rem;
  color: inherit;
}
.prose-resume :deep(ins.resume-diff-add) {
  text-decoration: none;
  background-color: color-mix(in oklab, #166534 24%, transparent);
  padding: 0.06em 0.2em;
  border-radius: 0.25rem;
  color: inherit;
}
</style>
