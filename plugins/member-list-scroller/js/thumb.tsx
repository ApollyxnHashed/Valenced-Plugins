import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { proxify } from '@valenced/utils/proxy'
import { Component, useRef, useState } from 'react'
import { PanResponder, Text, View } from 'react-native'
import { offsetToFraction, thumbHeight } from './layout'
import { useEnabled, useScrollModel } from './model'
import type { ReactNode } from 'react'
import type { ScrollModel } from './model'

/** Width of the touch area at the right edge. Wide enough for a thumb, only as tall as the handle. */
const HIT_WIDTH = 36
const BAR_WIDTH = 4
const BAR_WIDTH_ACTIVE = 8
const BAR_EDGE_GAP = 3
const MIN_THUMB_HEIGHT = 56
const MAX_THUMB_SHARE = 0.5
const BUBBLE_HEIGHT = 30
const BUBBLE_GAP = 6
const RESTING_OPACITY = 0.45

// Built lazily, so the color tokens are only read once the Discord modules are ready
const useStyles = proxify(() => {
	const { colors } = Tokens.default

	return Design.createStyles({
		hit: {
			position: 'absolute',
			right: 0,
			width: HIT_WIDTH,
			alignItems: 'flex-end',
			justifyContent: 'center',
		},
		bar: {
			width: BAR_WIDTH,
			height: '100%',
			borderRadius: BAR_WIDTH_ACTIVE / 2,
			marginRight: BAR_EDGE_GAP,
			backgroundColor: colors.INTERACTIVE_ICON_DEFAULT,
			opacity: RESTING_OPACITY,
		},
		barActive: {
			width: BAR_WIDTH_ACTIVE,
			backgroundColor: colors.CONTROL_PRIMARY_BACKGROUND_DEFAULT,
			opacity: 1,
		},
		bubbleWrap: {
			position: 'absolute',
			right: HIT_WIDTH + BUBBLE_GAP,
			height: BUBBLE_HEIGHT,
			justifyContent: 'center',
		},
		bubble: {
			color: colors.TEXT_DEFAULT,
			backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
			fontSize: 13,
			fontWeight: '600',
			paddingHorizontal: 12,
			paddingVertical: 5,
			borderRadius: BUBBLE_HEIGHT / 2,
			overflow: 'hidden',
			elevation: 4,
			shadowOpacity: 0.25,
			shadowRadius: 4,
			shadowOffset: { width: 0, height: 2 },
		},
	})
})

/** If the handle ever throws while rendering, it disappears instead of taking the member list down. */
export class SafeBoundary extends Component<
	{ children?: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false }

	static getDerivedStateFromError() {
		return { failed: true }
	}

	render() {
		return this.state.failed ? null : this.props.children
	}
}

/** Moves the list to a handle position (0 to 1). Returns the item it landed on, for the bubble. */
export interface ThumbController {
	scrollToFraction(
		fraction: number,
	): { index: number; total: number } | undefined
}

interface ThumbProps {
	model: ScrollModel
	controller: ThumbController
}

const clamp = (n: number, min: number, max: number) =>
	Math.min(max, Math.max(min, n))

export function ScrollThumb({ model, controller }: ThumbProps) {
	const styles = useStyles()
	const enabled = useEnabled()
	const { content, viewport, offset, top: listTop } = useScrollModel(model)
	const [dragging, setDragging] = useState(false)
	const [dragTop, setDragTop] = useState(0)
	const [bubble, setBubble] = useState('')

	const height = thumbHeight(
		viewport,
		content,
		MIN_THUMB_HEIGHT,
		MAX_THUMB_SHARE,
	)
	const range = Math.max(0, viewport - height)
	const restingTop = range * offsetToFraction(offset, content, viewport)
	const top = dragging ? dragTop : restingTop

	// The responder is created once, so it reads the latest values from here
	const live = useRef({ range, restingTop, controller })
	live.current = { range, restingTop, controller }
	const startTop = useRef(0)

	const end = () => {
		setDragging(false)
		setBubble('')
	}

	const responder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			// Never hand the gesture back to the list: the list would scroll instead of the handle
			onPanResponderTerminationRequest: () => false,
			onShouldBlockNativeResponder: () => true,
			onPanResponderGrant: () => {
				startTop.current = live.current.restingTop
				setDragTop(live.current.restingTop)
				setDragging(true)
			},
			onPanResponderMove: (_event, gesture) => {
				const { range, controller } = live.current
				if (!(range > 0)) return
				const next = clamp(startTop.current + gesture.dy, 0, range)
				setDragTop(next)
				const reached = controller.scrollToFraction(next / range)
				if (reached) setBubble(`${reached.index + 1} / ${reached.total}`)
			},
			onPanResponderRelease: end,
			onPanResponderTerminate: end,
		}),
	).current

	// Nothing to scroll, or sizes not measured yet
	if (!enabled || !(viewport > 0) || !(content - viewport > 1)) return null

	// Laid over the list, in the same parent: same top and height as the list, full width so the handle can sit at the right edge
	return (
		<View
			pointerEvents="box-none"
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				top: listTop,
				height: viewport,
			}}
		>
			<View
				{...responder.panHandlers}
				accessible
				accessibilityLabel="Member list scroll handle"
				style={[styles.hit, { top, height }]}
			>
				<View style={[styles.bar, dragging && styles.barActive]} />
			</View>
			{dragging && bubble ? (
				<View
					pointerEvents="none"
					style={[
						styles.bubbleWrap,
						{
							top: clamp(
								top + height / 2 - BUBBLE_HEIGHT / 2,
								0,
								Math.max(0, viewport - BUBBLE_HEIGHT),
							),
						},
					]}
				>
					<Text style={styles.bubble}>{bubble}</Text>
				</View>
			) : null}
		</View>
	)
}
