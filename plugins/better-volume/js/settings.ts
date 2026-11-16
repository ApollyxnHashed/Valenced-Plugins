import type { JsonStorage } from '@valenced/json-storage'
import type { PluginApi } from '@valenced/plugins/types'

export interface Settings {
	/** Highest volume that can be set, in percent. */
	maxVolume: number
	/** How much the +/- buttons change the volume, in percent. */
	step: number
	/** Volumes above the stock limit, by user ID, as raw amplitude. Discord itself only stores up to 200%. */
	overrides: Record<string, number>
}

/** The plugin API with this plugin's storage. */
export type Api = PluginApi<{ jsonStorage: Settings }>

export const DefaultSettings: Settings = {
	maxVolume: 1000,
	step: 5,
	overrides: {},
}

/** Discord's own slider limit, in percent. */
export const STOCK_MAX_PERCENT = 200

/** Above this, the amplitude math overflows to Infinity. */
export const HARD_MAX_PERCENT = 100000

/** Media engine context of normal user volume (the other one is stream volume). */
export const DEFAULT_CONTEXT = 'default'

// Same curve as Discord's PerceptualVolumeUtils: amplitude 100 is "100%".
export function perceptualToAmplitude(percent: number): number {
	if (percent === 0) return 0
	const ratio = percent / 100
	const power = ratio < 1 ? ratio ** 2.8 : 10 ** ((6 * (ratio - 1)) / 20)
	return power * 100
}

export function amplitudeToPerceptual(amplitude: number): number {
	if (amplitude === 0) return 0
	const ratio = amplitude / 100
	const power =
		ratio < 1 ? ratio ** (1 / 2.8) : (20 * Math.log10(ratio)) / 6 + 1
	return power * 100
}

export const STOCK_MAX_AMPLITUDE = perceptualToAmplitude(STOCK_MAX_PERCENT)

// Kept bound after stop so components that are still mounted keep a stable hook order.
let storage: JsonStorage<Settings> | undefined

export function bindStorage(value: JsonStorage<Settings>): void {
	storage = value
}

export function getSettings(): Settings {
	return { ...DefaultSettings, ...storage?.cache }
}

/** Re-renders the calling component whenever the settings change. */
export function useSettings(): Settings {
	if (!storage) throw new Error('Better Volume storage is not ready')
	return { ...DefaultSettings, ...storage.use() }
}

export function saveSettings(patch: Partial<Settings>): void {
	void storage?.set({ ...getSettings(), ...patch }, true)
}

export function setOverride(userId: string, amplitude: number): void {
	saveSettings({
		overrides: { ...getSettings().overrides, [userId]: amplitude },
	})
}

export function clearOverride(userId: string): void {
	const { overrides } = getSettings()
	if (!(userId in overrides)) return
	saveSettings({
		overrides: Object.fromEntries(
			Object.entries(overrides).filter(([id]) => id !== userId),
		),
	})
}
