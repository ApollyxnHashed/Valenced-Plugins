import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
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

/** Semantic color of the placeholder servers drawn in the preview. */
const ServerColor = 'BACKGROUND_SURFACE_HIGHEST'

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

/** Colors of the preview that follow the active theme. */
export function previewColors(tokens: TokensModule) {
	const colors = iconColors(tokens)
	return {
		...colors,
		server: semantic(tokens, ServerColor, colors.rail),
	}
}
