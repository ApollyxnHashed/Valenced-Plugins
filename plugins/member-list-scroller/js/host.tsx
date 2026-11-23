import { useCallback, useEffect, useRef, useState } from 'react'
import { buildLayout, fractionToOffset, lastLocation, locate } from './layout'
import { HOSTED_PROP } from './match'
import { createScrollModel, useHeightHooks } from './model'
import { SafeBoundary, ScrollThumb } from './thumb'
import type { ComponentType } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import type { ScrollModel } from './model'
import type { ThumbController } from './thumb'

/** What the native member list lets us do: no pixel offsets, only items. */
export interface ListHandle {
	scrollToTop(animated?: boolean): void
	scrollToLocation(params: {
		section: number
		item: number
		animated?: boolean
		paddingStart?: number
	}): void
}

type Ref =
	| ((handle: ListHandle | null) => unknown)
	| { current: ListHandle | null }

/** The props Discord gives UsersFastList that this plugin reads. */
export interface UsersListProps {
	sections: readonly number[]
	getSectionProps?(
		section: number,
	): { type?: string; props?: { hideTitle?: boolean } } | undefined
	listHeaderSize?: number | (() => number)
	insetStart?: number
	ref?: Ref
	onScroll?(event: unknown): void
	onLayout?(event: LayoutChangeEvent): void
	onContentLengthChange?(length: number): void
	[key: string]: unknown
}

/** Runs Discord's own height hooks and reports what they return. Renders nothing. */
function HeightReader({
	row,
	section,
	model,
}: {
	row: () => number
	section: () => number
	model: ScrollModel
}) {
	const rowHeight = row()
	const sectionHeight = section()
	useEffect(() => {
		model.set({ rowHeight, sectionHeight })
	}, [model, rowHeight, sectionHeight])
	return null
}

function hasHeader(props: UsersListProps, section: number) {
	try {
		const element = props.getSectionProps?.(section)
		return (
			element?.type === 'placeholder' ||
			(element?.type === 'section' && !element.props?.hideTitle)
		)
	} catch {
		return false
	}
}

function assignRef(ref: Ref | undefined, handle: ListHandle | null) {
	if (typeof ref === 'function') ref(handle)
	else if (ref) ref.current = handle
}

/** Scroll events carry the offset in `nativeEvent`, or directly on the event. */
function readScroll(event: unknown) {
	const native =
		(event as { nativeEvent?: unknown } | undefined)?.nativeEvent ?? event
	const data = native as
		| { contentOffset?: { y?: unknown }; contentSize?: { height?: unknown } }
		| undefined
	return { offset: data?.contentOffset?.y, content: data?.contentSize?.height }
}

interface HostProps {
	List: ComponentType<UsersListProps>
	listProps: UsersListProps
}

/**
 * Renders the original member list exactly as Discord does, next to a scroll handle drawn over its right edge.
 * There is no wrapper around the list, so its layout cannot change. The list is only given extra
 * listeners (scroll, layout, content length) and a ref to scroll it. Every original prop still runs.
 */
export function ScrollerHost({ List, listProps }: HostProps) {
	const [model] = useState(createScrollModel)
	const heightHooks = useHeightHooks()

	// Callbacks given to the list read the latest props through this ref, so they stay stable
	const latest = useRef(listProps)
	latest.current = listProps
	const handle = useRef<ListHandle | null>(null)
	// Where the list was last sent, so a drag only scrolls when it crosses into another row
	const lastSent = useRef<string | undefined>(undefined)

	// The list hands its ref back on every render, so this keeps the original ref working too
	const setRef = useCallback((value: ListHandle | null) => {
		handle.current = value
		assignRef(latest.current.ref, value)
	}, [])

	const onScroll = useCallback(
		(event: unknown) => {
			const { offset, content } = readScroll(event)
			if (typeof offset === 'number') model.set({ offset })
			if (typeof content === 'number' && content > 0) model.set({ content })
			latest.current.onScroll?.(event)
		},
		[model],
	)

	const onContentLengthChange = useCallback(
		(length: number) => {
			if (typeof length === 'number' && length > 0)
				model.set({ content: length })
			latest.current.onContentLengthChange?.(length)
		},
		[model],
	)

	const onLayout = useCallback(
		(event: LayoutChangeEvent) => {
			const { y, height } = event.nativeEvent.layout
			model.set({ viewport: height, top: y })
			latest.current.onLayout?.(event)
		},
		[model],
	)

	const [controller] = useState<ThumbController>(() => ({
		scrollToFraction(fraction) {
			const target = handle.current
			const props = latest.current
			const { content, viewport } = model.state
			if (!target || !Array.isArray(props.sections)) return undefined

			const headerSize = props.listHeaderSize
			const top =
				(props.insetStart ?? 0) +
				(typeof headerSize === 'function' ? headerSize() : (headerSize ?? 0))

			// Without Discord's heights, rows and headers are treated as equal, and the measured content sets the scale
			let { rowHeight, sectionHeight } = model.state
			if (!(rowHeight > 0) || !(sectionHeight > 0)) {
				const units = props.sections.reduce(
					(sum, count, section) =>
						sum + (count > 0 ? count + (hasHeader(props, section) ? 1 : 0) : 0),
					0,
				)
				rowHeight = sectionHeight =
					units > 0 && content > top ? (content - top) / units : 1
			}

			const layout = buildLayout({
				sections: props.sections,
				hasHeader: section => hasHeader(props, section),
				rowHeight,
				headerHeight: sectionHeight,
				top,
				contentLength: content > 0 ? content : undefined,
			})

			// Both ends are exact: the very top also shows the list header, the very bottom is clamped by the list
			const atTop = fraction <= 0.002
			const next = atTop
				? locate(layout, 0)
				: fraction >= 0.998
					? lastLocation(layout)
					: locate(layout, fractionToOffset(fraction, content, viewport))
			if (!next) return undefined

			const sent = atTop ? 'top' : `${next.section}:${next.item}`
			if (sent !== lastSent.current) {
				lastSent.current = sent
				try {
					if (atTop) target.scrollToTop(false)
					else
						target.scrollToLocation({
							section: next.section,
							item: next.item,
							animated: false,
							paddingStart: 0,
						})
				} catch {
					// A list that cannot be scrolled right now: the handle just stays where it is
				}
			}
			return { index: next.index, total: layout.totalItems }
		},
	}))

	return (
		<>
			<List
				{...listProps}
				{...{ [HOSTED_PROP]: true }}
				ref={setRef}
				onScroll={onScroll}
				onLayout={onLayout}
				onContentLengthChange={onContentLengthChange}
			/>
			{heightHooks.row && heightHooks.section ? (
				<SafeBoundary>
					<HeightReader
						key={heightHooks.version}
						row={heightHooks.row}
						section={heightHooks.section}
						model={model}
					/>
				</SafeBoundary>
			) : null}
			<SafeBoundary>
				<ScrollThumb model={model} controller={controller} />
			</SafeBoundary>
		</>
	)
}
