import { getAssetIdByName } from '@valenced/assets'
import { Stores } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { iconTintFor } from './color'
import SettingsComponent from './settings'
import { DefaultSettings, normalizeSettings } from './shared'
import type { ElementType } from 'react'
import type { Settings } from './shared'

// ../discord_common/js/packages/tokens/native.tsx
// `default.modules.mobile.<NAME>` are `{ resolve() }` tokens that `useToken` resolves on every render.
interface ModuleToken {
	resolve(...args: unknown[]): unknown
}

interface TokensModule {
	RawColor: Record<string, string>
	SemanticColor: Record<string, unknown>
	default: {
		colors: Record<string, object>
		modules: {
			mobile: Record<string, ModuleToken | undefined>
		}
		internal: {
			resolveSemanticColor(theme: string, color: object): string
		}
	}
}

interface IconProps {
	source?: unknown
	style?: { tintColor?: unknown } | null
	[key: string]: unknown
}

interface ThemeStore {
	theme: string
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

/** Folder icon shown at the top of an expanded folder. */
const FolderIconAsset = 'FolderIcon'

/** Semantic color of the server list, which folder backgrounds are drawn over. */
const RailColor = 'BACKGROUND_BASE_LOWEST'

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
				withProps<TokensModule>('RawColor', 'SemanticColor'),
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

							const { default: discord, RawColor } = tokens
							const theme = (Stores.ThemeStore as unknown as ThemeStore).theme
							const rail = discord.colors[RailColor]
							const color = iconTintFor(tint, current, {
								white: RawColor.WHITE_500!,
								black: RawColor.BLACK_500!,
								rail: rail
									? discord.internal.resolveSemanticColor(theme, rail)
									: RawColor.BLACK_500!,
							})
							if (!color) return args

							// Fresh objects: Discord memoizes the original style per folder
							args[1] = { ...props, style: { ...props.style, tintColor: color } }
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
