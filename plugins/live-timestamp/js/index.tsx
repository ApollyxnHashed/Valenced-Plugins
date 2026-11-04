import { getModules } from '@valenced/modules/finders'
import { createFilterGenerator } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { useEffect, useState, isValidElement } from 'react'
import { AppState } from 'react-native'
import { Ticker, formatCountdown, formatRelative, isLive, read, resolveStrings } from './core'
import type { Strings } from './core'
import { firstString, replaceFirstString } from './element'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { ReactElement } from 'react'
import type { Settings } from './shared'

// ---------------------------------------------------------------------------
// Plugin state
// ---------------------------------------------------------------------------

let storage: JsonStorage<Settings>
let log: { info(...a: any[]): void; warn(...a: any[]): void }
let anyPatched = false
const ticker = new Ticker()
const patchedRules = new WeakSet<object>()
const warned = new Set<string>()

function deviceStrings(): Strings {
	try {
		return resolveStrings(new Intl.DateTimeFormat().resolvedOptions().locale)
	} catch {
		return resolveStrings(undefined)
	}
}
const strings = deviceStrings()

const settingsNow = (): Settings => ({
	...DefaultSettings,
	...(storage?.cache as Partial<Settings> | undefined),
})

// ---------------------------------------------------------------------------
// Finding Discord's "timestamp" markdown rule (INTERNAL / UNSTABLE)
//
// Discord renders <t:123:R> through a simple-markdown rule
// ({ match, parse, react|render }) registered under the key "timestamp".
// There is no known stable module name, so we search by the SHAPE of the
// rule (data properties only, without triggering getters or lazy init).
// ---------------------------------------------------------------------------

interface Rule {
	match: unknown
	parse: unknown
	react?: unknown
	render?: unknown
}

function isRule(x: any): x is Rule {
	return (
		!!x &&
		typeof x === 'object' &&
		typeof x.match === 'function' &&
		typeof x.parse === 'function' &&
		(typeof x.react === 'function' || typeof x.render === 'function')
	)
}

function dataProp(obj: any, key: string): unknown {
	if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return
	const d = Object.getOwnPropertyDescriptor(obj, key)
	return d && 'value' in d ? d.value : undefined
}

function timestampRuleIn(obj: unknown): Rule | undefined {
	const v = dataProp(obj, 'timestamp')
	return isRule(v) ? v : undefined
}

function findTimestampRule(exports: unknown): Rule | undefined {
	try {
		const direct =
			timestampRuleIn(exports) ?? timestampRuleIn(dataProp(exports, 'default'))
		if (direct) return direct
		if (!exports || typeof exports !== 'object') return
		// one level down: { defaultRules: { timestamp } }, { rules: {...} }, ...
		const keys = Object.keys(exports).slice(0, 40)
		for (const k of keys) {
			const r = timestampRuleIn(dataProp(exports, k))
			if (r) return r
		}
	} catch {
		// unusual export: ignore it
	}
}

// If you change the logic of this filter, bump the "v1" in the key (the cache persists).
const withTimestampRule = createFilterGenerator<[]>(
	(_args, _id, exports) => !!exports && !!findTimestampRule(exports),
	() => 'axonyum.live-timestamp.rules.v1',
)

// ---------------------------------------------------------------------------
// Component: replaces the native text and subscribes to the central clock
// ---------------------------------------------------------------------------

interface LiveProps {
	original: ReactElement
	targetMs: number
	format: string
}

function compute(
	original: ReactElement,
	targetMs: number,
	format: string,
	nowMs: number,
): string | null {
	const s = settingsNow()
	if (!s.enabled) return null
	const reading = read(targetMs, nowMs)
	if (!isLive(reading)) return null

	if (format === 'R') return formatRelative(reading, s.style, strings)

	if (!s.otherFormats) return null
	const countdown = formatCountdown(reading, s.style, strings)
	if (!countdown) return null
	const base = firstString(original)
	return base ? `${base} · ${countdown}` : null
}

function LiveTimestamp({ original, targetMs, format }: LiveProps) {
	const [text, setText] = useState<string | null>(() =>
		compute(original, targetMs, format, Date.now()),
	)

	useEffect(() => {
		let unsub: (() => void) | undefined
		const update = (now: number) => {
			const next = compute(original, targetMs, format, now)
			setText(next) // same string = React skips the render
			// outside the window or disabled: the clock is no longer needed
			if (next === null) unsub?.()
		}
		update(Date.now()) // sync on mount and on return
		unsub = ticker.subscribe(update)
		const off = storage?.subscribe(() => update(Date.now()))
		return () => {
			unsub?.()
			off?.()
		}
	}, [original, targetMs, format])

	if (text === null) return original
	return replaceFirstString(original, text).node as ReactElement
}

// ---------------------------------------------------------------------------
// Rule patch
// ---------------------------------------------------------------------------

function wrap(result: unknown, node: any): unknown {
	if (!isValidElement(result)) return result
	let ts = Number(node?.timestamp)
	if (!Number.isFinite(ts)) {
		if (!warned.has('shape')) {
			warned.add('shape')
			log.warn(
				'timestamp node has an unexpected shape, keys:',
				node && typeof node === 'object' ? Object.keys(node) : typeof node,
			)
		}
		return result
	}
	if (ts > 1e11) ts /= 1000 // already in milliseconds
	const format = typeof node.format === 'string' ? node.format : 'f'
	return (
		<LiveTimestamp
			key={result.key ?? undefined}
			original={result}
			targetMs={ts * 1000}
			format={format}
		/>
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, logger }) {
		storage = jsonStorage
		log = logger as typeof log

		// Came back from the background: recalculate now, from the real clock.
		const appState = AppState.addEventListener('change', state => {
			if (state === 'active') ticker.poke()
		})

		const patchRule = (rule: Rule) => {
			if (patchedRules.has(rule)) return
			patchedRules.add(rule)
			anyPatched = true
			for (const key of ['react', 'render'] as const) {
				if (typeof rule[key] !== 'function') continue
				cleanup(
					instead(rule as any, key, function (this: unknown, args: any[], original: any) {
						const result = Reflect.apply(original, this, args)
						try {
							return wrap(result, args[0])
						} catch (e) {
							log.warn('failed to wrap timestamp:', e)
							return result
						}
					}),
				)
				log.info(`"timestamp" rule intercepted (${key})`)
			}
		}

		cleanup(
			() => appState.remove(),
			() => ticker.clear(),
			getModules(
				withTimestampRule(),
				module => {
					const rule = findTimestampRule(module)
					if (rule) patchRule(rule)
				},
				{ returnNamespace: true, max: Number.POSITIVE_INFINITY },
			),
		)

		// Diagnostics: if nothing was found, warn in the Debug Logs.
		const t = setTimeout(() => {
			if (!anyPatched)
				log.warn(
					'"timestamp" markdown rule NOT found; countdown inactive. Please send these logs.',
				)
		}, 30_000)
		cleanup(() => clearTimeout(t))
	},
	SettingsComponent,
})
