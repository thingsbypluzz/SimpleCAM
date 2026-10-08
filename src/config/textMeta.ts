import type { ComponentType } from 'react'
import { EngraveIcon, TextCircleIcon, TextStraightIcon } from '../components/icons'
import { fmt } from '../lib/format'
import { textLines } from '../lib/textLayout'
import type { TextLayout, TextParams } from '../types/wizard'
import type { MethodDisplay } from './operationMeta'
import { textFontMeta } from './textFonts'

export interface TextLayoutMeta {
  value: TextLayout
  title: string
  // Short name for the Step Summary and the filename.
  shortLabel: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

export const TEXT_LAYOUT_META: Record<TextLayout, TextLayoutMeta> = {
  straight: {
    value: 'straight',
    title: 'Straight',
    shortLabel: 'Straight',
    description: 'Text on a straight baseline — one or more lines, turned to any angle about its origin.',
    Icon: TextStraightIcon,
  },
  circle: {
    value: 'circle',
    title: 'On Circle',
    shortLabel: 'Circle',
    description: 'One line of text bent along a circle, letters standing with their heads outward or inward.',
    Icon: TextCircleIcon,
  },
}

export const TEXT_LAYOUT_LIST: TextLayoutMeta[] = [TEXT_LAYOUT_META.straight, TEXT_LAYOUT_META.circle]

// Text has one way of cutting — the tool follows the letters' strokes.
export const TEXT_METHOD: MethodDisplay & { value: string } = {
  value: 'engrave',
  Icon: EngraveIcon,
  shortLabel: 'Engrave',
  title: 'Engrave',
  stepdown: { fieldLabel: 'Stepdown [mm per pass]', shortLabel: 'STEP' },
}

export function textLayoutIcon(layout: TextLayout) {
  return TEXT_LAYOUT_META[layout].Icon
}

// The written text cut down to a few characters, for labels.
export function textExcerpt(text: TextParams, max = 14): string {
  const line = textLines(text).join(' ').replace(/\s+/g, ' ').trim()
  const chars = [...line]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : line
}

// Short lines stacked in the narrow collapsed-bar badge.
export function textLayoutLines(text: TextParams): string[] {
  return text.layout === 'circle' ? ['TEXT', 'ON CIRCLE', `(⌀${fmt(text.circleDiameter)})`] : ['TEXT', `(${fmt(text.height)} mm)`]
}

export function textSummary(text: TextParams): string {
  return textLayoutLines(text).join(' ')
}

// Compact single-line label used by lib/presetLabel.ts.
export function textLabel(text: TextParams): string {
  const where = text.layout === 'circle' ? ` on ⌀${fmt(text.circleDiameter)}` : ''
  return `Text “${textExcerpt(text)}”${where} • ${textFontMeta(text.fontId).title}`
}

export function textBitLabel(text: TextParams): string {
  return text.bit === 'vbit' ? `V ${fmt(text.vbitAngleDeg)}°` : `⌀${fmt(text.toolDiameter)}`
}

// Filename-safe slug used by lib/download.ts's buildFilename().
export function textSlug(text: TextParams): string {
  return text.layout === 'circle' ? 'text-on-circle' : 'text'
}
