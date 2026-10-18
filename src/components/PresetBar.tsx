import { useEffect, useRef, useState, type ReactNode } from 'react'
import { OPERATION_META } from '../config/operationMeta'
import { isHintSeen, markHintSeen } from '../lib/hintStorage'
import { presetLabel } from '../lib/presetLabel'
import { PRESET_SLOT_IDS, type PresetSlotId } from '../lib/storage'
import type { WizardParams } from '../types/wizard'
import { CheckIcon, EyeIcon, PencilIcon } from './icons'
import type { LayoutMode } from './useViewport'

// How long a finger rests on a slot before its menu opens.
const LONG_PRESS_MS = 500

interface PresetBarProps {
  layout: LayoutMode
  // BL-8: a finger instead of a mouse — a tap loads the preset and a long
  // press opens a menu with the two things the corner badges do; the
  // badges themselves only show the state.
  touch: boolean
  presetSlots: Partial<Record<PresetSlotId, WizardParams>>
  overlaySlots: ReadonlySet<PresetSlotId>
  editingSlot: PresetSlotId | null
  justLoadedSlot: PresetSlotId | null
  // "Overlay Mode — …" / "Auto-save Mode Enabled". Beside the bar in the
  // wide and narrow layouts; the medium one shows them elsewhere.
  labels: ReactNode
  onLoad: (id: PresetSlotId) => void
  onToggleOverlaySlot: (id: PresetSlotId) => void
  onEditSlot: (id: PresetSlotId) => void
  onToggleOverlay: () => void
}

