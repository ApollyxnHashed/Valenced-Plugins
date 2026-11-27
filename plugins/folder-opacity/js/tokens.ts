import { Stores } from '@valenced/discord/flux'
import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { FallbackFolderColor } from './shared'
import type { IconColors } from './color'

// ../discord_common/js/packages/tokens/native.tsx
// `default.modules.mobile.<NAME>` are `{ resolve() }` tokens that `useToken` resolves on every render.
interface ModuleToken {
	resolve(...args: unknown[]): unknown
}

export interface TokensModule {
	RawColor: Record<string, string>
	SemanticColor: Record<string, unknown>
	default: {
		colors: Record<string, object>
		radii: Record<string, number>
		modules: {
			mobile: Record<string, ModuleToken | undefined>
		}
		internal: {
			resolveSemanticColor(theme: string, color: object): string
		}
	}
}

interface ThemeStore {
	theme: string
}

/** Semantic color of the server list, which folder backgrounds are drawn over. */
const RailColor = 'BACKGROUND_BASE_LOWEST'

export const tokensFilter = () =>
	withProps<TokensModule>('RawColor', 'SemanticColor')

let cached: TokensModule | undefined

/**
 * The tokens module, or `undefined` when it is not loaded.
 * Cached once found: the preview asks for it on every render, which follows slider drags.
 */
export function lookupTokens() {
	if (cached) return cached
	const [module, id] = lookupModule(tokensFilter(), { cached: true })
	if (id !== undefined) cached = module
	return cached
}

/** Resolves a semantic color for the active theme, falling back to `fallback`. */
function semantic(tokens: TokensModule, name: string, fallback: string) {
	const { default: discord } = tokens
	const color = discord.colors[name]
	if (!color) return fallback
	const theme = (Stores.ThemeStore as unknown as ThemeStore).theme
	return discord.internal.resolveSemanticColor(theme, color)
}

/** Colors `iconTintFor` needs, resolved for the active theme. */
export function iconColors(tokens: TokensModule): IconColors {
	const { RawColor } = tokens
	return {
		white: RawColor.WHITE_500!,
		black: RawColor.BLACK_500!,
		rail: semantic(tokens, RailColor, RawColor.BLACK_500!),
	}
}

/** Color Discord gives new folders, which is also the preview's last-resort color. */
export function defaultFolderColor(tokens: TokensModule | undefined) {
	return tokens?.RawColor.BRAND_500 ?? FallbackFolderColor
}

type UseToken = (token: unknown) => unknown

/**
 * Discord's `useToken` hook (../discord_app/design/tokens/native/useToken.tsx). It resolves a token
 * with the theme context, so it follows the active theme and the experiments that change the
 * server list measures (the "visual refresh" layout).
 */
export function lookupUseToken() {
	const [module, id] = lookupModuleWithImportedPath<{ useToken: UseToken }>(
		'design/tokens/native/useToken.tsx',
	)
	return id === undefined ? undefined : module?.useToken
}
