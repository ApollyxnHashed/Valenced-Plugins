import { Component, useEffect, useReducer, useRef, useState } from 'react'
import {
	AppRegistry,
	Image,
	PanResponder,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from 'react-native'
import { isFrozen, subscribe, toggle } from './freeze'
import { SNOWFLAKE_URI } from './snowflake'
import { getUi, isEnabled, setPosition, subscribeUi, useUiState } from './ui-state'
import type { FreezeResult } from './freeze'
import type { ComponentType, ReactNode } from 'react'

const SIZE = 54
const MARGIN = 8
/** Keeps the button out of the status bar and the navigation bar area. */
const TOP_INSET = 56
const BOTTOM_INSET = 64
/** A touch that moves less than this (in dp) counts as a tap, not a drag. */
const TAP_SLOP = 10

const COLORS = {
	offBg: '#1E1F22',
	offBorder: '#6D6F78',
	onBg: '#5865F2',
	onBorder: '#FFFFFF',
	text: '#FFFFFF',
}

const HINTS: Record<string, string> = {
	'no-server': 'Open a server first',
	'no-list': 'Open the member list once first',
	'not-ready': 'Still starting, try again',
}

const clamp = (n: number, min: number, max: number) =>
	Math.min(max, Math.max(min, n))

function useFrozenState() {
	const [, refresh] = useReducer((n: number) => n + 1, 0)
	useEffect(() => subscribe(refresh), [])
	return isFrozen()
}

function FloatingFreezeButton() {
	const { width, height } = useWindowDimensions()
	const frozen = useFrozenState()
	const ui = useUiState()
	const [dragging, setDragging] = useState(false)
	const [hint, setHint] = useState('')
	const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	const bounds = {
		minX: MARGIN,
		maxX: Math.max(MARGIN, width - SIZE - MARGIN),
		minY: TOP_INSET,
		maxY: Math.max(TOP_INSET, height - SIZE - BOTTOM_INSET),
	}
	const boundsRef = useRef(bounds)
	boundsRef.current = bounds

	const toPixels = (fx: number, fy: number) => ({
		x: bounds.minX + fx * (bounds.maxX - bounds.minX),
		y: bounds.minY + fy * (bounds.maxY - bounds.minY),
	})

	const initial = toPixels(ui.position.x, ui.position.y)
	const [pos, setPos] = useState(initial)
	const current = useRef(initial)
	const dragState = useRef({ startX: 0, startY: 0, moved: false })

	// Follows saved position changes and screen size changes (rotation, reset button)
	useEffect(() => {
		if (dragState.current.moved) return
		const p = toPixels(ui.position.x, ui.position.y)
		current.current = p
		setPos(p)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ui.position.x, ui.position.y, width, height])

	useEffect(
		() => () => {
			if (hintTimer.current) clearTimeout(hintTimer.current)
		},
		[],
	)

	const showHint = (text: string) => {
		setHint(text)
		if (hintTimer.current) clearTimeout(hintTimer.current)
		hintTimer.current = setTimeout(() => setHint(''), 2200)
	}

	const onTap = () => {
		let result: FreezeResult | 'unfrozen'
		try {
			result = toggle()
		} catch (e) {
			showHint('Something went wrong')
			return
		}
		if (result === 'ok') showHint('Member list frozen')
		else if (result === 'unfrozen') showHint('Member list live again')
		else if (result !== 'already') showHint(HINTS[result] ?? 'Could not freeze')
	}
	const onTapRef = useRef(onTap)
	onTapRef.current = onTap

	const responder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderTerminationRequest: () => false,
			onPanResponderGrant: () => {
				dragState.current = {
					startX: current.current.x,
					startY: current.current.y,
					moved: false,
				}
			},
			onPanResponderMove: (_e, g) => {
				const d = dragState.current
				if (!d.moved && Math.hypot(g.dx, g.dy) < TAP_SLOP) return
				if (!d.moved) {
					d.moved = true
					setDragging(true)
				}
				const b = boundsRef.current
				const x = clamp(d.startX + g.dx, b.minX, b.maxX)
				const y = clamp(d.startY + g.dy, b.minY, b.maxY)
				current.current = { x, y }
				setPos({ x, y })
			},
			onPanResponderRelease: () => finish(true),
			onPanResponderTerminate: () => finish(false),
		}),
	).current

	function finish(allowTap: boolean) {
		const d = dragState.current
		if (d.moved) {
			setDragging(false)
			const b = boundsRef.current
			const spanX = b.maxX - b.minX || 1
			const spanY = b.maxY - b.minY || 1
			// Saving after the drag: a drag never toggles the freeze
			setPosition(
				(current.current.x - b.minX) / spanX,
				(current.current.y - b.minY) / spanY,
			)
			d.moved = false
		} else if (allowTap) {
			onTapRef.current()
		}
	}


	return (
		<View
			{...responder.panHandlers}
			accessible
			accessibilityRole="button"
			accessibilityLabel="Freeze member list"
			accessibilityState={{ checked: frozen }}
			style={[
				styles.touch,
				{ left: pos.x, top: pos.y },
			]}
		>
			<View
				style={[
					styles.circle,
					frozen ? styles.circleOn : styles.circleOff,
					dragging && styles.circleDragging,
				]}
			>
				<Image
					source={{ uri: SNOWFLAKE_URI }}
					resizeMode="contain"
					style={[styles.icon, !frozen && styles.iconOff]}
				/>
			</View>
			{frozen ? (
				<View
					pointerEvents="none"
					style={[styles.chipWrap, styles.below]}
				>
					<Text style={styles.chip}>FROZEN</Text>
				</View>
			) : null}
			{hint ? (
				<View
					pointerEvents="none"
					style={[
						styles.hintWrap,
						{ top: SIZE + (frozen ? 28 : 6) },
					]}
				>
					<Text style={styles.hint}>{hint}</Text>
				</View>
			) : null}
		</View>
	)
}