// Preset Bar: slots [1]…[7] and the Overlay eye.
export function PresetBar({
  layout,
  touch,
  presetSlots,
  overlaySlots,
  editingSlot,
  justLoadedSlot,
  labels,
  onLoad,
  onToggleOverlaySlot,
  onEditSlot,
  onToggleOverlay,
}: PresetBarProps) {
  const overlayEnabled = overlaySlots.size > 0
  const active = overlayEnabled || editingSlot !== null
  // A plain click loads the preset — only while nothing is overlaid or
  // edited (loading over an armed slot would be live-saved straight into
  // it).
  const canLoad = !active

  const [menuSlot, setMenuSlot] = useState<PresetSlotId | null>(null)
  const [hintSeen, setHintSeen] = useState(() => isHintSeen('presetHold'))
  const rootRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // The long press already acted: the click that follows the finger's
  // release must not load the preset as well.
  const longPressed = useRef(false)
  useEffect(() => () => clearTimeout(pressTimer.current), [])

  const dismissHint = () => {
    if (hintSeen) return
    markHintSeen('presetHold')
    setHintSeen(true)
  }

  useEffect(() => {
    if (menuSlot === null) return
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.querySelector('[role="menu"]')?.contains(e.target as Node)) setMenuSlot(null)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuSlot(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuSlot])

  const startPress = (id: PresetSlotId) => {
    longPressed.current = false
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longPressed.current = true
      setMenuSlot(id)
      dismissHint()
    }, LONG_PRESS_MS)
  }
  const endPress = () => clearTimeout(pressTimer.current)

  const showHint = touch && !hintSeen && PRESET_SLOT_IDS.some((id) => presetSlots[id])

  return (
    <div
      ref={rootRef}
      className={[
        'relative flex items-center gap-2 rounded-lg border transition-colors',
        layout === 'narrow' ? 'w-full border-transparent' : 'px-2 py-2',
        layout !== 'narrow' && (active ? 'border-border' : 'border-transparent'),
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Wide: absolutely positioned off the LEFT edge of the preset group
          (not a normal flex sibling) so it never pushes the slots sideways
          when it appears or disappears. */}
      {layout === 'wide' && active && (
        <div className="absolute top-1/2 right-full mr-3 flex -translate-y-1/2 flex-col items-end gap-0.5 text-xs font-semibold whitespace-nowrap">
          {labels}
        </div>
      )}
      {PRESET_SLOT_IDS.map((id) => {
        const preset = presetSlots[id]
        const PresetIcon = preset ? OPERATION_META[preset.operation].pickIcon(preset) : null
        const isOverlaySelected = overlaySlots.has(id)
        const isEditingSlot = editingSlot === id
        const isJustLoaded = canLoad && justLoadedSlot === id
        const baseClassName = !preset
          ? 'flex h-11 w-11 cursor-default items-center justify-center rounded-md border border-empty-border text-xs font-semibold text-empty-fg'
          : isEditingSlot
            ? 'flex h-11 w-11 items-center justify-center rounded-md border-2 border-edit text-edit-fg shadow-[var(--glow-edit)]'
            : isOverlaySelected
              ? 'flex h-11 w-11 items-center justify-center rounded-md border-2 border-accent text-accent-fg shadow-[var(--glow-accent)]'
              : `flex h-11 w-11 items-center justify-center rounded-md border border-accent-border text-accent-fg shadow-[var(--glow-accent)]${canLoad ? ' hover:bg-accent-bg' : ''}`
        // The two corner badges (BL-107): an empty ring on hover/focus,
        // filled while on — so the state never rests on color alone.
        const badgeBase =
          'absolute flex h-5 w-5 items-center justify-center rounded-full border transition-opacity focus-visible:opacity-100'
        const badgeHidden = ' opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        const state = [isOverlaySelected && 'shown in overlay', isEditingSlot && 'being edited'].filter(Boolean).join(', ')
        return (
          <div key={id} className="group relative">
            <button
              type="button"
              onClick={() => {
                if (longPressed.current) {
                  longPressed.current = false
                  return
                }
                onLoad(id)
              }}
              disabled={!preset}
              aria-disabled={preset && !canLoad ? true : undefined}
              aria-haspopup={touch && preset ? 'menu' : undefined}
              aria-expanded={touch && preset ? menuSlot === id : undefined}
              aria-label={touch && preset ? `Preset ${id} — ${presetLabel(preset)}${state ? ` (${state})` : ''}` : undefined}
              title={
                touch
                  ? undefined
                  : !preset
                    ? `Preset [${id}] — empty`
                    : canLoad
                      ? `Load preset [${id}] — ${presetLabel(preset)}`
                      : `Preset [${id}] — ${presetLabel(preset)}`
              }
              {...(touch && preset
                ? {
                    onPointerDown: () => startPress(id),
                    onPointerUp: endPress,
                    onPointerLeave: endPress,
                    onPointerCancel: endPress,
                    // The long press is ours, not the browser's menu (nor iOS's
                    // callout).
                    style: { WebkitTouchCallout: 'none' as const },
                    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
                  }
                : {})}
              className={`${baseClassName}${preset && !canLoad ? ' cursor-default' : ''} touch-manipulation transition-shadow duration-700 select-none${isJustLoaded ? ' ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}${menuSlot === id ? ' ring-2 ring-fg/40' : ''}`}
            >
              {PresetIcon ? <PresetIcon className="h-7 w-7" /> : id}
            </button>
            {preset && !touch && (
              <button
                type="button"
                onClick={() => onToggleOverlaySlot(id)}
                aria-pressed={isOverlaySelected}
                aria-label={`Show preset ${id} in overlay`}
                title={`${isOverlaySelected ? 'Remove' : 'Add'} preset [${id}] ${isOverlaySelected ? 'from' : 'to'} overlay`}
                className={`${badgeBase} -top-1.5 -left-1.5 ${
                  isOverlaySelected ? 'border-accent bg-accent text-btn-fg' : `border-accent bg-bg text-accent-fg${badgeHidden}`
                }`}
              >
                <CheckIcon className="h-3 w-3" />
              </button>
            )}
            {preset && !touch && (
              <button
                type="button"
                onClick={() => onEditSlot(id)}
                aria-pressed={isEditingSlot}
                aria-label={`Edit preset ${id}`}
                title={
                  isEditingSlot
                    ? `Editing preset [${id}] (auto-saving) — click to stop`
                    : `Edit preset [${id}] — loads it and auto-saves further changes`
                }
                className={`${badgeBase} -top-1.5 -right-1.5 ${
                  isEditingSlot ? 'border-edit bg-edit text-edit-on' : `border-edit bg-bg text-edit-fg${badgeHidden}`
                }`}
              >
                <PencilIcon className="h-3 w-3" />
              </button>
            )}
            {/* Touch: the badges only show the state — the menu changes it. */}
            {touch && isOverlaySelected && (
              <span aria-hidden="true" className={`${badgeBase} pointer-events-none -top-1.5 -left-1.5 border-accent bg-accent text-btn-fg`}>
                <CheckIcon className="h-3 w-3" />
              </span>
            )}
            {touch && isEditingSlot && (
              <span aria-hidden="true" className={`${badgeBase} pointer-events-none -top-1.5 -right-1.5 border-edit bg-edit text-edit-on`}>
                <PencilIcon className="h-3 w-3" />
              </span>
            )}
            {touch && preset && menuSlot === id && (
              <div
                role="menu"
                aria-label={`Preset ${id}`}
                className={`absolute top-full z-30 mt-2 flex w-56 flex-col rounded-lg border border-field-border bg-bg p-1.5 shadow-xl ${
                  Number(id) > 4 && layout !== 'narrow' ? 'right-0' : 'left-0'
                }`}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleOverlaySlot(id)
                    setMenuSlot(null)
                  }}
                  className="flex h-12 items-center gap-2.5 rounded-md px-3 text-left text-base font-medium text-accent-fg active:bg-accent-bg"
                >
                  <CheckIcon className="h-4 w-4" />
                  {isOverlaySelected ? 'Remove from overlay' : 'Show in overlay'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onEditSlot(id)
                    setMenuSlot(null)
                  }}
                  className="flex h-12 items-center gap-2.5 rounded-md px-3 text-left text-base font-medium text-edit-fg active:bg-edit-bg"
                >
                  <PencilIcon className="h-4 w-4" />
                  {isEditingSlot ? 'Stop editing' : 'Edit'}
                </button>
              </div>
            )}
          </div>
        )
      })}
      {layout === 'narrow' && (
        <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-xs font-semibold">{active && labels}</div>
      )}
      {/* BL-107: the eye shows whether anything is overlaid and switches it
          off; unlit, it shows every saved preset at once. Picking happens
          on the slots. */}
      <button
        type="button"
        onClick={onToggleOverlay}
        aria-label="Toggle preset overlay"
        aria-pressed={overlayEnabled}
        title={
          overlayEnabled
            ? 'Overlay preview: on — click to remove every preset from the overlay'
            : 'Overlay preview: off — click to show all saved presets (or use the checkmark on a preset)'
        }
        className={[
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition',
          layout === 'wide' ? 'ml-11' : layout === 'medium' ? 'ml-2' : '',
          overlayEnabled
            ? 'border-2 border-accent bg-accent-bg text-accent-fg shadow-[var(--glow-accent)]'
            : 'border-border text-value hover:bg-border/40',
        ].join(' ')}
      >
        <EyeIcon className="h-5 w-5" />
      </button>
      {showHint && (
        <div
          role="status"
          className="absolute top-full left-0 z-20 mt-2 flex items-center gap-3 rounded-lg border border-field-border bg-bg py-2 pr-2 pl-3 text-sm text-value shadow-xl"
        >
          <span>Tap a preset to load it. Hold it to show it in the overlay or edit it.</span>
          <button
            type="button"
            onClick={dismissHint}
            className="flex h-9 shrink-0 items-center rounded-md border border-border px-3 text-sm font-medium text-fg"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  )
}
