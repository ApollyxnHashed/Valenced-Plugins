import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { ScrollerHost } from './host'
import { isMemberList } from './match'
import { setEnabled, setHeightHook } from './model'
import type { ComponentType } from 'react'
import type { UsersListProps } from './host'

const USER_LIST_DIR = 'modules/main_tabs_v2/native/shared_components/user_list'
const USERS_LIST_PATH = `${USER_LIST_DIR}/UsersFastList.tsx`
const ROW_HEIGHT_PATH = `${USER_LIST_DIR}/useScaledRowHeight.tsx`
const SECTION_HEIGHT_PATH = `${USER_LIST_DIR}/useScaledSectionHeight.tsx`

interface UsersListModule {
	UsersFastList?: ComponentType<UsersListProps>
}
interface HeightHookModule {
	default?: () => number
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
						// Everything else (group chats, DM user views, threads, friends, share lists) is rendered as Discord does
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
