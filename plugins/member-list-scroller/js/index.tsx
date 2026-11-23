import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { ScrollerHost } from './host'
import { setEnabled, setHeightHook } from './model'
import type { ComponentType } from 'react'
import type { UsersListProps } from './host'

const USERS_LIST_PATH =
	'modules/main_tabs_v2/native/shared_components/user_list/UsersFastList.tsx'
const ROW_HEIGHT_PATH =
	'modules/main_tabs_v2/native/shared_components/user_list/useScaledRowHeight.tsx'
const SECTION_HEIGHT_PATH =
	'modules/main_tabs_v2/native/shared_components/user_list/useScaledSectionHeight.tsx'

/** Key Discord gives the server member list (and its search results) when it renders UsersFastList. */
const GUILD_LIST_KEY_PREFIX = 'guild-channel-user-list'

interface UsersListModule {
	UsersFastList?: ComponentType<UsersListProps>
}
interface HeightHookModule {
	default?: () => number
}

/**
 * Which UsersFastList renders are member lists.
 * The server list is told apart by its key. The group chat and thread lists (rendered in the same
 * panel) are the ones that hide the background overlay and take a list style override. Friends,
 * search and share lists do neither, and lists inside action sheets are left alone.
 */
function isMemberList(props: UsersListProps, key: unknown) {
	if (!Array.isArray(props.sections) || props.inActionSheet === true)
		return false
	if (typeof key === 'string' && key.startsWith(GUILD_LIST_KEY_PREFIX))
		return true
	return (
		props.disableBackgroundOverlay === true && props.listStyleOverride != null
	)
}

export default plugin({
	start({ cleanup, logger }) {
		setEnabled(true)
		cleanup(() => setEnabled(false))

		cleanup(
			getModuleWithImportedPath<UsersListModule>(USERS_LIST_PATH, exports => {
				const UsersFastList = exports?.UsersFastList
				if (typeof UsersFastList !== 'function') {
					logger.warn(
						'UsersFastList export not found: the handle is not installed',
					)
					return
				}

				// The row and header heights come from Discord's own hooks, so they follow the font size.
				// If they are not initialized yet, the handle falls back to a rougher estimate until they are.
				getModuleWithImportedPath<HeightHookModule>(ROW_HEIGHT_PATH, mod => {
					if (typeof mod?.default === 'function')
						setHeightHook('row', mod.default)
				})
				getModuleWithImportedPath<HeightHookModule>(
					SECTION_HEIGHT_PATH,
					mod => {
						if (typeof mod?.default === 'function')
							setHeightHook('section', mod.default)
					},
				)

				cleanup(
					insteadJSX(UsersFastList, ([type, props, key], jsx) => {
						// The host renders the list again without a key, which comes through here untouched
						if (!isMemberList(props as UsersListProps, key))
							return jsx(type, props, key)
						return jsx(
							ScrollerHost,
							{ List: type, listProps: props as UsersListProps },
							key,
						)
					}),
				)
			}),
		)
	},
})
