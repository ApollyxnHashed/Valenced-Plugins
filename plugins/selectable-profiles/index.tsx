import { Design } from '@valenced/discord/design'
import { getStore, onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { ReactNative } from '@valenced/react'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { createElement, useEffect, useSyncExternalStore } from 'react'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { ElementType } from 'react'
import type { FieldKey, Settings } from './shared'

/**
 * How it works
 *
 * - Bio: the `BioText` component is patched (same technique as the
 *   "Selectable Bios" community plugin).
 * - Display name, pronouns and status: Discord gives these no stable component
 *   we can patch, so we look at the text itself. While a profile is read from
 *   `UserProfileStore`, that user counts as "seen". Any `Text` whose content
 *   equals one of that user's values is wrapped in a small `Gate` component.
 * - "Is the profile still open?": the line under the display name
 *   (username • pronouns) only exists inside a profile. The Gate around that
 *   line is an "anchor": while it is mounted the profile is open, when it
 *   unmounts the profile is closed. Every other Gate subscribes to that state,
 *   so the text stops being selectable the moment the profile closes (DM list,
 *   member lists and chat go back to normal).
 */

// How long a user stays "seen" after the profile store was last asked about them.
const SeenTtlMs = 30 * 60 * 1000
// Only used until the first anchor has ever mounted in this session.
const FallbackOpenMs = 3 * 60 * 1000
const RebuildEveryMs = 4000
const MinContainsLength = 3
const MaxContainsTextLength = 80
const MaxNesting = 3

const CustomStatusActivityType = 4

interface Seen {
	at: number
	pronouns: Set<string>
	guildIds: Set<string>
}

interface User {
	username?: string
	discriminator?: string
	globalName?: string | null
}

type UserStore = { getUser(id: string): User | undefined }
type GuildMemberStore = {
	getMember(guildId: string, userId: string): { nick?: string | null } | null
}
type SelectedGuildStore = { getGuildId(): string | null | undefined }
type PresenceStore = {
	getUserIds(): string[]
	getActivities(userId: string): { type?: number; state?: string | null }[]
}

// value -> ids of the users that have that value
type ValueMap = Map<string, Set<string>>
interface Values {
	displayName: ValueMap
	pronouns: ValueMap
	status: ValueMap
	// Only used to recognise the anchor line, never made selectable.
	username: ValueMap
}

const noop = () => {}

let storage: JsonStorage<Settings>

const isEnabled = (field: FieldKey) =>
	storage?.cache?.[field] ?? DefaultSettings[field]

const seen = new Map<string, Seen>()
let values: Values = emptyValues()
let dirty = true
let lastBuild = 0
// If we cannot watch the profile store, nothing can be scoped to an open profile.
let profileStoreHooked = false

// --- "profile is open" state -------------------------------------------------

const anchors = new Map<string, number>()
let anchorEverMounted = false
let version = 0
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
const getVersion = () => version
function bump() {
	version++
	for (const listener of [...listeners]) listener()
}

function mountAnchors(userIds: string[]) {
	for (const id of userIds) anchors.set(id, (anchors.get(id) ?? 0) + 1)
	anchorEverMounted = true
	bump()
	return () => {
		for (const id of userIds) {
			const next = (anchors.get(id) ?? 1) - 1
			if (next <= 0) anchors.delete(id)
			else anchors.set(id, next)
		}
		bump()
	}
}

function isOpen(userId: string): boolean {
	if (!profileStoreHooked) return true
	if ((anchors.get(userId) ?? 0) > 0) return true
	// Until the first anchor shows up we cannot tell, so use a time window instead.
	if (!anchorEverMounted) {
		const entry = seen.get(userId)
		return !!entry && Date.now() - entry.at < FallbackOpenMs
	}
	return false
}

// --- values -------------------------------------------------------------------

function emptyValues(): Values {
	return {
		displayName: new Map(),
		pronouns: new Map(),
		status: new Map(),
		username: new Map(),
	}
}

function put(map: ValueMap, value: string, userId: string) {
	let ids = map.get(value)
	if (!ids) map.set(value, (ids = new Set()))
	ids.add(userId)
}

function clean(value: unknown): string | undefined {
	if (typeof value !== 'string') return
	const trimmed = value.trim()
	return trimmed || undefined
}

function store<T>(name: string): T | undefined {
	try {
		return Stores[name] as unknown as T
	} catch {
		return undefined
	}
}

// Called every time Discord reads a profile.
function touch(userId: unknown, profile: unknown, guildId?: unknown) {
	if (typeof userId !== 'string') return

	const now = Date.now()
	let entry = seen.get(userId)
	if (!entry) {
		entry = { at: now, pronouns: new Set(), guildIds: new Set() }
		seen.set(userId, entry)
		dirty = true
	}
	entry.at = now

	const pronouns = clean((profile as { pronouns?: unknown } | null)?.pronouns)
	if (pronouns && !entry.pronouns.has(pronouns)) {
		entry.pronouns.add(pronouns)
		dirty = true
	}

	if (typeof guildId === 'string' && !entry.guildIds.has(guildId)) {
		entry.guildIds.add(guildId)
		dirty = true
	}
}

function addStatuses(
	presences: PresenceStore,
	userId: string,
	into: ValueMap,
) {
	for (const activity of presences.getActivities(userId) ?? []) {
		if (activity?.type !== CustomStatusActivityType) continue
		const state = clean(activity.state)
		if (state) put(into, state, userId)
	}
}

function rebuild(now: number) {
	for (const [id, entry] of seen) {
		if (now - entry.at > SeenTtlMs) seen.delete(id)
	}

	const next = emptyValues()
	const users = store<UserStore>('UserStore')
	const members = store<GuildMemberStore>('GuildMemberStore')
	const presences = store<PresenceStore>('PresenceStore')
	const selectedGuildId = store<SelectedGuildStore>(
		'SelectedGuildStore',
	)?.getGuildId?.()

	for (const [id, entry] of seen) {
		try {
			const user = users?.getUser(id)
			if (user) {
				const globalName = clean(user.globalName)
				const username = clean(user.username)

				if (globalName) put(next.displayName, globalName, id)
				// Without a display name Discord shows the username as the name.
				else if (username) put(next.displayName, username, id)

				if (username) {
					put(next.username, username, id)
					put(next.username, `@${username}`, id)
					if (user.discriminator && user.discriminator !== '0')
						put(next.username, `${username}#${user.discriminator}`, id)
				}
			}

			const guildIds = new Set(entry.guildIds)
			if (selectedGuildId) guildIds.add(selectedGuildId)
			for (const guildId of guildIds) {
				const nick = clean(members?.getMember(guildId, id)?.nick)
				if (nick) put(next.displayName, nick, id)
			}

			for (const pronouns of entry.pronouns) put(next.pronouns, pronouns, id)

			if (presences) addStatuses(presences, id, next.status)
		} catch {
			// One broken user must not stop the others.
		}
	}

	values = next
	dirty = false
	lastBuild = now
}

// --- matching -----------------------------------------------------------------

function forEachText(
	children: unknown,
	callback: (text: string) => void,
	depth = 0,
): void {
	if (typeof children === 'string') return callback(children)
	if (depth >= MaxNesting || !children || typeof children !== 'object') return
	if (Array.isArray(children)) {
		for (const child of children) forEachText(child, callback, depth + 1)
		return
	}
	const inner = (children as { props?: { children?: unknown } }).props
		?.children
	if (inner !== undefined) forEachText(inner, callback, depth + 1)
}

function addAll(into: Set<string>, ids: Iterable<string>) {
	for (const id of ids) into.add(id)
}

function matchExact(map: ValueMap, children: unknown): Set<string> {
	const out = new Set<string>()
	if (!map.size) return out
	forEachText(children, text => {
		const ids = map.get(text.trim())
		if (ids) addAll(out, ids)
	})
	return out
}

// Pronouns can share a line with other text, so allow "contains".
function matchContains(map: ValueMap, children: unknown): Set<string> {
	const out = new Set<string>()
	if (!map.size) return out
	forEachText(children, text => {
		const trimmed = text.trim()
		const exact = map.get(trimmed)
		if (exact) addAll(out, exact)
		if (trimmed.length > MaxContainsTextLength) return
		for (const [value, ids] of map)
			if (value.length >= MinContainsLength && trimmed.includes(value))
				addAll(out, ids)
	})
	return out
}

const Delimiter = /[•·|]/
const delimiterAfter = new RegExp(`^\\s*${Delimiter.source}`)
const delimiterBefore = new RegExp(`${Delimiter.source}\\s*$`)

// Strict on purpose: it decides that "a profile is open".
function isAnchorText(text: string, value: string): boolean {
	if (text === value) return true
	if (text.startsWith(value) && delimiterAfter.test(text.slice(value.length)))
		return true
	return (
		text.endsWith(value) &&
		delimiterBefore.test(text.slice(0, text.length - value.length))
	)
}

function matchAnchor(maps: ValueMap[], children: unknown): Set<string> {
	const out = new Set<string>()
	forEachText(children, text => {
		const trimmed = text.trim()
		for (const map of maps)
			for (const [value, ids] of map)
				if (isAnchorText(trimmed, value)) addAll(out, ids)
	})
	return out
}

// --- the Gate -----------------------------------------------------------------

interface GateProps {
	Type: ElementType
	inner: Record<string, unknown>
	name: string[]
	pronouns: string[]
	status: string[]
	anchor: string[]
}

function Gate({ Type, inner, name, pronouns, status, anchor }: GateProps) {
	// Re-renders this Gate whenever a profile opens or closes.
	useSyncExternalStore(subscribe, getVersion)

	const anchorKey = anchor.join(',')
	useEffect(() => {
		if (!anchor.length) return
		return mountAnchors(anchor)
	}, [anchorKey])

	const withPress =
		(isEnabled('displayName') && name.some(isOpen)) ||
		(isEnabled('pronouns') && pronouns.some(isOpen))
	const plain = isEnabled('status') && status.some(isOpen)

	if (!withPress && !plain) return createElement(Type, inner)

	return createElement(Type, {
		...inner,
		selectable: true,
		// A Text with a press handler becomes the touch responder, which lets the native
		// long-press selection start inside a pressable parent. The status bubble is
		// tappable (it opens the full status), so it must NOT get one.
		...(withPress && typeof inner.onPress !== 'function'
			? { onPress: noop }
			: {}),
	})
}

type JsxArgs = [
	type: unknown,
	props: Record<string, unknown> | null,
	key?: unknown,
]

function onText(args: JsxArgs, jsx: (...a: any[]) => any) {
	try {
		const props = args[1]
		// Hot path: this runs for every Text in the app, so bail out quickly.
		if (seen.size && props && props.children !== undefined) {
			const now = Date.now()
			if (dirty || now - lastBuild > RebuildEveryMs) rebuild(now)

			const { children } = props
			const name = matchExact(values.displayName, children)
			const pronouns = matchContains(values.pronouns, children)
			const status = matchExact(values.status, children)
			const anchor = matchAnchor([values.username, values.pronouns], children)

			if (name.size || pronouns.size || status.size || anchor.size)
				return jsx(
					Gate,
					{
						Type: args[0],
						inner: props,
						name: [...name],
						pronouns: [...pronouns],
						status: [...status],
						anchor: [...anchor],
					},
					args[2],
				)
		}
	} catch {
		// Fall through to the untouched element.
	}
	return jsx(args[0], args[1], args[2])
}

// --- Bio ----------------------------------------------------------------------

function selectAll(node: unknown): void {
	if (!node || typeof node !== 'object') return

	const element = node as {
		type?: unknown
		props?: Record<string, unknown>
	}

	if (element.type === ReactNative.Text && element.props) {
		element.props.selectable = true
		if (typeof element.props.onPress !== 'function')
			element.props.onPress = noop
	}

	const children = element.props?.children
	if (Array.isArray(children)) for (const child of children) selectAll(child)
	else if (children && typeof children === 'object') selectAll(children)
}

type ProfileStore = Record<string, unknown> & {
	getUserProfile?: (userId: string) => unknown
	getGuildMemberProfile?: (userId: string, guildId: string) => unknown
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, logger, plugin }) {
		storage = jsonStorage

		// The Bio patch only works when it is applied before the component is first used.
		if (plugin.startedLate) plugin.requireReload()

		// 1. Bio
		cleanup(
			getModules(
				withName('BioText'),
				module => {
					if (!('default' in module) || typeof module.default !== 'function')
						return

					cleanup(
						after(
							module as Record<'default', (...args: any[]) => any>,
							'default',
							(result: any) => {
								if (!isEnabled('bio') || !result?.props) return result

								result.props.selectable = true
								if (typeof result.props.onPress !== 'function')
									result.props.onPress = noop
								selectAll(result)

								return result
							},
						),
					)
				},
				{ returnNamespace: true, max: 1 },
			),
		)

		// 2. "Which users have a profile on screen?" signal
		cleanup(
			getStore<ProfileStore>('UserProfileStore', profileStore => {
				const target = profileStore as unknown as ProfileStore
				let hooked = false

				if (typeof target.getUserProfile === 'function') {
					cleanup(
						instead(
							target as Record<string, any>,
							'getUserProfile',
							function (this: unknown, args: any[], original: any) {
								const result = Reflect.apply(original, this, args)
								touch(args[0], result)
								return result
							},
						),
					)
					hooked = true
				}

				if (typeof target.getGuildMemberProfile === 'function') {
					cleanup(
						instead(
							target as Record<string, any>,
							'getGuildMemberProfile',
							function (this: unknown, args: any[], original: any) {
								const result = Reflect.apply(original, this, args)
								touch(args[0], result, args[1])
								return result
							},
						),
					)
					hooked = true
				}

				profileStoreHooked = hooked
				dirty = true
				if (!hooked)
					logger.warn(
						'UserProfileStore has no getUserProfile/getGuildMemberProfile; display name, pronouns and status cannot be detected.',
					)
			}),
		)

		// 3. Keep custom statuses fresh
		cleanup(
			onFluxEventDispatched('PRESENCE_UPDATES', payload => {
				dirty = true
				return payload
			}),
		)

		// 4. Wrap matching Text elements
		const textTypes = new Set<unknown>(
			[
				ReactNative?.Text,
				(Design as { Text?: unknown } | undefined)?.Text,
			].filter(Boolean),
		)
		for (const type of textTypes)
			cleanup(insteadJSX(type as any, onText as any))

		logger.info('Selectable Profiles started')
	},
	stop() {
		seen.clear()
		anchors.clear()
		values = emptyValues()
		dirty = true
		profileStoreHooked = false
		anchorEverMounted = false
		bump()
	},
	SettingsComponent,
})
