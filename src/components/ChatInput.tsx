import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowUpIcon } from './ArrowUpIcon'

/* ─────────────────────────────────────────────────────────
 * STORYBOARD — trigger-word dropdown
 *
 *   type    user types into input
 *   match   current word prefix-matches a NAME or DATE
 *    0ms    dropdown card lifts in (y:8→0, blur 6→0, opacity 0→1, spring)
 *   30ms    item 1 soft-blur in
 *   55ms    item 2
 *   80ms    item 3 ...
 *   nav     ↑/↓ moves activeIdx, row bg fades to bg-weak-50 (150ms)
 *   accept  Enter/Tab/click → replaces current word with full value + space,
 *           dropdown exits (y:-2, opacity 0, blur 4, 180ms)
 *   esc     same exit; suppressed until next word
 * ───────────────────────────────────────────────────────── */

const SPRING_CARD = { type: 'spring' as const, visualDuration: 0.4, bounce: 0.16 }
const SPRING_DROP = { type: 'spring' as const, visualDuration: 0.28, bounce: 0 }
const EASE_CONTEXTUAL = [0.2, 0, 0, 1] as const

const MIN_TRIGGER_LEN = 2
const MAX_RESULTS = 6

const NAMES = [
  'Aaron Chen', 'Adam Brooks', 'Alex Rivera', 'Alexander Lee', 'Alice Park',
  'Amelia Garcia', 'Andrew Smith', 'Anna Patel', 'Ava Reyes', 'Benjamin Cole',
  'Bella Romano', 'Caleb Foster', 'Camila Souza', 'Carlos Mendez', 'Charlie Kim',
  'Charlotte Wells', 'Chloe Bennett', 'Daniel Kim', 'David Nakamura', 'Diego Alvarez',
  'Eleanor Hayes', 'Elena Petrova', 'Eli Cohen', 'Eliza Wright', 'Emily Carter',
  'Emma Johnson', 'Ethan Brooks', 'Eva Lindqvist', 'Felix Müller', 'Finn O’Connor',
  'Gabriel Silva', 'Grace Liu', 'Hannah Bauer', 'Harper Ross', 'Henry Walsh',
  'Hugo Lefèvre', 'Ivy Tanaka', 'Isaac Levi', 'Isabella Romano', 'Jack Murphy',
  'Jacob Stein', 'James O’Brien', 'Jane Holloway', 'Jasmine Khan', 'Jason Park',
  'John Bishop', 'Jordan Reyes', 'Joseph Diaz', 'Julia Rossi', 'Kai Tanaka',
  'Kate Sullivan', 'Lily Andersen', 'Liam Foster', 'Lisa Park', 'Lucas Moreau',
  'Luna Vidal', 'Mateo Vargas', 'Maya Iyer', 'Mia Russo', 'Mira Okafor',
  'Michael Brennan', 'Nathan Greene', 'Nina Petrov', 'Noah Williams', 'Nora Eriksen',
  'Oliver Hart', 'Olivia Pearce', 'Owen Walsh', 'Penelope Cruz', 'Peter Marsh',
  'Quinn Davies', 'Rachel Adler', 'Ruby Sato', 'Sam Patel', 'Samuel Greene',
  'Sara Ahmadi', 'Sarah Chen', 'Sebastian Cruz', 'Sofia Martins', 'Sophia Bernard',
  'Tara Mehta', 'Theo Martin', 'Thomas Engel', 'Tyler Brooks', 'Victoria Yates',
  'Violet Owens', 'William Hayes', 'Wyatt Bishop', 'Yuki Tanaka', 'Zara Aslam',
  'Zoe Whitaker',
] as const

