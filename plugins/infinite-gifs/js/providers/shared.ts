import { ProviderRequestError } from '../pagination/types'
import type { Gif } from '../pagination/types'

export type JsonFetcher = (url: string, signal: AbortSignal) => Promise<unknown>

export const GRID_QUALITIES = ['gif', 'tinygif', 'nanogif'] as const
export type GridQuality = (typeof GRID_QUALITIES)[number]
export const DEFAULT_QUALITY: GridQuality = 'tinygif'

/** Requests per `fetchNext()` call. Keeps a single scroll from becoming a request storm. */
export const MAX_REQUESTS_PER_FETCH = 6

export function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {}
}

export function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : []
}

export function text(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

export function isValidGif(gif: unknown): gif is Gif {
	const item = record(gif)
	return (
		typeof item.id === 'string' &&
		typeof item.url === 'string' &&
		typeof item.src === 'string' &&
		Number(item.width) > 0 &&
		Number(item.height) > 0
	)
}

/** Parses `Retry-After` (delta-seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(
	value: string | null | undefined,
	now: () => number = Date.now,
): number | undefined {
	if (!value) return undefined
	const seconds = Number(value)
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
	const date = Date.parse(value)
	return Number.isNaN(date) ? undefined : Math.max(0, date - now())
}

/** Production `JsonFetcher`: plain `fetch` that surfaces status codes and `Retry-After`. */
export const fetchJson: JsonFetcher = async (url, signal) => {
	const response = await fetch(url, { signal })
	if (!response.ok)
		throw new ProviderRequestError(
			`Request failed (${response.status})`,
			response.status,
			parseRetryAfter(response.headers.get('retry-after')),
		)
	return response.json()
}

/** Locale handling shared by Tenor and Giphy, mirroring how GIF Providers builds its requests. */
export function normalizeLocale(locale: string): string {
	return locale.replace('_', '-').toLowerCase()
}
