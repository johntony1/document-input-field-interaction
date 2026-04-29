import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowUpIcon } from './ArrowUpIcon'
import { CloseLineIcon } from './CloseLineIcon'
import { ImageIcon } from './ImageIcon'

/* ─────────────────────────────────────────────────────────
 * STORYBOARD — input with trigger-word + slash-command + attachment
 *
 *   type "/"     slash menu opens (the only entry: /file)
 *   accept /file → file picker opens
 *   pick image  → tile mounts (scale 0.85→1, blur 8→0, spring)
 *   uploading   → progressive blur clears (12→0), saturation 30→100,
 *                 shimmer sweep on top, ring fills clockwise
 *   ready       → ring morphs into close button (popLayout, spring),
 *                 shimmer fades, image fully visible
 *   close       → tile collapses (scale 0.85, opacity 0, blur 6, 180ms)
 *
 *   Token highlight (blue) for accepted name/date suggestions still
 *   handled via mirror overlay on a transparent-text input.
 * ───────────────────────────────────────────────────────── */

const SPRING_CARD = { type: 'spring' as const, visualDuration: 0.4, bounce: 0.16 }
const SPRING_DROP = { type: 'spring' as const, visualDuration: 0.28, bounce: 0 }
const SPRING_TILE = { type: 'spring' as const, visualDuration: 0.42, bounce: 0.18 }
const SPRING_POP = { type: 'spring' as const, visualDuration: 0.32, bounce: 0.32 }
const EASE_CONTEXTUAL = [0.2, 0, 0, 1] as const

const MIN_TRIGGER_LEN = 2
const MAX_RESULTS = 6
const TOKEN_COLOR = '#2563eb'
const UPLOAD_DURATION_MS = 1400

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

