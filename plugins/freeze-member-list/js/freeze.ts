import { Dispatcher } from '@valenced/discord/common/flux'
import { getStore, Stores } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { useReRender } from '@valenced/utils/react'
import { useEffect } from 'react'

/*
 * Freeze Member List: the freeze logic (no UI).
 *
 * The member list component reads { listId, groups, rows } from ChannelMemberStore.getProps,
 * which holds the sections and the position of every member. Each row then reads status,
 * mobile flag and activities from PresenceStore by user id.
 *
 * Freezing happens only at presentation level: both reads return a snapshot while frozen.
 * No Flux event is blocked and the Gateway connection is never touched.
 */

export type FreezeResult =
	| 'ok'
	| 'already'
	| 'no-server'
	| 'no-list'
	| 'not-ready'

interface MemberListProps {
	listId: string
	groups: unknown[]
	rows: unknown[]
}

interface MemberRow {
	type: 'MEMBER'
	userId: string
}

interface PresenceStore {
	getStatus(userId: string): unknown
	isMobileOnline(userId: string): unknown
	isVROnline(userId: string): unknown
	getPrimaryActivity(userId: string): unknown
	getActivities(userId: string, guildId?: string): unknown
	emitChange?(): void
}

type PatchedPresenceMethod =
	| 'getStatus'
	| 'isMobileOnline'
	| 'isVROnline'
	| 'getPrimaryActivity'
	| 'getActivities'

interface ChannelMemberStore {
	getProps(guildId: string, channelId: string): MemberListProps | undefined
	emitChange?(): void
}

interface MemberPresence {
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
	listId: string
	props: MemberListProps
	presence: Map<string, MemberPresence>
}

const LIST_UPDATE_EVENT = 'GUILD_MEMBER_LIST_UPDATE'

/** Why a freeze could not start, in words short enough for a hint. */
const FAILURE_MESSAGES: Partial<Record<FreezeResult, string>> = {
	'no-server': 'Open a server first',
	'no-list': 'Open the member list once first',
	'not-ready': 'Still starting, try again',
}

export const describeFailure = (result: FreezeResult) =>
	FAILURE_MESSAGES[result]

let snapshot: Snapshot | undefined
let started = false
const listeners = new Set<() => void>()

function notify() {
	for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export const isFrozen = () => snapshot !== undefined

/** Re-renders the component whenever the list is frozen or unfrozen. */
export function useFrozen() {
	const reRender = useReRender()
	useEffect(() => subscribe(reRender), [reRender])
	return isFrozen()
}

function readStore<T>(name: string): T | undefined {
	try {
		return Stores[name] as unknown as T
	} catch {
		return undefined
	}
}

function selectedId(
	store: 'SelectedGuildStore' | 'SelectedChannelStore',
): string | undefined {
	const selected = readStore<{
		getGuildId?(): string | null
		getChannelId?(): string | null
	}>(store)
	return (
		(store === 'SelectedGuildStore'
			? selected?.getGuildId?.()
			: selected?.getChannelId?.()) ?? undefined
	)
}

/** Makes subscribed components read the stores again, so the list redraws right away. */
function refreshList() {
	readStore<ChannelMemberStore>('ChannelMemberStore')?.emitChange?.()
	readStore<PresenceStore>('PresenceStore')?.emitChange?.()
}

const isMemberRow = (row: unknown): row is MemberRow =>
	typeof row === 'object' &&
	row !== null &&
	(row as MemberRow).type === 'MEMBER' &&
	typeof (row as MemberRow).userId === 'string'

export function freeze(): FreezeResult {
	if (snapshot) return 'already'
	if (!started) return 'not-ready'

	const guildId = selectedId('SelectedGuildStore')
	const channelId = selectedId('SelectedChannelStore')
	if (!guildId || !channelId) return 'no-server'

	const members = readStore<ChannelMemberStore>('ChannelMemberStore')
	const presence = readStore<PresenceStore>('PresenceStore')
	if (!members || !presence) return 'not-ready'

	// Nothing is frozen yet, so this is the same as the original getProps
	const props = members.getProps(guildId, channelId)
	if (!props || !Array.isArray(props.rows) || typeof props.listId !== 'string')
		return 'no-list'

	const memberPresence = new Map<string, MemberPresence>()
	for (const row of props.rows) {
		if (!isMemberRow(row) || memberPresence.has(row.userId)) continue
		const id = row.userId
		memberPresence.set(id, {
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
		listId: props.listId,
		props: {
			...props,
			groups: Array.isArray(props.groups) ? props.groups.slice() : [],
			// Rows are copied too, in case the store edits them in place
			rows: props.rows.map(row =>
				typeof row === 'object' && row !== null ? { ...row } : row,
			),
		},
		presence: memberPresence,
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
	if (!snapshot) return freeze()
	unfreeze()
	return 'unfrozen'
}

/** Presence of a frozen member, or undefined when this read must stay live. */
function frozenPresence(userId: unknown): MemberPresence | undefined {
	if (!snapshot || typeof userId !== 'string') return
	const entry = snapshot.presence.get(userId)
	if (!entry) return
	// Only the frozen server, and never while the app is processing the list update itself
	if (selectedId('SelectedGuildStore') !== snapshot.guildId) return
	if (Dispatcher._currentDispatchActionType === LIST_UPDATE_EVENT) return
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
		getStore('ChannelMemberStore', (members: ChannelMemberStore) => {
			cleanup(
				instead(members, 'getProps', function (args, original) {
					const result = Reflect.apply(original, this, args) as
						| MemberListProps
						| undefined
					return snapshot && result?.listId === snapshot.listId
						? snapshot.props
						: result
				}),
			)
		}),
	)

	cleanup(
		getStore('PresenceStore', (presence: PresenceStore) => {
			const picks: Array<
				[
					PatchedPresenceMethod,
					(entry: MemberPresence, args: unknown[]) => unknown,
				]
			> = [
				['getStatus', entry => entry.status],
				['isMobileOnline', entry => entry.mobile],
				['isVROnline', entry => entry.vr],
				['getPrimaryActivity', entry => entry.primary],
				[
					'getActivities',
					(entry, args) =>
						args[1] != null && args[1] === snapshot?.guildId
							? entry.guildActivities
							: entry.activities,
				],
			]

			for (const [method, pick] of picks) {
				if (typeof presence[method] !== 'function') continue
				cleanup(
					instead(presence, method, function (args, original) {
						const entry = frozenPresence(args[0])
						return entry
							? pick(entry, args)
							: Reflect.apply(original, this, args)
					}),
				)
			}
		}),
	)
}
