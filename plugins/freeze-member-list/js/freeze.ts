import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores, getStore } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'

/*
 * Freeze Member List: core logic (no UI).
 *
 * What the real Discord client does (verified with the diagnostic logs):
 * - The list component (GuildChannelUserList) reads { listId, groups, rows } from
 *   ChannelMemberStore.getProps(guildId, channelId). Sections and member positions live there.
 * - Each row reads status, mobile flag and activities from PresenceStore, by user id.
 *
 * So freezing is done only at presentation level: both reads return a snapshot while frozen.
 * No Flux event is blocked and the Gateway connection is never touched.
 */

interface PresenceSnapshot {
	status: unknown
	mobile: unknown
	vr: unknown
	primary: unknown
	/** getActivities(userId) */
	activities: unknown
	/** getActivities(userId, guildId) */
	guildActivities: unknown
}

interface Snapshot {
	guildId: string
	channelId: string
	listId: string
	props: ListProps
	presence: Map<string, PresenceSnapshot>
	takenAt: number
}

interface ListProps {
	listId: string
	groups: unknown[]
	rows: unknown[]
	[key: string]: unknown
}

export type FreezeResult = 'ok' | 'already' | 'no-server' | 'no-list' | 'not-ready'

const LIST_UPDATE_EVENT = 'GUILD_MEMBER_LIST_UPDATE'

let snapshot: Snapshot | undefined
let started = false
const listeners = new Set<() => void>()

function notify() {
	for (const l of listeners) {
		try {
			l()
		} catch {}
	}
}

export function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export const isFrozen = () => snapshot !== undefined

export function getInfo() {
	if (!snapshot) return undefined
	return {
		guildId: snapshot.guildId,
		listId: snapshot.listId,
		rows: snapshot.props.rows.length,
		members: snapshot.presence.size,
		takenAt: snapshot.takenAt,
	}
}

const store = (name: string): any => {
	try {
		return (Stores as Record<string, any>)[name]
	} catch {
		return undefined
	}
}

function currentGuildId(): string | undefined {
	try {
		return store('SelectedGuildStore')?.getGuildId?.() ?? undefined
	} catch {
		return undefined
	}
}

function currentChannelId(): string | undefined {
	try {
		return store('SelectedChannelStore')?.getChannelId?.() ?? undefined
	} catch {
		return undefined
	}
}

/** Makes subscribed components read the stores again, so the list redraws right away. */
function refreshList() {
	for (const name of ['ChannelMemberStore', 'PresenceStore']) {
		try {
			store(name)?.emitChange?.()
		} catch (e) {
		}
	}
}

function isMemberRow(row: any): row is { type: 'MEMBER'; userId: string } {
	return row != null && row.type === 'MEMBER' && typeof row.userId === 'string'
}

export function freeze(): FreezeResult {
	if (snapshot) return 'already'
	if (!started) return 'not-ready'

	const guildId = currentGuildId()
	const channelId = currentChannelId()
	if (!guildId || !channelId) return 'no-server'

	const members = store('ChannelMemberStore')
	const presence = store('PresenceStore')
	if (!members || !presence) return 'not-ready'

	// Original getProps (not the patched one: nothing is frozen yet, so both are the same)
	const props = members.getProps(guildId, channelId) as ListProps | undefined
	if (!props || !Array.isArray(props.rows) || typeof props.listId !== 'string')
		return 'no-list'

	const rows = props.rows.slice()
	const frozenProps: ListProps = {
		...props,
		groups: Array.isArray(props.groups) ? props.groups.slice() : [],
		// Row objects are copied too, in case the store edits them in place
		rows: rows.map(r => (r && typeof r === 'object' ? { ...(r as object) } : r)),
	}

	const snap = new Map<string, PresenceSnapshot>()
	for (const row of rows) {
		if (!isMemberRow(row) || snap.has(row.userId)) continue
		const id = row.userId
		snap.set(id, {
			status: presence.getStatus(id),
			mobile: presence.isMobileOnline(id),
			vr: presence.isVROnline(id),
			primary: presence.getPrimaryActivity(id),
			activities: presence.getActivities(id),
			guildActivities: presence.getActivities(id, guildId),
		})
	}

	snapshot = {
		guildId,
		channelId,
		listId: props.listId,
		props: frozenProps,
		presence: snap,
		takenAt: Date.now(),
	}

	refreshList()
	notify()
	return 'ok'
}

export function unfreeze() {
	if (!snapshot) return
	snapshot = undefined
	refreshList()
	notify()
}

export function toggle(): FreezeResult | 'unfrozen' {
	if (snapshot) {
		unfreeze()
		return 'unfrozen'
	}
	return freeze()
}

/** True while the app is processing the member list event, so the member store reads live presence. */
function inListUpdateDispatch() {
	try {
		return (Dispatcher as any)._currentDispatchActionType === LIST_UPDATE_EVENT
	} catch {
		return false
	}
}

/** Presence of a frozen user, or undefined when this read must stay live. */
function frozenPresence(userId: unknown): PresenceSnapshot | undefined {
	if (!snapshot || typeof userId !== 'string') return
	const entry = snapshot.presence.get(userId)
	if (!entry) return
	if (currentGuildId() !== snapshot.guildId) return
	if (inListUpdateDispatch()) return
	return entry
}

/**
 * Installs the patches. They do nothing until freeze() is called, and they all return
 * to the original behavior as soon as the snapshot is dropped.
 */
export function startFreeze(cleanup: (...fns: Array<() => unknown>) => void) {
	started = true

	cleanup(() => {
		started = false
		snapshot = undefined
		refreshList()
	})

	cleanup(
		getStore('ChannelMemberStore', (members: any) => {
			cleanup(
				instead(members, 'getProps', function (this: unknown, args: any[], orig: any) {
					const result = Reflect.apply(orig, this, args) as ListProps | undefined
					if (!snapshot) return result
					if (result && result.listId === snapshot.listId) return snapshot.props
					return result
				}),
			)
		}),
	)

	cleanup(
		getStore('PresenceStore', (presence: any) => {
			const patch = (
				method: string,
				pick: (entry: PresenceSnapshot, args: any[]) => unknown,
			) => {
				if (typeof presence[method] !== 'function') {
					return
				}
				cleanup(
					instead(presence, method, function (this: unknown, args: any[], orig: any) {
						const entry = snapshot && frozenPresence(args[0])
						return entry ? pick(entry, args) : Reflect.apply(orig, this, args)
					}),
				)
			}

			patch('getStatus', e => e.status)
			patch('isMobileOnline', e => e.mobile)
			patch('isVROnline', e => e.vr)
			patch('getPrimaryActivity', e => e.primary)
			patch('getActivities', (e, args) =>
				args[1] != null && args[1] === snapshot?.guildId ? e.guildActivities : e.activities,
			)
		}),
	)
}
