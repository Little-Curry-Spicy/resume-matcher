import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

export const badgeVariants = cva(
  "inline-flex pt-[4px] h-6 min-h-6 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-medium leading-none whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow]",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
         "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        /** 语义：中优先级 / 需留意（暖琥珀，与陶土主色同温） */
        warning:
          "border-amber-700/25 bg-amber-500/14 text-amber-950 [a&]:hover:bg-amber-500/20 dark:border-amber-500/30 dark:bg-amber-500/12 dark:text-amber-50",
        /** 语义：低优先级 / 相对缓和（冷绿与暖底对比清晰，非荧光） */
        success:
          "border-emerald-800/25 bg-emerald-700/10 text-emerald-950 [a&]:hover:bg-emerald-700/14 dark:border-emerald-500/25 dark:bg-emerald-500/12 dark:text-emerald-50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