const DATES = [
  'today',
  'tomorrow',
  'tonight',
  'yesterday',
  'this morning',
  'this afternoon',
  'this evening',
  'this weekend',
  'next week',
  'next month',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

type Suggestion =
  | { type: 'name'; value: string }
  | { type: 'date'; value: string }

function getCurrentWord(text: string, caret: number) {
  const left = text.slice(0, caret)
  const startMatch = left.match(/(\S+)$/)
  const start = startMatch ? caret - startMatch[1].length : caret
  const right = text.slice(caret)
  const endMatch = right.match(/^(\S*)/)
  const end = caret + (endMatch ? endMatch[0].length : 0)
  return { word: text.slice(start, end), start, end }
}

function findSuggestions(word: string): Suggestion[] {
  if (word.length < MIN_TRIGGER_LEN) return []
  const startsUpper = /^[A-Z]/.test(word)
  const w = word.toLowerCase()

  if (startsUpper) {
    // Capital → proper nouns: people + day names
    const names: Suggestion[] = NAMES.filter((n) =>
      n.toLowerCase().split(/\s+/).some((part) => part.startsWith(w))
    ).map((value) => ({ type: 'name', value }))
    const properDates: Suggestion[] = DATES.filter(
      (d) => /^[A-Z]/.test(d) && d.toLowerCase().startsWith(w)
    ).map((value) => ({ type: 'date', value }))
    return [...names, ...properDates].slice(0, MAX_RESULTS)
  }

  // Lowercase → only relative date phrases (today, tomorrow, next week…)
  const relativeDates: Suggestion[] = DATES.filter(
    (d) => /^[a-z]/.test(d) && d.startsWith(w)
  ).map((value) => ({ type: 'date', value }))
  return relativeDates.slice(0, MAX_RESULTS)
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #fda4af 0%, #fb7185 100%)',
  'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)',
  'linear-gradient(135deg, #a7f3d0 0%, #10b981 100%)',
  'linear-gradient(135deg, #bae6fd 0%, #0ea5e9 100%)',
  'linear-gradient(135deg, #ddd6fe 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #fbcfe8 0%, #ec4899 100%)',
]

function avatarGradient(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % AVATAR_GRADIENTS.length
  }
  return AVATAR_GRADIENTS[hash]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="2.5"
        y="3.5"
        width="11"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2.5 7h11"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M5.5 2v3M10.5 2v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChatInput() {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [isFocused, setIsFocused] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion()
  const hasText = value.trim().length > 0

  const currentWord = useMemo(
    () => getCurrentWord(value, caret),
    [value, caret]
  )

  const suggestions = useMemo(() => {
    if (!isFocused || dismissed) return []
    return findSuggestions(currentWord.word)
  }, [currentWord.word, isFocused, dismissed])

  const showDropdown = suggestions.length > 0

  useEffect(() => {
    setActiveIdx(0)
  }, [suggestions.length, currentWord.word])

  useEffect(() => {
    setDismissed(false)
  }, [currentWord.word])

  const syncCaret = useCallback(() => {
    const el = inputRef.current
    if (el) setCaret(el.selectionStart ?? 0)
  }, [])

  const acceptSuggestion = useCallback(
    (s: Suggestion) => {
      const { start, end } = currentWord
      const next = value.slice(0, start) + s.value + ' ' + value.slice(end)
      const nextCaret = start + s.value.length + 1
      setValue(next)
      setDismissed(true)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(nextCaret, nextCaret)
        setCaret(nextCaret)
        setDismissed(false)
      })
    },
    [currentWord, value]
  )

  const handleSubmit = useCallback(() => {
    if (!value.trim()) return
    setValue('')
    inputRef.current?.focus()
  }, [value])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        acceptSuggestion(suggestions[activeIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative w-full max-w-[440px]">
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            key="dropdown"
            role="listbox"
            aria-label="Suggestions"
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 8, filter: 'blur(6px)', scale: 0.98 }
            }
            animate={{
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
              scale: 1,
            }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    y: -2,
                    filter: 'blur(4px)',
                    scale: 0.99,
                    transition: { duration: 0.18, ease: EASE_CONTEXTUAL },
                  }
            }
            transition={SPRING_DROP}
            style={{ transformOrigin: 'bottom center' }}
            className="
              absolute bottom-[calc(100%+8px)] left-0 right-0
              bg-white rounded-[14px] shadow-figma-card-focus
              p-[6px] z-20
            "
          >
            <ul className="flex flex-col gap-[2px]">
              {suggestions.map((s, i) => (
                <SuggestionRow
                  key={`${s.type}-${s.value}`}
                  suggestion={s}
                  active={i === activeIdx}
                  index={i}
                  reduceMotion={!!reduceMotion}
                  onHover={() => setActiveIdx(i)}
                  onSelect={() => acceptSuggestion(s)}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
        animate={{
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          scale: isPressed ? 0.992 : 1,
        }}
        transition={SPRING_CARD}
        className={[
          'relative bg-white rounded-[19px]',
          'pt-[14px] pb-[12px] px-[12px]',
          'overflow-hidden',
          isFocused ? 'shadow-figma-card-focus' : 'shadow-figma-card',
          'transition-shadow duration-300 ease-out',
        ].join(' ')}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex items-center gap-[8px] w-full">
          <div className="relative flex-1 min-w-0 px-[4px] h-[24px]">
            {!hasText && (
              <span
                className="
                  absolute inset-0 flex items-center
                  text-[15px] leading-[24px] tracking-figma-tight
                  text-text-soft-400 select-none pointer-events-none
                  whitespace-nowrap
                "
                aria-hidden="true"
              >
                Write a&nbsp; new task
              </span>
            )}

            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="suggestions-listbox"
              aria-autocomplete="list"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                queueMicrotask(syncCaret)
              }}
              onFocus={() => {
                setIsFocused(true)
                syncCaret()
              }}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              onKeyUp={syncCaret}
              onClick={syncCaret}
              onSelect={syncCaret}
              autoFocus
              aria-label="Write a new task"
              spellCheck={false}
              autoComplete="off"
              className="
                relative z-10 w-full h-full bg-transparent border-0
                text-[15px] leading-[24px] tracking-figma-tight
                text-text-strong-950 caret-text-strong-950
                outline-none
              "
            />
          </div>

          <SubmitButton
            active={hasText}
            onClick={handleSubmit}
            onPressStart={() => setIsPressed(true)}
            onPressEnd={() => setIsPressed(false)}
            reduceMotion={!!reduceMotion}
          />
        </div>
      </motion.div>
    </div>
  )
}

