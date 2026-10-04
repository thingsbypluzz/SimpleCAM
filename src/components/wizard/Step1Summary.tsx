import type { OperationType, WizardParams } from '../../types/wizard'
import { OPERATION_LIST, OPERATION_META } from '../../config/operationMeta'

interface Step1SummaryProps {
  params: WizardParams
  title: string
  onOpen: () => void
  onSwitchOperation: (operation: OperationType) => void
}

// Collapsed Step 1 (BL-94): every operation in Step 1's own order. The
// active one is highlighted in its place, with its picked pattern/shape;
// the others are small buttons that open Step 1 with that operation
// already selected — each shows the pattern/shape it remembers. A <div>,
// not the <button> the other Step Summaries are, since it holds buttons of
// its own; a click on its background still opens Step 1.
export function Step1Summary({ params, title, onOpen, onSwitchOperation }: Step1SummaryProps) {
  return (
    <div
      onClick={onOpen}
      title={title}
      className="flex w-20 shrink-0 cursor-pointer flex-col items-center gap-2 border-r border-border py-4 hover:bg-border/40"
    >
      {OPERATION_LIST.map((operation) => {
        const meta = OPERATION_META[operation]
        const Icon = meta.pickIcon(params)

        if (operation === params.operation) {
          // No handler of its own: its click bubbles to the column's.
          return (
            <button
              key={operation}
              type="button"
              aria-pressed
              title={`${meta.pickKind}: ${meta.pickSummary(params)}`}
              className="flex w-[72px] flex-col items-center gap-1 rounded-md border border-selected-border bg-selected-bg py-1.5 shadow-[var(--glow-selected)]"
            >
              <span className="text-[10px] font-semibold uppercase text-muted">{meta.label}</span>
              <Icon className="h-8 w-8 text-accent" />
              <span className="flex flex-col items-center">
                {meta.pickLines(params).map((line, i) => (
                  <span key={i} className="text-center text-[9px] leading-tight font-semibold whitespace-nowrap text-stat-value">
                    {line}
                  </span>
                ))}
              </span>
            </button>
          )
        }

        const label = `Switch to ${meta.label} — ${meta.pickSummary(params)}`
        return (
          <button
            key={operation}
            type="button"
            aria-pressed={false}
            title={label}
            aria-label={label}
            onClick={(event) => {
              event.stopPropagation()
              onSwitchOperation(operation)
            }}
            className="flex w-[72px] flex-col items-center gap-1 rounded-md border border-transparent py-1.5 text-muted transition hover:border-border hover:text-accent"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[9px] font-semibold uppercase">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
