import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { cloneElement, createElement } from 'react'
import { useSettings } from './settings'
import { VolumeControls } from './VolumeControls'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { Api } from './settings'

// Key of the row that holds Discord's own volume slider
const VOLUME_ROW_KEY = 'set-volume'
const CONTROLS_KEY = 'better-volume-controls'

interface VoiceSettingsProps {
	user?: { id: string }
	currentUser?: { id: string }
}

type VoiceSettings = (props: VoiceSettingsProps) => ReactNode

// Stable wrapper per Discord component, so React keeps its state between renders
const wrappers = new WeakMap<VoiceSettings, ComponentType<VoiceSettingsProps>>()

function isElement(
	node: unknown,
): node is ReactElement<{ children?: ReactNode }> {
	const candidate = node as { $$typeof?: unknown; props?: unknown } | null
	return (
		typeof candidate === 'object' &&
		candidate !== null &&
		candidate.$$typeof !== undefined &&
		typeof candidate.props === 'object'
	)
}

// Raises the limit of Discord's own slider, which is either a TableSliderRow (maxValue)
// or a VolumeSlider (maxVolume). Both count in percent, like our limit.
function raiseSliderLimit(
	node: ReactNode,
	limit: number,
	depth = 0,
): ReactNode {
	if (depth > 3 || !isElement(node)) return node
	const props = node.props as Record<string, unknown>

	if (typeof props.maxValue === 'number') {
		return cloneElement(node, { maxValue: limit } as object)
	}
	if (
		typeof props.onValueChange === 'function' &&
		typeof props.value === 'number'
	) {
		return cloneElement(node, { maxVolume: limit } as object)
	}

	const { children } = node.props
	if (Array.isArray(children)) {
		// Only the first slider is the user volume; a second one would be the stream volume
		for (let i = 0; i < children.length; i++) {
			const inner = raiseSliderLimit(children[i], limit, depth + 1)
			if (inner === children[i]) continue
			const copy = [...children]
			copy[i] = inner
			return cloneElement(node, undefined, ...copy)
		}
		return node
	}
	const inner = raiseSliderLimit(children, limit, depth + 1)
	return inner === children ? node : cloneElement(node, undefined, inner)
}

// Returns a copy of the tree with our row after the volume slider, or the same node if it isn't there
function insertControls(
	node: ReactNode,
	userId: string,
	limit: number,
	depth = 0,
): ReactNode {
	if (depth > 10 || !isElement(node)) return node

	const { children } = node.props
	if (Array.isArray(children)) {
		const index = children.findIndex(
			child => isElement(child) && child.key === VOLUME_ROW_KEY,
		)
		if (index >= 0) {
			const next = [...children]
			next[index] = raiseSliderLimit(next[index], limit)
			next.splice(
				index + 1,
				0,
				createElement(VolumeControls, { key: CONTROLS_KEY, userId }),
			)
			return cloneElement(node, undefined, ...next)
		}
		for (let i = 0; i < children.length; i++) {
			const inner = insertControls(children[i], userId, limit, depth + 1)
			if (inner === children[i]) continue
			const copy = [...children]
			copy[i] = inner
			return cloneElement(node, undefined, ...copy)
		}
		return node
	}

	const inner = insertControls(children, userId, limit, depth + 1)
	return inner === children ? node : cloneElement(node, undefined, inner)
}

function wrap(original: VoiceSettings): ComponentType<VoiceSettingsProps> {
	let wrapper = wrappers.get(original)
	if (!wrapper) {
		// Runs Discord's component as part of ours, then adds the row to what it returned
		wrapper = function BetterVolumeVoiceSettings(props) {
			const rendered = original(props)
			const { maxVolume } = useSettings()
			return props.user
				? insertControls(rendered, props.user.id, maxVolume)
				: rendered
		}
		wrappers.set(original, wrapper)
	}
	return wrapper
}

/** Adds the volume controls to the voice settings of other users' profiles. */
export function installProfileControls(
	cleanup: Api['cleanup'],
	plugin: Api['plugin'],
): void {
	cleanup(
		getModuleWithImportedPath<{ default: VoiceSettings }>(
			'modules/user_profile/native/UserProfileVoiceSettings.tsx',
			module => {
				cleanup(
					instead(module, 'default', ([props], original) => {
						const rendered = original(props)
						try {
							// Your own profile has no volume slider
							if (!props.user || props.user.id === props.currentUser?.id) {
								return rendered
							}
							if (!isElement(rendered) || typeof rendered.type !== 'function') {
								return rendered
							}
							return createElement(
								wrap(rendered.type as VoiceSettings),
								rendered.props as VoiceSettingsProps,
							)
						} catch (error) {
							plugin.reportError(error)
							return rendered
						}
					}),
				)
			},
		),
	)
}
