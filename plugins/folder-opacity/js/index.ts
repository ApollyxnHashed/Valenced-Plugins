import { getAssetIdByName } from '@valenced/assets'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { instead } from '@valenced/patcher'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { iconTintFor } from './color'
import SettingsComponent from './settings'
import { DefaultSettings, FolderIconAsset, normalizeSettings } from './shared'
import { iconColors, tokensFilter } from './tokens'
import type { ElementType } from 'react'
import type { Settings } from './shared'
import type { TokensModule } from './tokens'

interface IconProps {
	source?: unknown
	style?: { tintColor?: unknown } | null
	[key: string]: unknown
}

/**
 * Discord multiplies the folder color alpha by these tokens
 * (../discord_app/modules/guilds_bar/native/GuildsBarGuildFolder.tsx):
 * - GUILD_FOLDER_COLOR_OPACITY (0.15): background of an expanded folder.
 * - GUILD_FOLDER_PREVIEW_OPACITY (0.4): background of a collapsed folder.
 */
const OpacityTokens = {
	GUILD_FOLDER_COLOR_OPACITY: 'openOpacity',
	GUILD_FOLDER_PREVIEW_OPACITY: 'closedOpacity',
} as const

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage, plugin: self }) {
		// Folders memoize what they read from these tokens, so a late start would only apply
		// after folders re-render. A restart applies it everywhere.
		if (self.startedLate) {
			self.requireReload()
			return
		}

		const settings = () => normalizeSettings(jsonStorage.cache)
		let tokens: TokensModule | undefined
		// Looked up once: FastImage renders for every image in the app
		let folderIconId: unknown
		let folderIconLooked = false

		cleanup(
			getModules(
				tokensFilter(),
				module => {
					tokens = module

					const mobile = module.default?.modules?.mobile
					if (!mobile) return

					for (const [name, key] of Object.entries(OpacityTokens)) {
						const token = mobile[name]
						if (!token || typeof token.resolve !== 'function') continue
						cleanup(instead(token, 'resolve', () => settings()[key] / 100))
					}
				},
				{ cached: true },
			),
		)

		// Discord tints the folder icon with the folder color itself, which only stood out because
		// the background was mostly transparent. GuildFolderIcon renders it through FastImage.
		cleanup(
			getModuleWithImportedPath(
				'components_native/common/FastImage.tsx',
				(exports: unknown) => {
					// Default export is the memoized component, namespace objects expose it as `default`
					const FastImage = (
						exports && typeof exports === 'object' && 'default' in exports
							? exports.default
							: exports
					) as ElementType<IconProps> | undefined
					if (!FastImage) return

					cleanup(
						beforeJSX(FastImage, args => {
							const props = args[1]
							const tint = props.style?.tintColor
							if (typeof tint !== 'string' || !tokens) return args

							if (!folderIconLooked) {
								folderIconLooked = true
								folderIconId = getAssetIdByName(FolderIconAsset)
							}
							if (folderIconId === undefined || props.source !== folderIconId)
								return args

							const current = settings()
							if (current.iconMode === 'discord') return args

							const color = iconTintFor(tint, current, iconColors(tokens))
							if (!color) return args

							// Fresh objects: Discord memoizes the original style per folder
							args[1] = {
								...props,
								style: { ...props.style, tintColor: color },
							}
							return args
						}),
					)
				},
			),
		)
	},
	stop({ plugin: self }) {
		// Folders keep what they rendered, so they only go back to Discord's colors after a restart
		self.requireReload()
	},
	SettingsComponent,
})
