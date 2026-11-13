/**
 * Shape of one item of `GIF_PICKER_QUERY_SUCCESS.items`.
 *
 * The same normalized shape is produced by Discord's own `/gifs/*` endpoints
 * and by GIF Providers (`id`, `title`, `url`, `src`, `gif_src`, `width`,
 * `height`, `preview`). Unknown extra fields are carried through untouched.
 */
export interface Gif {
	id: string
	title?: string
	url: string
	src: string
	gif_src?: string
	width: number
	height: number
	preview?: string
	[extra: string]: unknown
}

export type ResultKind = 'search' | 'trending'

/** What the picker showed as its first page of results. */
export interface SessionInfo {
	kind: ResultKind
	/** Empty for trending. */
	query: string
	items: readonly Gif[]
}

export interface FetchContext {
	kind: ResultKind
	query: string
	locale: string
	signal: AbortSignal
	/** True when the picker (or the session) already contains this GIF. */
	isSeen(gif: Gif): boolean
	/** Roughly how many fresh GIFs the caller wants from this provider. */
	chunk: number
}

export interface FetchOutcome {
	/** Fresh GIFs in the provider's own order. Ids already carry the provider prefix when required. */
	items: Gif[]
	/** The provider reported that there is nothing beyond what was returned. */
	done: boolean
}

/**
 * One provider's pagination state for one search session.
 * Instances own their cursor / offset and are never shared between providers.
 */
export interface ProviderAdapter {
	readonly key: string
	fetchNext(context: FetchContext): Promise<FetchOutcome>
}

/** Error carrying what the controller needs to honour rate limits. */
export class ProviderRequestError extends Error {
	readonly status: number | undefined
	readonly retryAfterMs: number | undefined

	constructor(
		message: string,
		status?: number,
		retryAfterMs?: number,
		options?: { cause?: unknown },
	) {
		super(message)
		this.name = 'ProviderRequestError'
		this.status = status
		this.retryAfterMs = retryAfterMs
		if (options?.cause !== undefined)
			(this as { cause?: unknown }).cause = options.cause
	}
}
