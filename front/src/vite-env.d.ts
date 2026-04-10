/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端根地址，例如 http://localhost:3001；不设则走本地模拟分析 */
  readonly VITE_API_BASE_URL?: string
  /** 与后端 RESUME_MATCHER_API_KEY 对应，通过请求头 x-api-key 传递 */
  readonly VITE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