type RowProps = {
  suggestion: Suggestion
  active: boolean
  index: number
  reduceMotion: boolean
  onHover: () => void
  onSelect: () => void
}

function SuggestionRow({
  suggestion,
  active,
  index,
  reduceMotion,
  onHover,
  onSelect,
}: RowProps) {
  return (
    <motion.li
      initial={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: 4, filter: 'blur(4px)' }
      }
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{
        delay: 0.03 + index * 0.025,
        type: 'spring',
        visualDuration: 0.3,
        bounce: 0,
      }}
      className="list-none"
    >
      <button
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={onHover}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelect}
        className={[
          'w-full flex items-center gap-[10px]',
          'px-[8px] py-[6px] rounded-[10px]',
          'text-left',
          'transition-[background-color,scale] duration-150 ease-out',
          active ? 'bg-bg-weak-50' : 'bg-transparent',
          'active:scale-[0.98]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text-strong-950',
        ].join(' ')}
      >
        {suggestion.type === 'name' ? (
          <span
            aria-hidden="true"
            className="size-[28px] rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0 ring-1 ring-black/5"
            style={{ backgroundImage: avatarGradient(suggestion.value) }}
          >
            {initials(suggestion.value)}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="size-[28px] rounded-full flex items-center justify-center bg-bg-weak-50 text-text-sub-600 shrink-0 ring-1 ring-black/5"
          >
            <CalendarIcon className="size-[14px]" />
          </span>
        )}
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="block text-[14px] leading-[20px] tracking-figma-tight text-text-strong-950 truncate">
            {suggestion.value}
          </span>
          <span className="block text-[12px] leading-[16px] text-text-soft-400">
            {suggestion.type === 'name' ? 'Person' : 'Date'}
          </span>
        </span>
        {active && (
          <span
            aria-hidden="true"
            className="text-[11px] leading-none text-text-soft-400 tabular-nums shrink-0 pr-[2px]"
          >
            ↵
          </span>
        )}
      </button>
    </motion.li>
  )
}

type SubmitButtonProps = {
  active: boolean
  onClick: () => void
  onPressStart: () => void
  onPressEnd: () => void
  reduceMotion: boolean
}

function SubmitButton({
  active,
  onClick,
  onPressStart,
  onPressEnd,
  reduceMotion,
}: SubmitButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onPointerDown={onPressStart}
      onPointerUp={onPressEnd}
      onPointerLeave={onPressEnd}
      onPointerCancel={onPressEnd}
      disabled={!active}
      aria-label="Send"
      whileTap={active && !reduceMotion ? { scale: 0.92 } : undefined}
      animate={{ backgroundColor: active ? '#171717' : '#f7f7f7' }}
      transition={{ duration: 0.2, ease: EASE_CONTEXTUAL }}
      className="
        relative shrink-0
        flex items-center justify-center
        w-[28px] h-[28px] rounded-[9px]
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-strong-950
        before:absolute before:inset-[-6px] before:content-['']
      "
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <motion.span
        aria-hidden="true"
        className="block w-[20px] h-[20px] flex items-center justify-center"
        animate={{ color: active ? '#ffffff' : '#a3a3a3' }}
        transition={{ duration: 0.18, ease: EASE_CONTEXTUAL }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={active ? 'on' : 'off'}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }
            }
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }
            }
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            className="block w-[12px] h-[12px]"
          >
            <ArrowUpIcon className="w-[12px] h-[12px]" />
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </motion.button>
  )
}
