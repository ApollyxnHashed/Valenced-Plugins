// Pure logic (no React Native or Discord APIs), so it can be tested in Node.

export type Style = 'hybrid' | 'clock' | 'words'

export interface Reading {
	phase: 'future' | 'past'
	/** future: seconds remaining (>= 1). past: seconds elapsed (>= 0). */
	seconds: number
}

/**
 * Always computed from the real current time (nowMs) and the original target.
 * Never decrements a counter, so timer delays or suspension cause no drift.
 */
export function read(targetMs: number, nowMs: number): Reading {
	const diff = targetMs - nowMs
	if (diff > 0) return { phase: 'future', seconds: Math.ceil(diff / 1000) }
	return { phase: 'past', seconds: Math.floor(-diff / 1000) }
}

const pad = (n: number) => String(n).padStart(2, '0')

export type Unit = 'day' | 'hour' | 'minute' | 'second'

export interface Strings {
	/** e.g. "4 minutes" */
	unit(n: number, unit: Unit): string
	/** e.g. "4 minutes and 59 seconds" */
	join(parts: string[]): string
	/** e.g. "in 4 minutes" */
	future(text: string): string
	/** e.g. "4 minutes ago" */
	past(text: string): string
	/** Text for zero elapsed in the "words" style */
	now: string
}

type Pair = [string, string]

interface TableEntry {
	and: string
	inPrefix: string
	agoText(text: string): string
	now: string
	units: Record<Unit, Pair>
}

const EN_TABLE: TableEntry = {
	and: ' and ',
	inPrefix: 'in ',
	agoText: t => `${t} ago`,
	now: 'now',
	units: { day: ['day', 'days'], hour: ['hour', 'hours'], minute: ['minute', 'minutes'], second: ['second', 'seconds'] },
}

// Fallback tables, used only if the device has no working Intl API.
const TABLES: Record<string, TableEntry> = {
	pt: {
		and: ' e ',
		inPrefix: 'em ',
		agoText: t => `há ${t}`,
		now: 'agora',
		units: { day: ['dia', 'dias'], hour: ['hora', 'horas'], minute: ['minuto', 'minutos'], second: ['segundo', 'segundos'] },
	},
	es: {
		and: ' y ',
		inPrefix: 'en ',
		agoText: t => `hace ${t}`,
		now: 'ahora',
		units: { day: ['día', 'días'], hour: ['hora', 'horas'], minute: ['minuto', 'minutos'], second: ['segundo', 'segundos'] },
	},
	fr: {
		and: ' et ',
		inPrefix: 'dans ',
		agoText: t => `il y a ${t}`,
		now: 'maintenant',
		units: { day: ['jour', 'jours'], hour: ['heure', 'heures'], minute: ['minute', 'minutes'], second: ['seconde', 'secondes'] },
	},
	de: {
		and: ' und ',
		inPrefix: 'in ',
		agoText: t => `vor ${t}`,
		now: 'jetzt',
		units: { day: ['Tag', 'Tagen'], hour: ['Stunde', 'Stunden'], minute: ['Minute', 'Minuten'], second: ['Sekunde', 'Sekunden'] },
	},
	it: {
		and: ' e ',
		inPrefix: 'tra ',
		agoText: t => `${t} fa`,
		now: 'adesso',
		units: { day: ['giorno', 'giorni'], hour: ['ora', 'ore'], minute: ['minuto', 'minuti'], second: ['secondo', 'secondi'] },
	},
}

function fromTable(t: TableEntry): Strings {
	return {
		unit: (n, u) => `${n} ${n === 1 ? t.units[u][0] : t.units[u][1]}`,
		join: parts => parts.join(t.and),
		future: text => t.inPrefix + text,
		past: text => t.agoText(text),
		now: t.now,
	}
}

const NUMERIC = new Set(['integer', 'group', 'decimal', 'fraction'])

/**
 * Builds the strings from the built-in Intl API, so every language Intl knows
 * works. Throws if the engine lacks one of the pieces; the caller then falls back.
 */
function intlStrings(locale: string): Strings {
	// Learns the words around the number from RelativeTimeFormat, e.g. "in " / " ago".
	const wrap = (sign: 1 | -1): Pair => {
		const parts = new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).formatToParts(sign * 2, 'second')
		const first = parts.findIndex(p => NUMERIC.has(p.type))
		let last = parts.length - 1
		while (last >= 0 && !NUMERIC.has(parts[last].type)) last--
		if (first < 0 || last < first) throw new Error('no number in relative format')
		const clean = (v: string) => v.replace(/\s/g, ' ') // non-breaking spaces count as spaces
		const pre = clean(parts.slice(0, first).map(p => p.value).join(''))
		let post = clean(parts.slice(last + 1).map(p => p.value).join(''))
		// The unit noun is supplied by our own unit formatter, so strip it here.
		const noun = clean(
			new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'long' })
				.formatToParts(2)
				.filter(p => !NUMERIC.has(p.type))
				.map(p => p.value)
				.join(''),
		).trim()
		if (noun) post = post.split(noun).join('').replace(/ {2,}/g, ' ')
		const body = post.trim()
		post = body === '' ? '' : (post.startsWith(' ') ? ' ' : '') + body
		return [pre, post]
	}

	const [fPre, fPost] = wrap(1)
	const [pPre, pPost] = wrap(-1)
	const formatters = new Map<Unit, Intl.NumberFormat>()
	const unitFormat = (u: Unit) => {
		let f = formatters.get(u)
		if (!f) {
			f = new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'long' })
			formatters.set(u, f)
		}
		return f
	}
	const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
	const now = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second')

	return {
		unit: (n, u) => unitFormat(u).format(n),
		join: parts => list.format(parts),
		future: text => fPre + text + fPost,
		past: text => pPre + text + pPost,
		now,
	}
}

