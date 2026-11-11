import { instead } from '@valenced/patcher'
import { Component, useEffect } from 'react'
import { AppRegistry, StyleSheet, View } from 'react-native'
import { FloatingFreezeButton } from './button'
import { markOverlayMounted, useIsActive, useSettings } from './state'
import type { ComponentType, ReactNode } from 'react'

type WrapperProvider = (
	params: unknown,
) => ComponentType<{ children?: ReactNode }>

/** If the button ever throws while rendering, it disappears instead of taking the app down. */
class SafeBoundary extends Component<
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

function FreezeOverlay() {
	const active = useIsActive()
	const { visible } = useSettings()
	if (!active || !visible) return null

	return (
		<SafeBoundary>
			<View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
				<FloatingFreezeButton />
			</View>
		</SafeBoundary>
	)
}

/**
 * Puts the overlay on top of the whole app, using the wrapper slot that React Native itself
 * offers through AppRegistry. The slot is read when the app renders its root, so this only
 * takes effect when called before the first render (plugin start at launch).
 * Returns a function that gives the slot back.
 */
export function installOverlay() {
	// Taken before patching, so setting our own provider does not go through the patch
	const setProvider = AppRegistry.setWrapperComponentProvider
	let previousProvider: WrapperProvider | undefined

	const provider: WrapperProvider = params => {
		const Previous = previousProvider?.(params)

		return function FreezeWrapper({ children }) {
			// From now on the overlay is part of the app tree until the app restarts
			useEffect(markOverlayMounted, [])

			return (
				<>
					{Previous ? <Previous>{children}</Previous> : children}
					<FreezeOverlay />
				</>
			)
		}
	}

	// If the app sets its own wrapper later, keep it and put the overlay around it
	const unpatch = instead(
		AppRegistry,
		'setWrapperComponentProvider',
		function (args) {
			previousProvider = args[0]
			return Reflect.apply(setProvider, this, [provider])
		},
	)

	Reflect.apply(setProvider, AppRegistry, [provider])

	return () => {
		unpatch()
		// Gives the slot back to what was there before (nothing, unless the app set its own)
		Reflect.apply(setProvider, AppRegistry, [previousProvider])
		previousProvider = undefined
	}
}
