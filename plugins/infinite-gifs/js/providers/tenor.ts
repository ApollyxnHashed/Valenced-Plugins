import {
	list,
	MAX_REQUESTS_PER_FETCH,
	normalizeLocale,
	record,
	text,
} from './shared'
import type {
	FetchContext,
	FetchOutcome,
	Gif,
	ProviderAdapter,
} from '../pagination/types'
import type { GridQuality, JsonFetcher } from './shared'

// Same public key GIF Providers 1.0.1 ships in its own source (providers.ts).
const TENOR_KEY = '3Z0688EVWYKH'
const PAGE_LIMIT = 50

/** Converts a Tenor v1 result to the picker's Gif shape; null when unusable. */
export function normalizeTenor(
	value: unknown,
	quality: GridQuality,
): Gif | null {
	const item = record(value)
	const media = record(list(item.media)[0])
	const format = record(
		media[quality] ?? media.tinygif ?? media.gif ?? media.mp4 ?? media.webm,
	)
	const original = record(media.gif)
	const dims = list(format.dims)
	const width = Number(dims[0])
	const height = Number(dims[1])
	const id = text(item.id)
	const url = text(item.itemurl)
	const src = text(format.url)
	if (
		!id ||
		!url ||
		!src ||
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	)
		return null

	return {
		id: `tenor:${id}`,
		title: text(item.title),
		url,
		src,
		gif_src: text(original.url) || src,
		width,
		height,
		preview: src,
	}
}

/**
 * Tenor paginates with an opaque cursor: every response carries `next`, which is
 * sent back as `pos`. The cursor can't be jumped to, so it always starts from the
 * beginning and silently walks past what the picker already shows.
 */
export class TenorAdapter implements ProviderAdapter {
	readonly key = 'tenor'
	private cursor = ''
	private ended = false

	constructor(
		private readonly fetchJson: JsonFetcher,
		private readonly quality: GridQuality,
	) {}

	async fetchNext(context: FetchContext): Promise<FetchOutcome> {
		const items = new Map<string, Gif>()

		for (
			let requests = 0;
			requests < MAX_REQUESTS_PER_FETCH &&
			items.size < context.chunk &&
			!this.ended;
			requests++
		) {
			let response: Record<string, unknown>
			try {
				response = record(
					await this.fetchJson(this.url(context), context.signal),
				)
			} catch (error) {
				// Keep what was already collected; the cursor did not move, so the
				// failed page is requested again next time.
				if (items.size > 0) break
				throw error
			}

			const results = list(response.results)
			for (const value of results) {
				const gif = normalizeTenor(value, this.quality)
				if (gif && !context.isSeen(gif)) items.set(gif.id, gif)
			}

			// Tenor's contract: an empty page, a missing/zero `next`, or a repeated
			// cursor all mean the end (same conditions GIF Providers breaks on).
			const next = text(response.next)
			if (!results.length || !next || next === '0' || next === this.cursor)
				this.ended = true
			else this.cursor = next
		}

		return { items: [...items.values()], done: this.ended }
	}

	private url(context: FetchContext): string {
		const params: Record<string, string> = {
			key: TENOR_KEY,
			locale: normalizeLocale(context.locale).replace('-', '_'),
			limit: String(PAGE_LIMIT),
		}
		if (context.kind === 'search') params.q = context.query
		if (this.cursor) params.pos = this.cursor
		const path = context.kind === 'search' ? 'search' : 'trending'
		return `https://api.tenor.com/v1/${path}?${new URLSearchParams(params)}`
	}
}