/** If the button ever throws while rendering, it disappears instead of taking the app down. */
class SafeBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch(error: unknown) {
	}
	render() {
		return this.state.failed ? null : this.props.children
	}
}

function FreezeOverlay() {
	useUiState()
	if (!isEnabled() || !getUi().visible) return null

	return (
		<SafeBoundary>
			<View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
				<FloatingFreezeButton />
			</View>
		</SafeBoundary>
	)
}

const MOUNTED_KEY = '__axonyumFreezeMemberListOverlayMounted'

/** True once the overlay has been drawn in this app session (survives disabling and enabling the plugin). */
export function wasOverlayMounted(): boolean {
	try {
		return (globalThis as any)[MOUNTED_KEY] === true
	} catch {
		return false
	}
}

function markOverlayMounted() {
	try {
		;(globalThis as any)[MOUNTED_KEY] = true
	} catch {}
}

type WrapperProvider = (params: any) => ComponentType<any>

let previousProvider: WrapperProvider | undefined

function makeProvider(): WrapperProvider {
	return params => {
		let Previous: ComponentType<any> | undefined
		try {
			Previous = previousProvider?.(params)
		} catch (e) {
		}

		return function FreezeWrapper(props: { children?: ReactNode }) {
			// Remember that the app tree really contains the overlay, for the whole app session
			useEffect(() => {
				markOverlayMounted()
			}, [])
			return (
				<>
					{Previous ? <Previous {...props} /> : props.children}
					<FreezeOverlay />
				</>
			)
		}
	}
}

/**
 * Puts the overlay on top of the whole app using React Native's own AppRegistry hook.
 * Only works when called before the app's first render (plugin start at launch).
 * Returns a function that gives the wrapper slot back.
 */
export function installOverlay(
	patchInstead: (
		target: object,
		key: string,
		hook: (this: unknown, args: any[], orig: any) => unknown,
	) => () => unknown,
) {
	const registry = AppRegistry as any
	const originalSet = registry.setWrapperComponentProvider
	if (typeof originalSet !== 'function') {
		return () => {}
	}

	const provider = makeProvider()

	// If the app registers its own wrapper later, keep it and put ours around it
	const unpatch = patchInstead(registry, 'setWrapperComponentProvider', function (args, orig) {
		previousProvider = args[0]
		return Reflect.apply(orig, this, [provider])
	})

	Reflect.apply(originalSet, registry, [provider])

	// Same subscription lets the overlay hide itself right away when the UI state changes
	void subscribeUi

	return () => {
		unpatch()
		try {
			Reflect.apply(originalSet, registry, [previousProvider])
		} catch {}
		previousProvider = undefined
	}
}

const styles = StyleSheet.create({
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
		shadowColor: '#000',
		shadowOpacity: 0.35,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 3 },
	},
	circleOff: {
		backgroundColor: COLORS.offBg,
		borderColor: COLORS.offBorder,
		opacity: 0.88,
	},
	circleOn: {
		backgroundColor: COLORS.onBg,
		borderColor: COLORS.onBorder,
		borderWidth: 3,
		elevation: 10,
	},
	circleDragging: {
		transform: [{ scale: 1.12 }],
		opacity: 1,
	},
	icon: {
		width: 28,
		height: 28,
	},
	iconOff: {
		opacity: 0.75,
	},
	chipWrap: {
		position: 'absolute',
		left: -20,
		width: SIZE + 40,
		alignItems: 'center',
	},
	below: { top: SIZE + 4 },
	chip: {
		color: COLORS.text,
		backgroundColor: COLORS.onBg,
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
		color: COLORS.text,
		backgroundColor: 'rgba(0,0,0,0.82)',
		fontSize: 12,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 10,
		overflow: 'hidden',
		textAlign: 'center',
	},
})
