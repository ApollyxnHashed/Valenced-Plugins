import { SeenSet, takeInterleaved } from './merge'
import { ProviderRequestError } from './types'
import type {
	FetchContext,
	Gif,
	ProviderAdapter,
	ResultKind,
	SessionInfo,
} from './types'

/** GIFs appended per page. Matches Discord's own fetch size (GIF_FETCH_LIMIT_IOS = 50). */
export const PAGE_SIZE = 50
/** Safety ceiling for one search so the list can't grow without bound on a phone. */
export const MAX_RESULTS = 4000
/** A provider that failed this many times in a row is left alone for the rest of the search. */
export const MAX_CONSECUTIVE_FAILURES = 4
/** A provider that returned no new unique GIF this many times in a row is treated as exhausted. */
export const MAX_EMPTY_REFILLS = 3
export const REQUEST_TIMEOUT_MS = 10_000
const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 60_000
/** How long a scroll to the end keeps a failed load eligible for one automatic retry. */
const INTEREST_TTL_MS = 20_000

export interface AdapterFactory {
	/** Builds fresh per-provider state for the search that just started. */
	create(info: SessionInfo, signal: AbortSignal): Promise<ProviderAdapter[]>
}

export interface Clock {
	now(): number
	setTimer(fn: () => void, ms: number): unknown
	clearTimer(handle: unknown): void
}

export interface ControllerDeps {
	factory: AdapterFactory
	/** Called after `items` (the full, extended list) grew; the picker must re-read its list. */
	publish(session: SessionView, items: readonly Gif[]): void
	getLocale(): string
	clock?: Clock
	log?: {
		warn(message: string, ...rest: unknown[]): void
	}
}

export interface SessionView {
	readonly kind: ResultKind
	readonly query: string
}

interface Slot {
	adapter: ProviderAdapter
	buffer: Gif[]
	done: boolean
	failures: number
	retryAt: number
	/** Consecutive refills that returned no new unique GIF. */
	empty: number
}

interface Session extends SessionView {
	/** Number of GIFs the picker's own store holds (the first page). */
	baseCount: number
	baseFirst: string | undefined
	baseLast: string | undefined
	items: Gif[]
	seen: SeenSet
	abort: AbortController
	slots: Promise<Slot[]>
	loading: Promise<void> | null
	exhausted: boolean
	/** Last time the user scrolled near the end. */
	wantsMoreAt: number
	retryTimer: unknown
}

const realClock: Clock = {
	now: () => Date.now(),
	setTimer: (fn, ms) => setTimeout(fn, ms),
	clearTimer: handle => clearTimeout(handle as number),
}

function backoffFor(failures: number, retryAfterMs?: number): number {
	if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs))
		return Math.min(MAX_BACKOFF_MS, Math.max(1_000, retryAfterMs))
	return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (failures - 1))
}

/**
 * Keeps one pagination session alive per search.
 *
 * A session starts when the picker receives its first page of results and ends
 * as soon as the query changes, the picker is re-initialised or the plugin is
 * stopped. Every asynchronous step re-checks that it is still the current session afterwards, so a
 * late answer from a previous search can never reach the new list.
 */
export class PaginationController {
	private session: Session | null = null
	private readonly clock: Clock

	constructor(private readonly deps: ControllerDeps) {
		this.clock = deps.clock ?? realClock
	}

	/** True while a search is being extended (used by tests / diagnostics). */
	get active(): boolean {
		return this.session !== null
	}

	/** Starts a session from the first page the picker received. */
	begin(info: SessionInfo): void {
		this.reset()
		const abort = new AbortController()
		const seen = new SeenSet()
		const items: Gif[] = []
		for (const gif of info.items) {
			// The picker's own page is the baseline: never repeat anything in it.
			seen.add(gif)
			items.push(gif)
		}

		const session: Session = {
			kind: info.kind,
			query: info.query,
			baseCount: items.length,
			baseFirst: items[0]?.id,
			baseLast: items[items.length - 1]?.id,
			items,
			seen,
			abort,
			loading: null,
			exhausted: items.length === 0 || items.length >= MAX_RESULTS,
			wantsMoreAt: 0,
			retryTimer: undefined,
			slots: Promise.resolve([]),
		}
		session.slots = this.deps.factory
			.create(info, abort.signal)
			.then(adapters => {
				if (adapters.length === 0 && this.session === session)
					session.exhausted = true
				return adapters.map<Slot>(adapter => ({
					adapter,
					buffer: [],
					done: false,
					failures: 0,
					retryAt: 0,
					empty: 0,
				}))
			})
		// A rejected factory means "do not extend this search"; never unhandled.
		session.slots.catch(error => {
			this.deps.log?.warn('Could not prepare providers', error)
			if (this.session === session) session.exhausted = true
		})
		this.session = session
	}

	/** Cancels everything in flight and forgets the current search. */
	reset(): void {
		const session = this.session
		this.session = null
		if (!session) return
		session.abort.abort()
		if (session.retryTimer !== undefined)
			this.clock.clearTimer(session.retryTimer)
	}

	/**
	 * True when `items` is the picker's own first page of the current session
	 * (not favourites, not a category). The picker's store re-maps GIFs into new
	 * objects, so ownership is decided by length plus the first and last id.
	 */
	owns(items: ReadonlyArray<{ id?: string }> | undefined): boolean {
		const session = this.session
		if (!session || !items || items.length === 0) return false
		return (
			items.length === session.baseCount &&
			items[0]?.id === session.baseFirst &&
			items[items.length - 1]?.id === session.baseLast
		)
	}

