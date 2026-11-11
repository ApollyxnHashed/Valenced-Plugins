import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { proxify } from '@valenced/utils/proxy'
import { useEffect, useRef, useState } from 'react'
import {
	Image,
	PanResponder,
	Text,
	useWindowDimensions,
	View,
} from 'react-native'
import { describeFailure, toggle, useFrozen } from './freeze'
import { SNOWFLAKE_URI } from './snowflake'
import { savePosition, useSettings } from './state'

const SIZE = 54
const ICON_SIZE = 28
const MARGIN = 8
/** Keeps the button out of the status bar and the navigation bar area. */
const TOP_INSET = 56
const BOTTOM_INSET = 64
/** A touch that moves less than this (in dp) counts as a tap, not a drag. */
const TAP_SLOP = 10
const HINT_DURATION = 2200
/** Space under the button taken by the FROZEN label. */
const CHIP_HEIGHT = 28

// Built lazily, so the color tokens are only read once the Discord modules are ready
const useStyles = proxify(() => {
	const { colors } = Tokens.default

	return Design.createStyles({
		touch: {
			position: 'absolute',
			width: SIZE,
			height: SIZE,
		},
		circle: {
			width: SIZE,
			height: SIZE,
			borderRadius: SIZE / 2,
			borderWidth: 2,
			alignItems: 'center',
			justifyContent: 'center',
			elevation: 6,
			shadowOpacity: 0.35,
			shadowRadius: 6,
			shadowOffset: { width: 0, height: 3 },
		},
		circleOff: {
			backgroundColor: colors.CONTROL_SECONDARY_BACKGROUND_DEFAULT,
			borderColor: colors.CONTROL_SECONDARY_BORDER_DEFAULT,
			opacity: 0.88,
		},
		circleDragging: {
			transform: [{ scale: 1.12 }],
		},
		iconOff: {
			opacity: 0.75,
		},
		circleOn: {
			backgroundColor: colors.CONTROL_PRIMARY_BACKGROUND_DEFAULT,
			borderColor: colors.CONTROL_PRIMARY_TEXT_DEFAULT,
			borderWidth: 3,
			elevation: 10,
		},
		icon: {
			width: ICON_SIZE,
			height: ICON_SIZE,
		},
		chipWrap: {
			position: 'absolute',
			top: SIZE + 4,
			left: -20,
			width: SIZE + 40,
			alignItems: 'center',
		},
		chip: {
			color: colors.CONTROL_PRIMARY_TEXT_DEFAULT,
			backgroundColor: colors.CONTROL_PRIMARY_BACKGROUND_DEFAULT,
			fontSize: 10,
			fontWeight: '700',
			letterSpacing: 0.6,
			paddingHorizontal: 8,
			paddingVertical: 2,
			borderRadius: 8,
			overflow: 'hidden',
		},
		hintWrap: {
			position: 'absolute',
			left: -70,
			width: SIZE + 140,
			alignItems: 'center',
		},
		hint: {
			color: colors.TEXT_DEFAULT,
			backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
			fontSize: 12,
			paddingHorizontal: 10,
			paddingVertical: 5,
			borderRadius: 10,
			overflow: 'hidden',
			textAlign: 'center',
		},
	})
})

const clamp = (n: number, min: number, max: number) =>
	Math.min(max, Math.max(min, n))

export function FloatingFreezeButton() {
	const styles = useStyles()
	const { width, height } = useWindowDimensions()
	const frozen = useFrozen()
	const { position } = useSettings()
	const [dragging, setDragging] = useState(false)
	const [hint, setHint] = useState('')
	const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	const bounds = {
		minX: MARGIN,
		maxX: Math.max(MARGIN, width - SIZE - MARGIN),
		minY: TOP_INSET,
		maxY: Math.max(TOP_INSET, height - SIZE - BOTTOM_INSET),
	}
	// The pan responder is created once, so it reads the latest bounds from here
	const boundsRef = useRef(bounds)
	boundsRef.current = bounds

	const toPixels = (fx: number, fy: number) => ({
		x: bounds.minX + fx * (bounds.maxX - bounds.minX),
		y: bounds.minY + fy * (bounds.maxY - bounds.minY),
	})

	const [pos, setPos] = useState(() => toPixels(position.x, position.y))
	const current = useRef(pos)
	const drag = useRef({ startX: 0, startY: 0, moved: false })

	const moveTo = (next: { x: number; y: number }) => {
		current.current = next
		setPos(next)
	}

	// Follows the saved position and the screen size (rotation, reset button)
	useEffect(() => {
		if (!drag.current.moved) moveTo(toPixels(position.x, position.y))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [position.x, position.y, width, height])

	useEffect(
		() => () => {
			if (hintTimer.current) clearTimeout(hintTimer.current)
		},
		[],
	)

	const showHint = (text: string) => {
		setHint(text)
		if (hintTimer.current) clearTimeout(hintTimer.current)
		hintTimer.current = setTimeout(() => setHint(''), HINT_DURATION)
	}

	const onTap = () => {
		try {
			const result = toggle()
			if (result === 'ok') showHint('Member list frozen')
			else if (result === 'unfrozen') showHint('Member list live again')
			else if (result !== 'already')
				showHint(describeFailure(result) ?? 'Could not freeze')
		} catch {
			showHint('Something went wrong')
		}
	}
	const onTapRef = useRef(onTap)
	onTapRef.current = onTap

	const finish = (allowTap: boolean) => {
		const { moved } = drag.current
		drag.current.moved = false
		if (!moved) {
			if (allowTap) onTapRef.current()
			return
		}
		setDragging(false)
		// A drag only saves the new position and never toggles the freeze
		const b = boundsRef.current
		savePosition(
			(current.current.x - b.minX) / (b.maxX - b.minX || 1),
			(current.current.y - b.minY) / (b.maxY - b.minY || 1),
		)
	}

	const responder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderTerminationRequest: () => false,
			onPanResponderGrant: () => {
				drag.current = {
					startX: current.current.x,
					startY: current.current.y,
					moved: false,
				}
			},
			onPanResponderMove: (_event, gesture) => {
				const d = drag.current
				if (!d.moved) {
					if (Math.hypot(gesture.dx, gesture.dy) < TAP_SLOP) return
					d.moved = true
					setDragging(true)
				}
				const b = boundsRef.current
				moveTo({
					x: clamp(d.startX + gesture.dx, b.minX, b.maxX),
					y: clamp(d.startY + gesture.dy, b.minY, b.maxY),
				})
			},
			onPanResponderRelease: () => finish(true),
			onPanResponderTerminate: () => finish(false),
		}),
	).current

	return (
		<View
			{...responder.panHandlers}
			accessible
			accessibilityRole="button"
			accessibilityLabel="Freeze member list"
			accessibilityState={{ checked: frozen }}
			style={[styles.touch, { left: pos.x, top: pos.y }]}
		>
			<View
				style={[styles.circle, frozen ? styles.circleOn : styles.circleOff]}
			>
				<Image
					source={{ uri: SNOWFLAKE_URI }}
					resizeMode="contain"
					style={[styles.icon, !frozen && styles.iconOff]}
				/>
			</View>
			{frozen ? (
				<View pointerEvents="none" style={styles.chipWrap}>
					<Text style={styles.chip}>FROZEN</Text>
				</View>
			) : null}
			{hint ? (
				<View
					pointerEvents="none"
					style={[styles.hintWrap, { top: SIZE + (frozen ? CHIP_HEIGHT : 6) }]}
				>
					<Text style={styles.hint}>{hint}</Text>
				</View>
			) : null}
		</View>
	)
}
