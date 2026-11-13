import { GiphyAdapter } from './giphy'
import { KlipyAdapter } from './klipy'
import { DEFAULT_QUALITY } from './shared'
import { TenorAdapter } from './tenor'
import type { AdapterFactory } from '../pagination/controller'
import type { ProviderAdapter, SessionInfo } from '../pagination/types'
import type { DiscordGet } from './klipy'
import type { GifProvidersSettings } from './settings'
import type { GridQuality, JsonFetcher } from './shared'

export interface FactoryDeps {
	fetchJson: JsonFetcher
	get: DiscordGet
	getMediaFormat(): string
	readGifProvidersSettings(): Promise<GifProvidersSettings | undefined>
}

interface BuildContext {
	deps: FactoryDeps
	quality: GridQuality
	shown: number
}

/**
 * One entry per provider GIF Providers can prefix ids with. The order is the
 * order GIF Providers merges in (`providers` in its storage.ts), so the
 * interleave of later pages matches the first page.
 *
 * Supporting a provider added to GIF Providers later means adding its adapter
 * and one line here; no other file changes.
 */
const REGISTRY: ReadonlyArray<{
	key: string
	build(context: BuildContext): ProviderAdapter
}> = [
	{
		key: 'tenor',
		build: ({ deps, quality }) => new TenorAdapter(deps.fetchJson, quality),
	},
	{
		key: 'giphy',
		build: ({ deps, quality, shown }) =>
			new GiphyAdapter(deps.fetchJson, quality, shown),
	},
	{
		key: 'klipy',
		build: ({ deps, shown }) =>
			new KlipyAdapter({
				get: deps.get,
				getMediaFormat: deps.getMediaFormat,
				prefix: 'klipy:',
				key: 'klipy',
				alreadyShown: shown,
			}),
	},
]

const PREFIX = new RegExp(`^(${REGISTRY.map(entry => entry.key).join('|')}):`)

function countByProvider(info: SessionInfo): Map<string, number> {
	const counts = new Map<string, number>()
	for (const gif of info.items) {
		const match = PREFIX.exec(gif.id)
		if (match) counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + 1)
	}
	return counts
}

/**
 * Picks the adapters for the search that just started.
 *
 * - Ids prefixed `tenor:`/`giphy:`/`klipy:` mean GIF Providers produced the page.
 *   The providers it merged are the ones present in the page, plus the ones its
 *   stored selection lists (a provider that failed on page 1 still gets a turn).
 * - Otherwise the page came from Discord's native integration.
 */
export function createAdapterFactory(deps: FactoryDeps): AdapterFactory {
	return {
		async create(info) {
			const counts = countByProvider(info)

			if (counts.size === 0) {
				return [
					new KlipyAdapter({
						get: deps.get,
						getMediaFormat: deps.getMediaFormat,
						prefix: '',
						key: 'native',
						alreadyShown: info.items.length,
					}),
				]
			}

			const settings = await deps.readGifProvidersSettings()
			const selected = new Set(settings?.providers ?? [])
			const quality = settings?.gridQuality ?? DEFAULT_QUALITY

			return REGISTRY.filter(
				entry => counts.has(entry.key) || selected.has(entry.key),
			).map(entry =>
				entry.build({ deps, quality, shown: counts.get(entry.key) ?? 0 }),
			)
		},
	}
}
