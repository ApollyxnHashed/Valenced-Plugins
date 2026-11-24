import { useReRender } from '@valenced/utils/react'
import { useEffect } from 'react'

/** What the handle needs to know about one list, kept outside React so scrolling never re-renders the list. */
export interface ScrollState {
	/** Total content length (dp), 0 while unknown. */
	content: number
	/** Visible height of the list (dp), 0 while unknown. */
	viewport: number
	/** Distance from the top of the list's parent to the top of the list (dp). */
	top: number
	/** Current scroll offset (dp). */
	offset: number
	/** Row height from Discord's own hook (dp), 0 while unknown. */
	rowHeight: number
	/** Section header height from Discord's own hook (dp), 0 while unknown. */
	sectionHeight: number
}

export interface ScrollModel {
	state: ScrollState
	set(patch: Partial<ScrollState>): void
	subscribe(listener: () => void): () => void
}

export function createScrollModel(): ScrollModel {
	const listeners = new Set<() => void>()
	const state: ScrollState = {
		content: 0,
		viewport: 0,
		top: 0,
		offset: 0,
		rowHeight: 0,
		sectionHeight: 0,
	}

	return {
		state,
		set(patch) {
			let changed = false
			for (const key of Object.keys(patch) as Array<keyof ScrollState>) {
				const value = patch[key]
				if (
					typeof value === 'number' &&
					Number.isFinite(value) &&
					state[key] !== value
				) {
					state[key] = value
					changed = true
				}
			}
			if (changed) for (const listener of listeners) listener()
		},
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}

/**
 * Re-renders the calling component when `signature(state)` changes, not on every scroll event.
 * The signature is whatever the component actually draws from the state.
 */
export function useScrollModel(
	model: ScrollModel,
	signature: (state: ScrollState) => string,
) {
	const reRender = useReRender()
	useEffect(() => {
		let last = signature(model.state)
		return model.subscribe(() => {
			const next = signature(model.state)
			if (next === last) return
			last = next
			reRender()
		})
	}, [model, reRender, signature])
	return model.state
}

/** A value shared by every list, with a hook that re-renders the caller when it changes. */
function createSignal<T>(initial: T) {
	let value = initial
	const listeners = new Set<() => void>()

	return {
		set(next: T) {
			if (Object.is(next, value)) return
			value = next
			for (const listener of listeners) listener()
		},
		get: () => value,
		use() {
			const reRender = useReRender()
			useEffect(() => {
				listeners.add(reRender)
				return () => {
					listeners.delete(reRender)
				}
			}, [reRender])
			return value
		},
	}
}

/*
 * Whether the plugin is running. The patched list stays mounted until its parent renders
 * again, so disabling the plugin hides the handles instead of tearing the list down.
 */
const enabled = createSignal(false)
export const setEnabled = enabled.set
export const useEnabled = enabled.use

/*
 * Discord's own hooks for the row and section header heights (they grow with the font size).
 * They can only be called from a component, and only the same hook for the whole life of that
 * component, so they are stored here and run by a small child that remounts when they change.
 */
export interface HeightHooks {
	row?: () => number
	section?: () => number
	/** Changes whenever a hook is set, so the child that runs them remounts. */
	version: number
}

const heightHooks = createSignal<HeightHooks>({ version: 0 })
export const useHeightHooks = heightHooks.use

export function setHeightHook(kind: 'row' | 'section', hook: () => number) {
	const current = heightHooks.get()
	heightHooks.set({ ...current, [kind]: hook, version: current.version + 1 })
}
