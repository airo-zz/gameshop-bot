/**
 * src/motionFeatures.ts
 * Полный набор возможностей framer-motion (анимации, жесты, layout) — грузится
 * отдельным чанком после первой отрисовки (LazyMotion в main.tsx).
 * Компоненты используют лёгкие `m.*` вместо `motion.*`.
 */
import { domMax } from 'framer-motion'

export default domMax
