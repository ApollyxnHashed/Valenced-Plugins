import { GRID_QUALITIES, list } from './shared'
import type { GridQuality } from './shared'

export const GIF_PROVIDERS_ID = 'dev.benjii.gif-providers'

/** The subset of GIF Providers' stored settings this plugin reads. Read-only, never written. */
export interface GifProvidersSettings {
	providers?: string[]
	gridQuality?: GridQuality
}

/** Minimal view of Valenced's `JsonStorage`, so tests can fake it. */
export interface ReadableStorage {
	exists(): Promise<boolean>
	get(): Promise<unknown>
}

/**
 * Reads GIF Providers' settings through Valenced's supported JSON storage API.
 *
 * `exists()` is checked first because `get()` would create a missing file, and
 * this plugin must never create or change anything in another plugin's storage.
 * Any problem returns `undefined`; callers fall back to what the results show.
 */
export async function readGifProvidersSettings(
	open: () => ReadableStorage,
): Promise<GifProvidersSettings | undefined> {
	try {
		const storage = open()
		if (!(await storage.exists())) return undefined
		const data = await storage.get()
		if (!data || typeof data !== 'object') return undefined
		const raw = data as { providers?: unknown; gridQuality?: unknown }
		const providers = list(raw.providers).filter(
			(value): value is string => typeof value === 'string',
		)
		const gridQuality = GRID_QUALITIES.find(value => value === raw.gridQuality)
		return {
			providers: Array.isArray(raw.providers) ? providers : undefined,
			gridQuality,
		}
	} catch {
		return undefined
	}
}
