import type { Gif } from './types'

/**
 * Everything the picker already holds. A GIF counts as seen when any of its
 * identifiers matches:
 *  - `id`  (prefixed with the provider when GIF Providers is in use),
 *  - `url` (what GIF Providers' own `mergeGifs()` deduplicates on),
 *  - `src` (Discord's list uses `src` as the FlashList key, so it must be unique).
 */
export class SeenSet {
	private readonly ids = new Set<string>()
	private readonly urls = new Set<string>()
	private readonly srcs = new Set<string>()

	has(gif: Gif): boolean {
		return (
			this.ids.has(gif.id) || this.urls.has(gif.url) || this.srcs.has(gif.src)
		)
	}

	add(gif: Gif): void {
		this.ids.add(gif.id)
		this.urls.add(gif.url)
		this.srcs.add(gif.src)
	}

	get size(): number {
		return this.ids.size
	}
}

/** A provider's queue of fresh GIFs that were fetched but not shown yet. */
export interface Queue {
	buffer: Gif[]
}

/**
 * Round-robin merge, same strategy as GIF Providers' `mergeGifs()`: take one GIF
 * from each provider in a fixed order, repeat. Because the order of `queues` is
 * fixed, a provider that answers faster cannot dominate the list.
 *
 * Consumed (and duplicate) GIFs are removed from the queues; GIFs that did not
 * fit in `limit` stay queued for the next page, so no result is ever skipped.
 */
export function takeInterleaved(
	queues: readonly Queue[],
	limit: number,
	seen: SeenSet,
): Gif[] {
	const out: Gif[] = []
	let progressed = true

	while (out.length < limit && progressed) {
		progressed = false
		for (const queue of queues) {
			while (queue.buffer.length) {
				const gif = queue.buffer.shift()!
				if (seen.has(gif)) continue
				seen.add(gif)
				out.push(gif)
				progressed = true
				break
			}
			if (out.length >= limit) break
		}
	}

	return out
}
