import { Design } from '@valenced/discord/design'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { TextInput } from 'react-native'
import type { ElementType } from 'react'

export interface JsEntry {
	source: string
	firstMs: number
	lastMs: number
	count: number
	props: Record<string, string | number | boolean | null>
	propKeys: string[]
	valueLength: number | null
	stack: string[]
	patched: boolean
}

// Never record what the user typed
const HiddenProps = new Set(['value', 'defaultValue', 'text', 'children'])
const MaxEntries = 100

const entries = new Map<string, JsEntry>()
let dropped = 0

export const getJsEntries = () => [...entries.values()]
export const getDroppedCount = () => dropped

export function clearJs() {
	entries.clear()
	dropped = 0
}

function describeProps(props: Record<string, unknown>) {
	const out: JsEntry['props'] = {}

	for (const key of Object.keys(props).sort()) {
		if (HiddenProps.has(key)) continue
		const value = props[key]

		switch (typeof value) {
			case 'string':
				out[key] = value.length > 80 ? `${value.slice(0, 80)}...` : value
				break
			case 'number':
			case 'boolean':
				out[key] = value
				break
			case 'function':
				out[key] = '[function]'
				break
			case 'object':
				out[key] =
					value === null ? null : Array.isArray(value) ? '[array]' : '[object]'
				break
		}
	}

	return out
}

// Function names only, no paths and no values
function stackNames() {
	const names: string[] = []

	for (const line of (new Error().stack ?? '').split('\n')) {
		const name = /^\s*at\s+([^\s(]+)/.exec(line)?.[1]
		if (name && !names.includes(name)) names.push(name)
		if (names.length >= 16) break
	}

	return names
}

function record(
	source: string,
	props: Record<string, unknown>,
	patched: boolean,
) {
	const described = describeProps(props)
	const key = `${source}|${JSON.stringify(described)}`
	const now = Date.now()
	const valueLength =
		typeof props.value === 'string' ? props.value.length : null

	const existing = entries.get(key)
	if (existing) {
		existing.count++
		existing.lastMs = now
		existing.valueLength = valueLength
		existing.patched ||= patched
		return
	}

	if (entries.size >= MaxEntries) {
		dropped++
		return
	}

	entries.set(key, {
		source,
		firstMs: now,
		lastMs: now,
		count: 1,
		props: described,
		propKeys: Object.keys(props).sort(),
		valueLength,
		stack: stackNames(),
		patched,
	})
}

type Hook = (
	args: [ElementType, Record<string, unknown>, ...unknown[]],
) => never

function makeHook(
	source: string,
	experiment: (() => boolean) | undefined,
	onError: (e: unknown) => void,
) {
	return ((args: [ElementType, Record<string, unknown>, ...unknown[]]) => {
		try {
			const props = args[1]

			if (props && typeof props === 'object') {
				let patched = false

				// Only the "visible password" type, never real password fields
				if (
					experiment?.() &&
					props.keyboardType === 'visible-password' &&
					!props.secureTextEntry
				) {
					args[1] = { ...props, keyboardType: 'default' }
					patched = true
				}

				record(source, props, patched)
			}
		} catch (e) {
			onError(e)
		}

		return args
	}) as unknown as Hook
}

/**
 * Records the props of every text input created by React.
 * Returns the function that stops it.
 */
export function startCapture(
	jsExperiment: () => boolean,
	onError: (e: unknown) => void,
) {
	const unpatches: Array<() => unknown> = []

	const watch = (source: string, type: unknown, experiment?: () => boolean) => {
		if (!type) return

		try {
			unpatches.push(
				beforeJSX(type as ElementType, makeHook(source, experiment, onError)),
			)
		} catch (e) {
			onError(e)
		}
	}

	watch('react-native TextInput', TextInput, jsExperiment)
	watch('Discord TextInput', Design.TextInput)
	watch('Discord TextField', Design.TextField)
	watch('Discord TextArea', Design.TextArea)

	return () => {
		for (const unpatch of unpatches) unpatch()
		clearJs()
	}
}
