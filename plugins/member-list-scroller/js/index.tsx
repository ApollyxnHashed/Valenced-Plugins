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

/** More wraps than this within WINDOW_MS means a render loop: wrapping stops until the plugin restarts. */
const MAX_WRAPS = 120
const WINDOW_MS = 1000

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

				let windowStart = 0
				let wraps = 0
				let tripped = false

				cleanup(
					insteadJSX(UsersFastList, ([type, props, key], jsx) => {
						if (tripped || !isMemberList(props as UsersListProps, key))
							return jsx(type, props, key)

						// Safety net: if the list ever renders itself in a loop, give it back to Discord untouched
						const now = Date.now()
						if (now - windowStart > WINDOW_MS) {
							windowStart = now
							wraps = 0
						}
						if (++wraps > MAX_WRAPS) {
							tripped = true
							logger.warn('Render loop detected: lists are no longer wrapped')
							return jsx(type, props, key)
						}

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
