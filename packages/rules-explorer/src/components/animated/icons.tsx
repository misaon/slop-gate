import { motion, type Variants } from 'motion/react'

/**
 * Animated icons from lucide-animated (pqoqubbw/icons), MIT, adapted.
 *
 * Two changes from upstream, both to make them affordable here. Upstream each icon owns a wrapper
 * `div`, its own mouse handlers and a `useAnimation()` controller; these declare variants only and
 * let a parent `motion` element with `whileHover="animate"` drive them. That is one hook fewer per
 * icon, and it means hovering the whole tile animates the glyph rather than needing the pointer on
 * a 16px target.
 *
 * **Only for places with one instance on the page.** Every one of these is a motion component with
 * its own animation state; the table renders 923 rows, so its cells keep the static set in
 * `../icons.tsx`. The split is the reason the bundle carries motion at all.
 */

type IconProps = { size?: number; class?: string }

const SVG = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const

const DRAW: Variants = {
  normal: { opacity: 1, pathLength: 1, transition: { duration: 0.3, opacity: { duration: 0.1 } } },
  animate: { opacity: [0, 1], pathLength: [0, 1], transition: { duration: 0.4, opacity: { duration: 0.1 } } },
}

export function BookTextAnimated({ size = 16, class: className }: IconProps) {
  return (
    <motion.svg
      {...SVG}
      width={size}
      height={size}
      class={className}
      variants={{
        normal: { scale: 1, rotate: 0, y: 0 },
        animate: {
          scale: [1, 1.04, 1],
          rotate: [0, -8, 8, -8, 0],
          y: [0, -2, 0],
          transition: { duration: 0.6, ease: 'easeInOut', times: [0, 0.2, 0.5, 0.8, 1] },
        },
      }}
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      <path d="M8 11h8" />
      <path d="M8 7h6" />
    </motion.svg>
  )
}

export function ShieldCheckAnimated({ size = 16, class: className }: IconProps) {
  return (
    <svg {...SVG} width={size} height={size} class={className}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <motion.path d="m9 12 2 2 4-4" variants={DRAW} />
    </svg>
  )
}

export function BanAnimated({ size = 16, class: className }: IconProps) {
  return (
    <svg {...SVG} width={size} height={size} class={className}>
      <motion.circle cx="12" cy="12" r="10" variants={DRAW} />
      <motion.path d="m4.9 4.9 14.2 14.2" variants={DRAW} />
    </svg>
  )
}

export function GaugeAnimated({ size = 16, class: className }: IconProps) {
  return (
    <svg {...SVG} width={size} height={size} class={className}>
      <motion.path
        d="m12 14 4-4"
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        variants={{
          normal: { translateX: 0, translateY: 0, rotate: 0 },
          animate: { translateX: 0.5, translateY: 3, rotate: 72 },
        }}
      />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  )
}

export function ExternalLinkAnimated({ size = 14, class: className }: IconProps) {
  return (
    <svg {...SVG} width={size} height={size} class={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <motion.g
        variants={{
          normal: { scale: 1, translateX: 0, translateY: 0 },
          animate: {
            scale: [1, 0.92, 1],
            translateX: [0, 2, 0],
            translateY: [0, -2, 0],
            originX: 1,
            originY: 0,
            transition: { duration: 0.5, ease: 'easeInOut' },
          },
        }}
      >
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
      </motion.g>
    </svg>
  )
}

export function SearchAnimated({ size = 14, class: className }: IconProps) {
  return (
    <motion.svg
      {...SVG}
      width={size}
      height={size}
      class={className}
      transition={{ duration: 1, bounce: 0.3 }}
      variants={{ normal: { x: 0, y: 0 }, animate: { x: [0, 0, -3, 0], y: [0, -4, 0, 0] } }}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </motion.svg>
  )
}

/** The element a parent uses to drive any of the above on hover. */
export function HoverGroup({ children, class: className }: { children: preact.ComponentChildren; class?: string }) {
  return (
    <motion.div initial="normal" whileHover="animate" animate="normal" class={className}>
      {children}
    </motion.div>
  )
}
