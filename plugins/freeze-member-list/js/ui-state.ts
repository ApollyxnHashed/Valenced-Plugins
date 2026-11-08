import { useEffect, useReducer } from 'react'

/** Settings that survive restarts (stored with jsonStorage). */
export interface Persisted {
	/** Whether the floating button is drawn at all. */
	visible: boolean
	/** Button position as fractions (0 to 1) of the free screen area, so it survives rotation. */
	position: { x: number; y: number }
}

export const DEFAULTS: Persisted = {
	visible: true,
	position: { x: 1, y: 0.55 },
}

let state: Persisted = { ...DEFAULTS, position: { ...DEFAULTS.position } }
/** False once the plugin stops: the overlay then draws nothing. */
let enabled = false
let storage: { set(value: unknown): unknown } | undefined
const listeners = new Set<() => void>()

function notify() {
	for (const l of listeners) {
		try {
			l()
		} catch {}
	}
}

export function subscribeUi(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** Re-renders the calling component whenever the UI state changes. */
export function useUiState() {
	const [, refresh] = useReducer((n: number) => n + 1, 0)
	useEffect(() => subscribeUi(refresh), [])
	return state
}

export const getUi = () => state
export const isEnabled = () => enabled

/** Set when the plugin was started after launch: the button only appears after a reload. */
let needsReload = false
export const getNeedsReload = () => needsReload
export function setNeedsReload(value: boolean) {
	needsReload = value
	notify()
}

export function setEnabled(value: boolean) {
	enabled = value
	notify()
}

export function attachStorage(
	target: { set(value: unknown): unknown },
	loaded?: Partial<Persisted>,
) {
	storage = target
	if (loaded) {
		const p = loaded.position
		state = {
			visible: typeof loaded.visible === 'boolean' ? loaded.visible : DEFAULTS.visible,
			position:
				p && Number.isFinite(p.x) && Number.isFinite(p.y)
					? { x: clamp01(p.x), y: clamp01(p.y) }
					: { ...DEFAULTS.position },
		}
		notify()
	}
}

export function detachStorage() {
	storage = undefined
}

export function setVisible(visible: boolean) {
	state = { ...state, visible }
	save({ visible })
	notify()
}

export function setPosition(x: number, y: number) {
	const position = { x: clamp01(x), y: clamp01(y) }
	state = { ...state, position }
	save({ position })
	notify()
}

export function resetPosition() {
	setPosition(DEFAULTS.position.x, DEFAULTS.position.y)
}

function save(partial: Partial<Persisted>) {
	try {
		storage?.set(partial)
	} catch {}
}

function clamp01(n: number) {
	return Math.min(1, Math.max(0, n))
}