	/** GIFs loaded after the picker's own first page, in display order. */
	extras(): readonly Gif[] {
		const session = this.session
		return session ? session.items.slice(session.baseCount) : []
	}

	/**
	 * Called when the user is near the end of the list. Safe to call as often as
	 * the list wants: at most one request round is in flight at a time.
	 */
	loadMore(): Promise<void> {
		const session = this.session
		if (!session || session.exhausted) return Promise.resolve()
		session.wantsMoreAt = this.clock.now()
		if (session.loading) return session.loading

		const run = this.run(session).finally(() => {
			if (session.loading === run) session.loading = null
		})
		session.loading = run
		return run
	}

	private async run(session: Session): Promise<void> {
		const stale = () => this.session !== session || session.abort.signal.aborted

		let slots: Slot[]
		try {
			slots = await session.slots
		} catch {
			return
		}
		if (stale()) return

		// A few rounds at most: a round that only produced duplicates should not
		// make the user scroll again, but it must never turn into a request storm.
		for (let round = 0; round < 3; round++) {
			const { added, requested } = await this.round(session, slots, stale)
			if (stale() || added > 0 || requested === 0 || session.exhausted) break
		}
		if (stale()) return
		this.scheduleRetry(session, slots)
	}

	/** One refill + merge pass: how many GIFs were appended and how many providers were asked. */
	private async round(
		session: Session,
		slots: Slot[],
		stale: () => boolean,
	): Promise<{ added: number; requested: number }> {
		const now = this.clock.now()
		const live = slots.filter(slot => !slot.done || slot.buffer.length > 0)
		if (live.length === 0) {
			session.exhausted = true
			return { added: 0, requested: 0 }
		}

		const share = Math.ceil(PAGE_SIZE / live.length)
		const ready = live.filter(
			slot => !slot.done && slot.buffer.length < share && now >= slot.retryAt,
		)

		await Promise.all(ready.map(slot => this.refill(session, slot, share)))
		if (stale()) return { added: 0, requested: ready.length }

		const room = Math.min(PAGE_SIZE, MAX_RESULTS - session.items.length)
		const fresh = takeInterleaved(live, room, session.seen)

		if (fresh.length > 0) {
			session.items = session.items.concat(fresh)
			this.deps.publish(session, session.items)
		}

		if (session.items.length >= MAX_RESULTS) session.exhausted = true
		else if (slots.every(slot => slot.done && slot.buffer.length === 0))
			session.exhausted = true
		return { added: fresh.length, requested: ready.length }
	}

	private async refill(
		session: Session,
		slot: Slot,
		chunk: number,
	): Promise<void> {
		const timeout = new AbortController()
		const onAbort = () => timeout.abort()
		session.abort.signal.addEventListener('abort', onAbort)
		const timer = this.clock.setTimer(() => timeout.abort(), REQUEST_TIMEOUT_MS)

		const context: FetchContext = {
			kind: session.kind,
			query: session.query,
			locale: this.deps.getLocale(),
			signal: timeout.signal,
			isSeen: gif => session.seen.has(gif),
			chunk,
		}

		try {
			const outcome = await slot.adapter.fetchNext(context)
			if (session.abort.signal.aborted) return
			slot.failures = 0
			slot.buffer.push(...outcome.items)
			slot.empty = outcome.items.length === 0 ? slot.empty + 1 : 0
			if (outcome.done || slot.empty >= MAX_EMPTY_REFILLS) slot.done = true
		} catch (error) {
			if (session.abort.signal.aborted) return
			slot.failures++
			const retryAfter =
				error instanceof ProviderRequestError ? error.retryAfterMs : undefined
			slot.retryAt = this.clock.now() + backoffFor(slot.failures, retryAfter)
			// One failing provider never blocks the others; it is retried later and
			// given up on after repeated failures.
			if (slot.failures >= MAX_CONSECUTIVE_FAILURES) slot.done = true
			this.deps.log?.warn(
				`[${slot.adapter.key}] page failed (${slot.failures}/${MAX_CONSECUTIVE_FAILURES})`,
				error,
			)
		} finally {
			this.clock.clearTimer(timer)
			session.abort.signal.removeEventListener('abort', onAbort)
		}
	}

	/**
	 * After a failure FlashList will not call `onEndReached` again until the user
	 * scrolls away and back. Retry once per backoff window while the user is
	 * still at the end of the list; this is bounded by MAX_CONSECUTIVE_FAILURES.
	 */
	private scheduleRetry(session: Session, slots: Slot[]): void {
		if (session.retryTimer !== undefined) {
			this.clock.clearTimer(session.retryTimer)
			session.retryTimer = undefined
		}
		if (session.exhausted) return
		const waiting = slots.filter(
			slot => !slot.done && slot.failures > 0 && slot.buffer.length === 0,
		)
		if (waiting.length === 0) return
		const delay = Math.max(
			500,
			Math.min(...waiting.map(slot => slot.retryAt)) - this.clock.now(),
		)
		session.retryTimer = this.clock.setTimer(() => {
			session.retryTimer = undefined
			if (this.session !== session) return
			if (this.clock.now() - session.wantsMoreAt > INTEREST_TTL_MS) return
			void this.loadMore()
		}, delay)
	}
}
