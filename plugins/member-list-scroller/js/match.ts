/** Key Discord gives the server member list when it renders UsersFastList. */
const GUILD_LIST_KEY = 'guild-channel-user-list'

/**
 * Only the server member list gets a handle, and it is told apart by its key.
 * Group chats, direct message user views, threads, friends, share lists, search results and lists
 * inside action sheets are never matched. The host renders the inner list without a key, so it
 * cannot be matched again either.
 */
export function isMemberList(props: { sections?: unknown }, key: unknown) {
	return key === GUILD_LIST_KEY && Array.isArray(props.sections)
}
