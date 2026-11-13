import { ProviderRequestError } from '../pagination/types'
import { isValidGif, list } from './shared'
import type {
	FetchContext,
	FetchOutcome,
	Gif,
	ProviderAdapter,
} from '../pagination/types'

/** The picker's own HTTP call (`HTTPUtils.get`), unpatched, as GIF Providers also uses for Klipy. */
export type DiscordGet = (options: {
	url: string
	query: Record<string, unknown>
	signal: AbortSignal
	oldFormErrors: boolean
	rejectWithError: boolean
}) => Promise<{ body: unknown }>

/** Smallest window growth per request, so each round trip is worth its size. */
const MIN_GROWTH = 50
/**
 * Largest `limit` Discord's server honours for /gifs/search. Measured on a device with
 * limit=200 and limit=400: both returned 100 items, so the native Klipy list can't go past 100.
 */
const MAX_WINDOW = 100

function statusOf(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined
	const source = error as { status?: unknown; statusCode?: unknown }
	const status = source.status ?? source.statusCode
	return typeof status === 'number' ? status : undefined
}

function retryAfterOf(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined
	const source = error as {
		retryAfter?: unknown
		body?: { retry_after?: unknown }
	}
	const seconds = Number(source.retryAfter ?? source.body?.retry_after)
	return Number.isFinite(seconds) ? seconds * 1000 : undefined
}

export interface KlipyOptions {
	get: DiscordGet
	getMediaFormat(): string
	/** `'klipy:'` under GIF Providers (which prefixes ids), `''` for Discord's native integration. */
	prefix: string
	/** Used for logs and tests: `'klipy'` or `'native'`. */
	key: string
	/** How many of this provider's GIFs the picker already shows. */
	alreadyShown: number
}

/**
 * Discord's native GIF integration (Klipy).
 *
 * What the decompiled client shows (static analysis): `GIFPickerActionCreators`
 * calls `HTTP.get({ url: '/gifs/search' | '/gifs/trending-gifs', query: { q,
 * media_format, locale, limit } })` and expects a plain array back. The request
 * has no cursor or offset and the response carries no pagination metadata.
 *
 * The only thing a client can do with that contract is ask for a longer window:
 * request `limit = (GIFs covered so far) + growth`, keep what is new. If the
 * server returns fewer GIFs than asked for, the results are over (or capped);
 * a rejected request (400/422) means the window can't grow further.
 *
 * Whether Discord's server honours larger `limit` values is NOT verifiable from
 * the decompiled code and has to be checked on a device.
 */
export class KlipyAdapter implements ProviderAdapter {
	readonly key: string
	private covered: number
	private ended = false

	constructor(private readonly options: KlipyOptions) {
		this.key = options.key
		this.covered = options.alreadyShown
	}

	async fetchNext(context: FetchContext): Promise<FetchOutcome> {
		if (this.ended) return { items: [], done: true }

		const growth = Math.max(context.chunk, MIN_GROWTH)
		const window = Math.min(MAX_WINDOW, this.covered + growth)
		if (window <= this.covered) {
			this.ended = true
			return { items: [], done: true }
		}

		const query: Record<string, unknown> = {
			media_format: this.options.getMediaFormat(),
			locale: context.locale,
			limit: window,
		}
		if (context.kind === 'search') query.q = context.query

		let body: unknown
		try {
			;({ body } = await this.options.get({
				url: context.kind === 'search' ? '/gifs/search' : '/gifs/trending-gifs',
				query,
				signal: context.signal,
				oldFormErrors: true,
				rejectWithError: true,
			}))
		} catch (error) {
			const status = statusOf(error)
			// The server refused the larger window: nothing more is reachable.
			if (status === 400 || status === 422) {
				this.ended = true
				return { items: [], done: true }
			}
			throw new ProviderRequestError(
				`Klipy request failed${status ? ` (${status})` : ''}`,
				status,
				retryAfterOf(error),
				{ cause: error },
			)
		}

		if (!Array.isArray(body))
			throw new ProviderRequestError('Invalid Klipy response')

		const items = new Map<string, Gif>()
		for (const value of list(body)) {
			if (!isValidGif(value)) continue
			const gif: Gif = this.options.prefix
				? { ...value, id: `${this.options.prefix}${value.id}` }
				: value
			if (!context.isSeen(gif)) items.set(gif.id, gif)
		}

		this.covered = Math.max(this.covered, body.length)
		// Fewer results than requested: the end of the results (or the server's cap).
		if (body.length < window) this.ended = true

		return { items: [...items.values()], done: this.ended }
	}
}