const RELATIVE_DATES = [
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
] as const

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(d: Date) {
  return `${DAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function resolveDate(term: string): Date | null {
  const t = term.toLowerCase()
  const now = new Date()
  if (
    t === 'today' || t === 'tonight' ||
    t === 'this morning' || t === 'this afternoon' || t === 'this evening'
  ) return now
  if (t === 'tomorrow') return addDays(now, 1)
  if (t === 'yesterday') return addDays(now, -1)
  if (t === 'this weekend') {
    const day = now.getDay()
    const offset = (6 - day + 7) % 7 || 7
    return addDays(now, offset)
  }
  if (t === 'next week') return addDays(now, 7)
  if (t === 'next month') return new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const idx = DAY_NAMES.findIndex((n) => n.toLowerCase() === t)
  if (idx !== -1) {
    const day = now.getDay()
    const offset = (idx - day + 7) % 7 || 7
    return addDays(now, offset)
  }
  return null
}

type Suggestion = {
  type: 'name' | 'date' | 'command'
  key: string
  label: string
  hint?: string
  insert?: string
  command?: 'file'
}

const SLASH_COMMANDS: Suggestion[] = [
  {
    type: 'command',
    key: 'cmd-file',
    label: '/file',
    hint: 'Attach image',
    command: 'file',
  },
]

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
  if (word.startsWith('/')) {
    const w = word.slice(1).toLowerCase()
    return SLASH_COMMANDS.filter((c) => (c.command ?? '').startsWith(w))
  }
  if (word.length < MIN_TRIGGER_LEN) return []
  const startsUpper = /^[A-Z]/.test(word)
  const w = word.toLowerCase()

  if (startsUpper) {
    const names: Suggestion[] = NAMES
      .filter((n) => n.toLowerCase().split(/\s+/).some((part) => part.startsWith(w)))
      .map((n) => ({ type: 'name', key: `name-${n}`, insert: n, label: n }))
    const properDates: Suggestion[] = DAY_NAMES
      .filter((d) => d.toLowerCase().startsWith(w))
      .map((d) => {
        const r = resolveDate(d)
        const f = r ? formatDate(r) : d
        return { type: 'date', key: `date-${d}`, insert: f, label: d, hint: f }
      })
    return [...names, ...properDates].slice(0, MAX_RESULTS)
  }

  const relativeDates: Suggestion[] = RELATIVE_DATES
    .filter((d) => d.startsWith(w))
    .map((d) => {
      const r = resolveDate(d)
      const f = r ? formatDate(r) : d
      return { type: 'date', key: `date-${d}`, insert: f, label: d, hint: f }
    })
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

/* ─── Token system ────────────────────────────────────────── */

type Token = {
  id: string
  type: 'name' | 'date'
  value: string
  start: number
}

let tokenIdSeq = 0
const newTokenId = () => `t${++tokenIdSeq}`

function diffEdit(prev: string, next: string) {
  let i = 0
  const minLen = Math.min(prev.length, next.length)
  while (i < minLen && prev[i] === next[i]) i++
  let j = 0
  const maxJ = Math.min(prev.length - i, next.length - i)
  while (j < maxJ && prev[prev.length - 1 - j] === next[next.length - 1 - j]) j++
  return {
    start: i,
    deleted: prev.length - i - j,
    inserted: next.length - i - j,
  }
}

function shiftTokens(
  tokens: Token[],
  edit: { start: number; deleted: number; inserted: number },
): Token[] {
  const editEnd = edit.start + edit.deleted
  const delta = edit.inserted - edit.deleted
  const out: Token[] = []
  for (const t of tokens) {
    const tEnd = t.start + t.value.length
    if (editEnd <= t.start) {
      out.push({ ...t, start: t.start + delta })
    } else if (edit.start >= tEnd) {
      out.push(t)
    }
  }
  return out
}

type Segment = { text: string; token?: Token }

function buildSegments(text: string, tokens: Token[]): Segment[] {
  const valid = tokens
    .filter((t) => text.slice(t.start, t.start + t.value.length) === t.value)
    .sort((a, b) => a.start - b.start)
  const segs: Segment[] = []
  let i = 0
  for (const t of valid) {
    if (t.start < i) continue
    if (t.start > i) segs.push({ text: text.slice(i, t.start) })
    segs.push({ text: t.value, token: t })
    i = t.start + t.value.length
  }
  if (i < text.length) segs.push({ text: text.slice(i) })
  return segs
}

/* ─── Attachment state ────────────────────────────────────── */

type Attachment = {
  id: string
  url: string
  status: 'uploading' | 'ready'
  progress: number
}

let attachmentIdSeq = 0
const newAttachmentId = () => `a${++attachmentIdSeq}`

export function ChatInput() {
  const [value, setValue] = useState('')
  const [tokens, setTokens] = useState<Token[]>([])
  const [caret, setCaret] = useState(0)
  const [isFocused, setIsFocused] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [wrapperHeight, setWrapperHeight] = useState(24)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadFrameRef = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()
  const hasText = value.trim().length > 0

  const currentWord = useMemo(
    () => getCurrentWord(value, caret),
    [value, caret],
  )

  const suggestions = useMemo(() => {
    if (!isFocused || dismissed) return []
    return findSuggestions(currentWord.word)
  }, [currentWord.word, isFocused, dismissed])

  const showDropdown = suggestions.length > 0

  const segments = useMemo(() => buildSegments(value, tokens), [value, tokens])

  useEffect(() => {
    setActiveIdx(0)
  }, [suggestions.length, currentWord.word])

  useEffect(() => {
    setDismissed(false)
  }, [currentWord.word])

  useEffect(() => () => {
    if (uploadFrameRef.current) cancelAnimationFrame(uploadFrameRef.current)
  }, [])

  // Measure mirror's natural content height and drive the wrapper height.
  // Using ResizeObserver makes this robust to width changes (window resize)
  // as well as content changes — and fires a single update per layout pass,
  // so the CSS transition on .t-resize tweens cleanly between values.
  useLayoutEffect(() => {
    const el = mirrorRef.current
    if (!el) return
    const measure = () => {
      const next = Math.min(250, Math.max(24, el.offsetHeight))
      setWrapperHeight((prev) => (prev === next ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const syncMirrorScroll = useCallback(() => {
    const el = textareaRef.current
    if (el) setScrollTop(el.scrollTop)
  }, [])

  const syncCaret = useCallback(() => {
    const el = textareaRef.current
    if (el) setCaret(el.selectionStart ?? 0)
    syncMirrorScroll()
  }, [syncMirrorScroll])

  const handleChange = useCallback(
    (next: string) => {
      const edit = diffEdit(value, next)
      setValue(next)
      setTokens((toks) => shiftTokens(toks, edit))
      queueMicrotask(syncCaret)
    },
    [value, syncCaret],
  )

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const beginUpload = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    if (uploadFrameRef.current) cancelAnimationFrame(uploadFrameRef.current)
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    const url = URL.createObjectURL(file)
    const id = newAttachmentId()
    setAttachment({ id, url, status: 'uploading', progress: 0 })
    const start = performance.now()
    const tick = () => {
      const elapsed = performance.now() - start
      const p = Math.min(1, elapsed / UPLOAD_DURATION_MS)
      // Slight ease-out so progress feels responsive at the start
      const eased = 1 - Math.pow(1 - p, 1.6)
      const pct = Math.round(eased * 100)
      setAttachment((prev) => {
        if (!prev || prev.id !== id) return prev
        if (p >= 1) return { ...prev, progress: 100, status: 'ready' }
        return { ...prev, progress: pct }
      })
      if (p < 1) {
        uploadFrameRef.current = requestAnimationFrame(tick)
      } else {
        uploadFrameRef.current = null
      }
    }
    uploadFrameRef.current = requestAnimationFrame(tick)
  }, [])

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (file) beginUpload(file)
    },
    [beginUpload],
  )

  const removeAttachment = useCallback(() => {
    if (uploadFrameRef.current) {
      cancelAnimationFrame(uploadFrameRef.current)
      uploadFrameRef.current = null
    }
    setAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }, [])

  const acceptSuggestion = useCallback(
    (s: Suggestion) => {
      const { start, end } = currentWord

      if (s.type === 'command') {
        // Strip the slash text entirely; commands don't insert text.
        const next = value.slice(0, start) + value.slice(end)
        const edit = diffEdit(value, next)
        const shifted = shiftTokens(tokens, edit)
        setValue(next)
        setTokens(shifted)
        setDismissed(true)
        requestAnimationFrame(() => {
          const el = textareaRef.current
          if (el) {
            el.focus()
            el.setSelectionRange(start, start)
          }
          setCaret(start)
          setDismissed(false)
          syncMirrorScroll()
          if (s.command === 'file') openFilePicker()
        })
        return
      }

      const insert = s.insert ?? s.label
      const next = value.slice(0, start) + insert + ' ' + value.slice(end)
      const nextCaret = start + insert.length + 1
      const edit = diffEdit(value, next)
      const shifted = shiftTokens(tokens, edit)
      const newToken: Token = {
        id: newTokenId(),
        type: s.type,
        value: insert,
        start,
      }
      setValue(next)
      setTokens([...shifted, newToken])
      setDismissed(true)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(nextCaret, nextCaret)
        setCaret(nextCaret)
        setDismissed(false)
        syncMirrorScroll()
      })
    },
    [currentWord, value, tokens, syncMirrorScroll, openFilePicker],
  )

  const handleSubmit = useCallback(() => {
    const canSubmit = hasText || !!attachment
    if (!canSubmit) return
    setValue('')
    setTokens([])
    setScrollTop(0)
    if (attachment) {
      URL.revokeObjectURL(attachment.url)
      setAttachment(null)
    }
    textareaRef.current?.focus()
  }, [hasText, attachment])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  const submitActive = hasText || (!!attachment && attachment.status === 'ready')

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
                : { opacity: 0, y: -8, filter: 'blur(6px)', scale: 0.98 }
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
                    y: 2,
                    filter: 'blur(4px)',
                    scale: 0.99,
                    transition: { duration: 0.18, ease: EASE_CONTEXTUAL },
                  }
            }
            transition={SPRING_DROP}
            style={{ transformOrigin: 'top center' }}
            className="
              absolute top-[calc(100%+8px)] left-0
              w-[260px] max-w-full
              bg-white rounded-[12px] shadow-figma-card-focus
              p-[5px] z-20
            "
          >
            <ul className="flex flex-col gap-[1px]">
              {suggestions.map((s, i) => (
                <SuggestionRow
                  key={s.key}
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
        onClick={() => textareaRef.current?.focus()}
      >
        <div className="flex flex-col">
          <AnimatePresence initial={false}>
            {attachment && (
              <motion.div
                key={attachment.id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
                }}
                className="overflow-hidden"
              >
                <div className="pb-[14px] flex items-start gap-[8px]">
                  <AttachmentTile
                    attachment={attachment}
                    onRemove={removeAttachment}
                    reduceMotion={!!reduceMotion}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-[8px] w-full">
            {/* Auto-growing text area. The mirror sits in normal flow and is
             * measured via ResizeObserver; its height drives the wrapper's
             * explicit height value, so a CSS `height` transition (.t-resize)
             * tweens between sizes for a smooth card resize. */}
            <div
              className="relative flex-1 min-w-0 overflow-hidden t-resize"
              style={{ height: `${wrapperHeight}px` }}
            >
              {!hasText && (
                <span
                  className="
                    absolute top-0 left-[4px]
                    text-[15px] leading-[24px] tracking-figma-tight
                    text-text-soft-400 select-none pointer-events-none
                    whitespace-pre
                  "
                  aria-hidden="true"
                >
                  Write a&nbsp; new task
                </span>
              )}

              {/* Mirror — in flow, source of truth for content height.
               * Translated vertically to follow the textarea's scrollTop
               * once content exceeds 250px. */}
              <div
                style={{
                  transform: `translate3d(0, ${-scrollTop}px, 0)`,
                  willChange: 'transform',
                }}
              >
                <div
                  ref={mirrorRef}
                  aria-hidden="true"
                  className="
                    whitespace-pre-wrap break-words px-[4px]
                    text-[15px] leading-[24px] tracking-figma-tight
                    text-text-strong-950 min-h-[24px]
                  "
                >
                  {segments.map((seg, i) =>
                    seg.token ? (
                      <span key={i} style={{ color: TOKEN_COLOR }}>
                        {seg.text}
                      </span>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )}
                  {/* Trailing newline guard: pre-wrap collapses a sole final
                   * \n, so append a zero-width space to preserve the blank
                   * line and keep the wrapper sized correctly. */}
                  {value.endsWith('\n') && '​'}
                </div>
              </div>

              <textarea
                ref={textareaRef}
                rows={1}
                role="combobox"
                aria-expanded={showDropdown}
                aria-controls="suggestions-listbox"
                aria-autocomplete="list"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => {
                  setIsFocused(true)
                  syncCaret()
                }}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                onKeyUp={syncCaret}
                onClick={syncCaret}
                onSelect={syncCaret}
                onScroll={syncMirrorScroll}
                autoFocus
                aria-label="Write a new task"
                spellCheck={false}
                autoComplete="off"
                className="
                  absolute inset-0 z-10 w-full h-full bg-transparent border-0
                  px-[4px] py-0 m-0 resize-none
                  text-[15px] leading-[24px] tracking-figma-tight
                  outline-none whitespace-pre-wrap break-words
                  [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                  overflow-y-auto overflow-x-hidden
                "
                style={{
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                  caretColor: '#0a0a0a',
                }}
              />
            </div>

            <SubmitButton
              active={submitActive}
              onClick={handleSubmit}
              onPressStart={() => setIsPressed(true)}
              onPressEnd={() => setIsPressed(false)}
              reduceMotion={!!reduceMotion}
            />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </motion.div>
    </div>
  )
}

/* ─── Attachment tile ─────────────────────────────────────── */

type AttachmentTileProps = {
  attachment: Attachment
  onRemove: () => void
  reduceMotion: boolean
}

function AttachmentTile({ attachment, onRemove, reduceMotion }: AttachmentTileProps) {
  const isUploading = attachment.status === 'uploading'
  const p = attachment.progress
  // Progressive reveal — reduces from 12px blur and 0.3 saturation toward clean image as upload progresses.
  const blurPx = isUploading ? Math.max(0, (100 - p) * 0.12) : 0
  const sat = isUploading ? 0.3 + (p / 100) * 0.7 : 1

  return (
    <motion.div
      initial={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: -4, scale: 0.85, filter: 'blur(8px)' }
      }
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              y: -4,
              scale: 0.85,
              filter: 'blur(6px)',
              transition: { duration: 0.18, ease: EASE_CONTEXTUAL },
            }
      }
      transition={SPRING_TILE}
      className="relative shrink-0 size-[40px]"
    >
      {/* Skeleton placeholder beneath the image */}
      <div
        className="absolute inset-0 rounded-[4px] overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, #f0f0f0 0%, #f7f7f7 50%, #ededed 100%)',
        }}
      />

      {/* Image with progressive blur/saturation reveal */}
      <div
        className="absolute inset-0 rounded-[4px] overflow-hidden"
        style={{
          filter: reduceMotion
            ? 'none'
            : `blur(${blurPx}px) saturate(${sat})`,
          transition: 'filter 80ms linear',
          willChange: 'filter',
        }}
      >
        <img
          src={attachment.url}
          alt=""
          className="absolute inset-0 size-full object-cover pointer-events-none select-none"
          draggable={false}
        />
      </div>

      {/* Shimmer sweep during upload */}
      <AnimatePresence>
        {isUploading && !reduceMotion && (
          <motion.div
            key="shimmer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.25, ease: EASE_CONTEXTUAL }}
            className="absolute inset-0 rounded-[4px] overflow-hidden pointer-events-none"
          >
            <motion.div
              className="absolute inset-y-[-20%] w-[55%]"
              style={{
                background:
                  'linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)',
                filter: 'blur(2px)',
              }}
              initial={{ x: '-90%' }}
              animate={{ x: '180%' }}
              transition={{
                duration: 1.05,
                ease: 'linear',
                repeat: Infinity,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top-right indicator: progress ring (uploading) → close button (ready) */}
      <div className="absolute -top-[2px] -right-[3px] w-[10px] h-[10px]">
        <AnimatePresence mode="popLayout" initial={false}>
          {isUploading ? (
            <motion.div
              key="prog"
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }
              }
              transition={SPRING_POP}
              className="block size-[10px]"
            >
              <ProgressRing progress={p} />
            </motion.div>
          ) : (
            <motion.button
              key="close"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              aria-label="Remove image"
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={
                reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }
              }
              transition={SPRING_POP}
              whileTap={!reduceMotion ? { scale: 0.85 } : undefined}
              className="
                size-[10px] rounded-full bg-[#262626]
                flex items-center justify-center
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-strong-950
              "
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <CloseLineIcon className="w-[5px] h-[5px] text-white" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function ProgressRing({ progress }: { progress: number }) {
  const r = 3.4
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, progress))
  const offset = c * (1 - clamped / 100)
  return (
    <svg viewBox="0 0 10 10" className="block size-full" aria-hidden="true">
      <circle cx="5" cy="5" r="5" fill="#262626" />
      <circle
        cx="5"
        cy="5"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1"
      />
      <circle
        cx="5"
        cy="5"
        r={r}
        fill="none"
        stroke="white"
        strokeWidth="1"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 5 5)"
        style={{ transition: 'stroke-dashoffset 80ms linear' }}
      />
    </svg>
  )
}

/* ─── Suggestion row ──────────────────────────────────────── */

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
          : { opacity: 0, y: -4, filter: 'blur(4px)' }
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
          'px-[8px] py-[5px] rounded-[8px]',
          'text-left',
          'transition-colors duration-150 ease-out',
          active ? 'bg-bg-weak-50' : 'bg-transparent',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-text-strong-950',
        ].join(' ')}
      >
        {suggestion.type === 'name' ? (
          <span
            aria-hidden="true"
            className="size-[20px] rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0 ring-1 ring-black/5"
            style={{ backgroundImage: avatarGradient(suggestion.label) }}
          >
            {initials(suggestion.label)}
          </span>
        ) : suggestion.type === 'date' ? (
          <span
            aria-hidden="true"
            className="size-[20px] rounded-full flex items-center justify-center bg-bg-weak-50 text-text-sub-600 shrink-0 ring-1 ring-black/5"
          >
            <CalendarIcon className="size-[11px]" />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="size-[20px] rounded-full flex items-center justify-center bg-bg-weak-50 text-text-sub-600 shrink-0 ring-1 ring-black/5"
          >
            <ImageIcon className="size-[11px]" />
          </span>
        )}
        <span className="flex-1 min-w-0 text-[13px] leading-[18px] tracking-figma-tight text-text-strong-950 truncate">
          {suggestion.label}
        </span>
        {suggestion.hint && (
          <span className="text-[12px] leading-[16px] text-text-soft-400 tabular-nums shrink-0">
            {suggestion.hint}
          </span>
        )}
      </button>
    </motion.li>
  )
}

/* ─── Submit button ───────────────────────────────────────── */

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
