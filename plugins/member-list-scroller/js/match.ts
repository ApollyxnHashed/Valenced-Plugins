/** Key Discord gives the server member list (and its search results) when it renders UsersFastList. */
const GUILD_LIST_KEY_PREFIX = 'guild-channel-user-list'

/**
 * Prop the host sets on the list it renders itself. insteadJSX also sees that inner render, so
 * without this mark the group chat and thread lists (which match by their props, not by a key)
 * would be wrapped again and again, forever.
 */
export const HOSTED_PROP = 'mlsHosted'

export interface MatchProps {
	sections?: unknown
	inActionSheet?: unknown
	disableBackgroundOverlay?: unknown
	listStyleOverride?: unknown
	[key: string]: unknown
}

/**
 * Which UsersFastList renders are member lists.
 * The server list is told apart by its key. The group chat and thread lists (rendered in the same
 * panel) are the ones that hide the background overlay and take a list style override. Friends,
 * search and share lists do neither, and lists inside action sheets are left alone.
 * A list the host already rendered is never matched again.
 */
export function isMemberList(props: MatchProps, key: unknown) {
	if (props[HOSTED_PROP] === true) return false
	if (!Array.isArray(props.sections) || props.inActionSheet === true)
		return false
	if (typeof key === 'string' && key.startsWith(GUILD_LIST_KEY_PREFIX))
		return true
	return (
		props.disableBackgroundOverlay === true && props.listStyleOverride != null
	)
}
