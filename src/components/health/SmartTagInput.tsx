import { Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { addSmartTag, shouldCommitSmartTag, toggleSmartTag } from '../../features/health-profile/utils/smartTags'

export interface SmartTagInputProps {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  suggestions?: readonly string[]
  placeholder?: string
  maxTags?: number
  exclusiveValue?: string
}

export function SmartTagInput({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder = '输入后按回车添加',
  maxTags = 12,
  exclusiveValue
}: SmartTagInputProps) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const composing = useRef(false)
  const options = { maxTags, exclusiveValue }

  const commitDraft = () => {
    if (!draft.trim()) {
      setDraft('')
      return
    }
    const next = addSmartTag(value, draft, options)
    onChange(next)
    setDraft('')
  }

  const availableSuggestions = suggestions.filter((suggestion) =>
    !draft.trim() || suggestion.includes(draft.trim())
  )

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="hoho-text-label mb-1">{label}</legend>
      {value.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-2" aria-label={`已选择${label}`}>
          {value.map((tag) => (
            <span className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-pill border border-primary/30 bg-primary-soft px-3 text-xs font-medium text-primary" key={tag}>
              <span className="truncate">{tag}</span>
              <button
                aria-label={`移除${tag}`}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                onClick={() => onChange(value.filter((item) => item !== tag))}
                type="button"
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative min-w-0">
        <input
          className="hoho-input w-full pr-12"
          enterKeyHint="done"
          onBlur={() => {
            setFocused(false)
            if (!composing.current) commitDraft()
          }}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionEnd={() => { composing.current = false }}
          onCompositionStart={() => { composing.current = true }}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (!shouldCommitSmartTag(event.key, composing.current)) return
            event.preventDefault()
            commitDraft()
          }}
          placeholder={placeholder}
          value={draft}
        />
        <button
          aria-label={`添加${label}`}
          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-primary"
          onPointerDown={(event) => event.preventDefault()}
          onClick={commitDraft}
          type="button"
        >
          <Plus size={17} />
        </button>
      </div>
      {(focused || draft) && availableSuggestions.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-2 rounded-control bg-background p-2" aria-label={`${label}建议`}>
          {availableSuggestions.map((suggestion) => {
            const selected = value.includes(suggestion)
            return (
              <button
                aria-pressed={selected}
                className={`min-h-10 rounded-pill border px-3 text-xs ${selected ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`}
                key={suggestion}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onChange(toggleSmartTag(value, suggestion, options))}
                type="button"
              >
                {suggestion}
              </button>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
