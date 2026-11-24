/*
 * Member List Scroller: pure layout math (no React, no Discord).
 *
 * The member list is a native virtualized list. Its ref only offers
 * scrollToTop() and scrollToLocation({ section, item }), never a pixel offset,
 * so a position on the handle has to become a (section, item) pair.
 * The pair is found from a small model of the list: the height of a section
 * header and of a row, which Discord scales with the font size.
 */

export interface ListLayout {
	/** Number of items in each section. */
	counts: number[]
	/** Items that come before each section. */
	before: number[]
	/** Content offset of the section header (equal to itemTop when it has none). */
	headerTop: number[]
	/** Content offset of the first item of each section. */
	itemTop: number[]
	rowHeight: number
	totalItems: number
	/** Space above the first section (list header and start inset). */
	top: number
	/** Measured content versus modeled content, so the model stretches to the real list. */
	scale: number
}

export interface ListLocation {
	section: number
	item: number
	/** Zero based position among all items. */
	index: number
}

const MIN_SCALE = 0.8
const MAX_SCALE = 1.25

const clamp = (n: number, min: number, max: number) =>
	Math.min(max, Math.max(min, n))

const safeCount = (n: unknown) =>
	typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0

export interface LayoutInput {
	sections: readonly unknown[]
	hasHeader(section: number): boolean
	rowHeight: number
	headerHeight: number
	top: number
	/** Measured content length, when known. */
	contentLength?: number
}

export function buildLayout(input: LayoutInput): ListLayout {
	const { sections, hasHeader, top } = input
	const rowHeight = input.rowHeight > 0 ? input.rowHeight : 1
	const headerHeight = Math.max(input.headerHeight, 0)

	const counts: number[] = []
	const before: number[] = []
	const headerTop: number[] = []
	const itemTop: number[] = []

	let offset = 0
	let items = 0
	for (let s = 0; s < sections.length; s++) {
		const count = safeCount(sections[s])
		counts.push(count)
		before.push(items)
		headerTop.push(offset)
		// Empty sections are not drawn at all
		if (count > 0 && hasHeader(s)) offset += headerHeight
		itemTop.push(offset)
		offset += count * rowHeight
		items += count
	}

	let scale = 1
	if (
		typeof input.contentLength === 'number' &&
		Number.isFinite(input.contentLength) &&
		offset > 0
	) {
		scale = clamp((input.contentLength - top) / offset, MIN_SCALE, MAX_SCALE)
	}

	return {
		counts,
		before,
		headerTop,
		itemTop,
		rowHeight,
		totalItems: items,
		top,
		scale,
	}
}

/** Position of an item that sits at a given content offset. */
export function locate(
	layout: ListLayout,
	offset: number,
): ListLocation | undefined {
	if (layout.totalItems === 0) return undefined

	// Back to model space, where headers and rows have their nominal heights
	const y = (offset - layout.top) / layout.scale

	let found = -1
	for (let s = 0; s < layout.counts.length; s++) {
		if (layout.counts[s] === 0) continue
		if (found === -1 || layout.headerTop[s] <= y) found = s
		else break
	}
	if (found === -1) return undefined

	const count = layout.counts[found]
	const item = clamp(
		Math.floor((y - layout.itemTop[found]) / layout.rowHeight),
		0,
		count - 1,
	)
	return { section: found, item, index: layout.before[found] + item }
}

export function lastLocation(layout: ListLayout): ListLocation | undefined {
	for (let s = layout.counts.length - 1; s >= 0; s--) {
		const count = layout.counts[s]
		if (count > 0)
			return {
				section: s,
				item: count - 1,
				index: layout.before[s] + count - 1,
			}
	}
	return undefined
}

/** Handle position (0 at the top, 1 at the bottom) for a scroll offset. */
export function offsetToFraction(
	offset: number,
	contentLength: number,
	viewport: number,
) {
	const range = contentLength - viewport
	if (!(range > 0)) return 0
	return clamp(offset / range, 0, 1)
}

export function fractionToOffset(
	fraction: number,
	contentLength: number,
	viewport: number,
) {
	return clamp(fraction, 0, 1) * Math.max(0, contentLength - viewport)
}

/** Handle height: proportional to the visible part of the list, never too small to grab. */
export function thumbHeight(
	viewport: number,
	contentLength: number,
	min: number,
	maxShare: number,
) {
	if (!(viewport > 0) || !(contentLength > 0)) return min
	const proportional = (viewport * viewport) / contentLength
	const lo = Math.min(min, viewport)
	return clamp(proportional, lo, Math.max(lo, viewport * maxShare))
}
