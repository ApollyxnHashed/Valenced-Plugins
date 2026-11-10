import { getStore, Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginApi } from '@valenced/plugins/types'

/**
 * Which users have a profile on screen, and which texts belong to them.
 *
 * Discord gives the display name, pronouns and status no stable component to patch,
 * so we learn each user's values whenever their profile is read from the store and
 * match `Text` elements against them (see gate.tsx).
 */

// How long a user stays "seen" after the profile store was last asked about them.
const SeenTtlMs = 30 * 60 * 1000
const RebuildEveryMs = 4000
const CustomStatusActivityType = 4

interface Seen {
	at: number
	pronouns: Set<string>
	guildIds: Set<string>
}

// value -> ids of the users that have that value
export type ValueMap = Map<string, Set<string>>

export interface Values {
	displayName: ValueMap
	pronouns: ValueMap
	status: ValueMap
	// Only used to recognise the profile's username line, never made selectable.
	username: ValueMap
}

type Store<T> = DiscordModules.Flux.Store<T>

interface User {
	username?: string
	discriminator?: string
	globalName?: string | null
}

interface ProfileStore {
	getUserProfile?(userId: string): unknown
	getGuildMemberProfile?(userId: string, guildId: string): unknown
}

export const seen = new Map<string, Seen>()
export let values = emptyValues()

let dirty = true
let lastBuild = 0
let storeHooked = false

// If the profile store cannot be watched, nothing can be scoped to an open profile.
export const isStoreHooked = () => storeHooked

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
	return typeof value === 'string' ? value.trim() || undefined : undefined
}

// Called every time Discord reads a profile.
function touch(userId: unknown, profile: unknown, guildId?: unknown) {
	if (typeof userId !== 'string') return

	let entry = seen.get(userId)
	if (!entry) {
		entry = { at: 0, pronouns: new Set(), guildIds: new Set() }
		seen.set(userId, entry)
		dirty = true
	}
	entry.at = Date.now()

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

function collectValues(userId: string, entry: Seen, into: Values) {
	const UserStore = Stores.UserStore as Store<{
		getUser(id: string): User | undefined
	}>
	const GuildMemberStore = Stores.GuildMemberStore as Store<{
		getMember(guildId: string, userId: string): { nick?: string | null } | null
	}>
	const SelectedGuildStore = Stores.SelectedGuildStore as Store<{
		getGuildId(): string | null | undefined
	}>
	const PresenceStore = Stores.PresenceStore as Store<{
		getActivities(userId: string): { type?: number; state?: string | null }[]
	}>

	const user = UserStore.getUser(userId)
	if (user) {
		const globalName = clean(user.globalName)
		const username = clean(user.username)

		// Without a display name Discord shows the username as the name.
		const displayName = globalName ?? username
		if (displayName) put(into.displayName, displayName, userId)

		if (username) {
			put(into.username, username, userId)
			put(into.username, `@${username}`, userId)
			if (user.discriminator && user.discriminator !== '0')
				put(into.username, `${username}#${user.discriminator}`, userId)
		}
	}

	const guildIds = new Set(entry.guildIds)
	const selectedGuildId = SelectedGuildStore.getGuildId()
	if (selectedGuildId) guildIds.add(selectedGuildId)
	for (const guildId of guildIds) {
		const nick = clean(GuildMemberStore.getMember(guildId, userId)?.nick)
		if (nick) put(into.displayName, nick, userId)
	}

	for (const pronouns of entry.pronouns) put(into.pronouns, pronouns, userId)

	for (const activity of PresenceStore.getActivities(userId) ?? []) {
		const state =
			activity?.type === CustomStatusActivityType
				? clean(activity.state)
				: undefined
		if (state) put(into.status, state, userId)
	}
}

/** Rebuilds the value sets when something changed, at most every few seconds. */
export function refreshValues(now: number) {
	if (!dirty && now - lastBuild <= RebuildEveryMs) return

	for (const [id, entry] of seen)
		if (now - entry.at > SeenTtlMs) seen.delete(id)

	const next = emptyValues()
	for (const [id, entry] of seen) {
		try {
			collectValues(id, entry, next)
		} catch {
			// One broken user must not stop the others.
		}
	}

	values = next
	dirty = false
	lastBuild = now
}

export const markValuesDirty = () => {
	dirty = true
}

/** Learns which users are on screen by watching reads of the profile store. */
export function watchProfileStore({
	cleanup,
	logger,
}: Pick<PluginApi, 'cleanup' | 'logger'>) {
	cleanup(
		getStore<ProfileStore>('UserProfileStore', store => {
			storeHooked = false

			for (const method of [
				'getUserProfile',
				'getGuildMemberProfile',
			] as const) {
				if (typeof store[method] !== 'function') continue

				cleanup(
					instead(store as Required<ProfileStore>, method, function (
						args,
						original,
					) {
						const profile = Reflect.apply(original, this, args)
						// Only the guild member profile is read for a specific guild.
						touch(
							args[0],
							profile,
							method === 'getGuildMemberProfile' ? args[1] : undefined,
						)
						return profile
					}),
				)
				storeHooked = true
			}

			dirty = true
			if (!storeHooked)
				logger.warn(
					'UserProfileStore has no getUserProfile/getGuildMemberProfile; display name, pronouns and status cannot be detected.',
				)
		}),
	)
}

export function resetProfiles() {
	seen.clear()
	values = emptyValues()
	dirty = true
	storeHooked = false
}