/**
 * Picks the strings for a device locale such as "pt-BR" or "de_DE".
 * Uses Intl when available, otherwise the fallback tables, otherwise English.
 */
export function resolveStrings(locale?: string, useIntl = true): Strings {
	if (useIntl && locale && typeof Intl !== 'undefined') {
		try {
			return intlStrings(locale)
		} catch {
			// engine lacks part of Intl: use the tables below
		}
	}
	const code = (locale ?? '').slice(0, 2).toLowerCase()
	return fromTable(TABLES[code] ?? EN_TABLE)
}

const EN: Strings = fromTable(EN_TABLE)


function clock(seconds: number): string {
	const d = Math.floor(seconds / 86400)
	const h = Math.floor((seconds % 86400) / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	const s = seconds % 60
	if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
	if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
	return `${pad(m)}:${pad(s)}`
}

function words(seconds: number, S: Strings): string {
	const d = Math.floor(seconds / 86400)
	const h = Math.floor((seconds % 86400) / 3600)
	const m = Math.floor((seconds % 3600) / 60)
	const s = seconds % 60

	let parts: string[]
	if (d > 0) parts = [S.unit(d, 'day'), ...(h ? [S.unit(h, 'hour')] : [])]
	else if (h > 0) parts = [S.unit(h, 'hour'), ...(m ? [S.unit(m, 'minute')] : [])]
	else if (m > 0) parts = [S.unit(m, 'minute'), ...(s ? [S.unit(s, 'second')] : [])]
	else parts = [S.unit(s, 'second')]
	return S.join(parts)
}

/** Full text, replacing the native relative text of the R format. */
export function formatRelative(r: Reading, style: Style, S: Strings = EN): string {
	if (r.phase === 'future') {
		if (style === 'clock') return clock(r.seconds)
		if (style === 'hybrid' && r.seconds < 60) return clock(r.seconds)
		return S.future(words(r.seconds, S))
	}
	// Past: 0 seconds elapsed = the exact moment of the event.
	if (r.seconds === 0) return style === 'words' ? S.now : '00:00'
	return S.past(words(r.seconds, S))
}

/** Countdown only (suffix for t/T/d/D/f/F). Empty when there is no countdown. */
export function formatCountdown(r: Reading, style: Style, S: Strings = EN): string {
	if (r.phase !== 'future') return ''
	if (style === 'words') return words(r.seconds, S)
	return clock(r.seconds)
}

/** Past events beyond this window revert to the native text. */
export const PAST_LIVE_WINDOW_S = 3600

export function isLive(r: Reading): boolean {
	return r.phase === 'future' || r.seconds < PAST_LIVE_WINDOW_S
}

export type TickFn = (nowMs: number) => void

/**
 * Central clock: ONE timer for all visible timestamps.
 * Fires at the start of each wall-clock second (targets are whole seconds,
 * so the text changes exactly on the boundary) and recalculates everything
 * from Date.now() on every fire.
 */
export class Ticker {
	private subs = new Set<TickFn>()
	private timer: ReturnType<typeof setTimeout> | undefined

	constructor(
		private now: () => number = Date.now,
		private setT: (fn: () => void, ms: number) => any = setTimeout,
		private clearT: (h: any) => void = clearTimeout,
	) {}

	get size() {
		return this.subs.size
	}

	subscribe(fn: TickFn): () => void {
		this.subs.add(fn)
		if (this.subs.size === 1) this.arm()
		return () => {
			this.subs.delete(fn)
			if (this.subs.size === 0) this.disarm()
		}
	}

	/** Recalculate now (e.g. the app came back from the background). */
	poke() {
		if (this.subs.size === 0) return
		this.arm()
		this.run()
	}

	clear() {
		this.subs.clear()
		this.disarm()
	}

	private arm() {
		this.disarm()
		const n = this.now()
		// Next second boundary + 3 ms of margin against firing early.
		this.timer = this.setT(() => this.tick(), 1000 - (n % 1000) + 3)
	}

	private disarm() {
		if (this.timer !== undefined) this.clearT(this.timer)
		this.timer = undefined
	}

	private tick() {
		this.timer = undefined
		if (this.subs.size === 0) return
		this.arm() // reschedule first, so an error in a subscriber can't stop the clock
		this.run()
	}

	private run() {
		const n = this.now()
		for (const fn of [...this.subs]) {
			try {
				fn(n)
			} catch {
				// one broken timestamp must not affect the others
			}
		}
	}
}
