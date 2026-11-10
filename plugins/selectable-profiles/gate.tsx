import { createElement, useEffect, useSyncExternalStore } from 'react'
import { matchAnchor, matchContains, matchExact } from './matching'
import {
	isStoreHooked,
	refreshValues,
	seen,
	values,
} from './profiles'
import { noop } from './shared'
import { isEnabled } from './storage'
import type { AnyJSXFactoryFunction } from '@valenced/react/jsx-runtime'
import type { ElementType, Key } from 'react'

/**
 * "Is the profile still open?" The line under the display name (username • pronouns)
 * only exists inside a profile. The Gate around that line is an "anchor": while it is
 * mounted the profile is open, and when it unmounts the profile is closed. Every Gate
 * subscribes to that state, so text stops being selectable the moment the profile
 * closes (DM list, member lists and chat go back to normal).
 */

// Only used until the first anchor has ever mounted in this session.
const FallbackOpenMs = 3 * 60 * 1000

const anchors = new Map<string, number>()
const listeners = new Set<() => void>()
let anchorEverMounted = false
let version = 0

const subscribe = (listener: () => void) => {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
const getVersion = () => version

function notify() {
	version++
	for (const listener of [...listeners]) listener()
}

function mountAnchors(userIds: string[]) {
	for (const id of userIds) anchors.set(id, (anchors.get(id) ?? 0) + 1)
	anchorEverMounted = true
	notify()

	return () => {
		for (const id of userIds) {
			const count = (anchors.get(id) ?? 1) - 1
			if (count > 0) anchors.set(id, count)
			else anchors.delete(id)
		}
		notify()
	}
}

function isOpen(userId: string): boolean {
	if (!isStoreHooked()) return true
	if (anchors.has(userId)) return true
	// Until the first anchor shows up we cannot tell, so use a time window instead.
	if (anchorEverMounted) return false

	const entry = seen.get(userId)
	return !!entry && Date.now() - entry.at < FallbackOpenMs
}

export function resetOpenState() {
	anchors.clear()
	anchorEverMounted = false
	notify()
}

/** The user ids a Text element belongs to, per field. */
interface Matches {
	displayName: string[]
	pronouns: string[]
	status: string[]
	anchor: string[]
}

interface TextProps {
	children?: unknown
	onPress?: unknown
}

interface GateProps {
	Type: ElementType
	inner: TextProps
	matches: Matches
}

/** Renders the original Text, selectable while a matching user's profile is open. */
function Gate({ Type, inner, matches }: GateProps) {
	// Re-renders this Gate whenever a profile opens or closes.
	useSyncExternalStore(subscribe, getVersion)

	const { anchor } = matches
	const anchorKey = anchor.join(',')
	useEffect(() => {
		if (anchor.length) return mountAnchors(anchor)
	}, [anchorKey])

	const selectWithPress =
		(isEnabled('displayName') && matches.displayName.some(isOpen)) ||
		(isEnabled('pronouns') && matches.pronouns.some(isOpen))
	const selectPlain = isEnabled('status') && matches.status.some(isOpen)

	if (!selectWithPress && !selectPlain) return createElement(Type, inner)

	return createElement(Type, {
		...inner,
		selectable: true,
		// A Text with a press handler becomes the touch responder, which lets the native
		// long-press selection start inside a pressable parent. The status bubble is
		// tappable (it opens the full status), so it must NOT get one.
		...(selectWithPress && typeof inner.onPress !== 'function'
			? { onPress: noop }
			: {}),
	})
}

type JsxArgs = [type: ElementType, props: TextProps | null, key?: Key]

/** insteadJSX handler for Text: wraps the elements that match a seen user's values. */
export function onText(
	[type, props, key]: JsxArgs,
	jsx: AnyJSXFactoryFunction,
) {
	try {
		// Hot path: this runs for every Text in the app, so bail out quickly.
		if (seen.size && props && props.children !== undefined) {
			refreshValues(Date.now())

			const { children } = props
			const matches: Matches = {
				displayName: [...matchExact(values.displayName, children)],
				pronouns: [...matchContains(values.pronouns, children)],
				status: [...matchExact(values.status, children)],
				anchor: [...matchAnchor([values.username, values.pronouns], children)],
			}

			if (Object.values(matches).some(ids => ids.length))
				return jsx(Gate, { Type: type, inner: props, matches }, key)
		}
	} catch {
		// Fall through to the untouched element.
	}
	return jsx(type, props, key)
}
