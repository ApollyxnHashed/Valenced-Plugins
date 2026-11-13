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
const GIPHY_KEY = 'Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g'
const PAGE_LIMIT = 50

const RENDITION: Record<GridQuality, string> = {
	gif: 'original',
	tinygif: 'fixed_height',
	nanogif: 'fixed_height_small',
}

/** Converts a Giphy v1 result to the picker's Gif shape; null when unusable. */
export function normalizeGiphy(
	value: unknown,
	quality: GridQuality,
): Gif | null {
	const item = record(value)
	const images = record(item.images)
	const format = record(images[RENDITION[quality]] ?? images.original)
	const original = record(images.original)
	const width = Number(format.width)
	const height = Number(format.height)
	const id = text(item.id)
	const url = text(item.url)
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
		id: `giphy:${id}`,
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
 * Giphy paginates with a numeric `offset`. It starts at the number of Giphy GIFs
 * the picker already shows (always <= what GIF Providers fetched), so nothing is
 * skipped; anything overlapping is dropped by the seen-set.
 */
export class GiphyAdapter implements ProviderAdapter {
	readonly key = 'giphy'
	private offset: number
	private ended = false

	constructor(
		private readonly fetchJson: JsonFetcher,
		private readonly quality: GridQuality,
		alreadyShown: number,
	) {
		this.offset = alreadyShown
	}

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
				if (items.size > 0) break
				throw error
			}

			const results = list(response.data)
			for (const value of results) {
				const gif = normalizeGiphy(value, this.quality)
				if (gif && !context.isSeen(gif)) items.set(gif.id, gif)
			}

			this.offset += results.length
			// Giphy's contract: a short page is the last one, and `pagination`
			// reports the total when it knows it.
			const total = Number(record(response.pagination).total_count)
			if (
				!results.length ||
				results.length < PAGE_LIMIT ||
				(Number.isFinite(total) && total > 0 && this.offset >= total)
			)
				this.ended = true
		}

		return { items: [...items.values()], done: this.ended }
	}

	private url(context: FetchContext): string {
		const language = normalizeLocale(context.locale)
		const params: Record<string, string> = {
			api_key: GIPHY_KEY,
			lang: language.startsWith('zh')
				? language.includes('tw')
					? 'zh-TW'
					: 'zh-CN'
				: language.split('-')[0]!,
			limit: String(PAGE_LIMIT),
			offset: String(this.offset),
		}
		if (context.kind === 'search') params.q = context.query
		const path = context.kind === 'search' ? 'search' : 'trending'
		return `https://api.giphy.com/v1/gifs/${path}?${new URLSearchParams(params)}`
	}
}
