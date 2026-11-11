import { useReRender } from '@valenced/utils/react'
import { useEffect } from 'react'
import type { JsonStorage } from '@valenced/json-storage'

/** Saved between app launches with jsonStorage. */
export interface Settings {
	/** Whether the floating button is drawn at all. */
	visible: boolean
	/** Button position as fractions (0 to 1) of the free screen area, so it survives rotation. */
	position: { x: number; y: number }
}

export const DEFAULTS: Settings = {
	visible: true,
	position: { x: 1, y: 0.55 },
}

let storage: JsonStorage<Settings> | undefined
/** The overlay only draws while the plugin is started. */
let active = false
/** Set when the plugin was enabled after launch and the overlay is not in the app yet. */
let reloadNeeded = false
/** Becomes true once the overlay has been drawn. The module outlives disabling and enabling the plugin. */
let overlayMounted = false

const listeners = new Set<() => void>()

function emit() {
	for (const listener of listeners) listener()
}

/** Re-renders the component whenever the runtime flags change. */
function useRuntimeFlags() {
	const reRender = useReRender()
	useEffect(() => {
		listeners.add(reRender)
		return () => {
			listeners.delete(reRender)
		}
	}, [reRender])
}

export function attachStorage(value: JsonStorage<Settings>) {
	storage = value
}

export function setActive(value: boolean) {
	active = value
	emit()
}

export function setReloadNeeded(value: boolean) {
	reloadNeeded = value
	emit()
}

export function markOverlayMounted() {
	overlayMounted = true
}

export const isOverlayMounted = () => overlayMounted

export function useIsActive() {
	useRuntimeFlags()
	return active
}

export function useReloadNeeded() {
	useRuntimeFlags()
	return reloadNeeded
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Current settings, always complete: missing or invalid saved values fall back to the defaults. */
export function useSettings(): Settings {
	const saved = storage?.use() as Partial<Settings> | undefined
	const { x, y } = saved?.position ?? DEFAULTS.position
	return {
		visible: saved?.visible ?? DEFAULTS.visible,
		position: {
			x: Number.isFinite(x) ? clamp01(x) : DEFAULTS.position.x,
			y: Number.isFinite(y) ? clamp01(y) : DEFAULTS.position.y,
		},
	}
}

export function savePosition(x: number, y: number) {
	void storage?.set({ position: { x: clamp01(x), y: clamp01(y) } })
}
