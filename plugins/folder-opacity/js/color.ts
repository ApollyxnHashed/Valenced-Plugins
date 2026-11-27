import { DiscordOpacity } from './shared'
import type { Settings } from './shared'

type Rgb = [number, number, number]

/** Parses `#RRGGBB` (alpha ignored). */
function parse(hex: string): Rgb | undefined {
	const match = /^#([0-9a-f]{6})/i.exec(hex)
	if (!match) return
	const value = Number.parseInt(match[1]!, 16)
	return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function format([r, g, b]: Rgb) {
	return `#${[r, g, b]
		.map(c => Math.round(c).toString(16).padStart(2, '0'))
		.join('')}`
}

/** `amount` of `to` mixed over `from`, per channel. */
function mix(from: Rgb, to: Rgb, amount: number): Rgb {
	return [
		from[0] + (to[0] - from[0]) * amount,
		from[1] + (to[1] - from[1]) * amount,
		from[2] + (to[2] - from[2]) * amount,
	]
}

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb) {
	const channel = (value: number) => {
		const c = value / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, from 1 to 21. */
function contrast(a: Rgb, b: Rgb) {
	const x = luminance(a)
	const y = luminance(b)
	return x > y ? (x + 0.05) / (y + 0.05) : (y + 0.05) / (x + 0.05)
}

/** Contrast at which an icon is clearly visible, WCAG 1.4.11 for graphics. */
const ClearContrast = 3

/** Floor so a nearly identical icon and background never count as visible, even for very dark colors. */
const MinContrast = 1.2

/** Share of Discord's own contrast still accepted, so small opacity increases keep Discord's icon. */
const Tolerance = 0.85

export interface IconColors {
	/** Raw `WHITE_500`. */
	white: string
	/** Raw `BLACK_500`. */
	black: string
	/** Server list color the folder background is drawn over. */
	rail: string
}

/**
 * Tint for the icon of an expanded folder, or `undefined` to keep Discord's own (the folder color itself).
 *
 * @param folder Folder color Discord tints the icon with (`#RRGGBB`).
 */
export function iconTintFor(
	folder: string,
	settings: Settings,
	colors: IconColors,
) {
	const base = parse(folder)
	const white = parse(colors.white)
	const black = parse(colors.black)
	if (!base || !white || !black) return

	switch (settings.iconMode) {
		case 'discord':
			return

		case 'lighter':
			return format(mix(base, white, settings.iconShift / 100))

		case 'darker':
			return format(mix(base, black, settings.iconShift / 100))

		case 'auto': {
			// At or below Discord's own opacity the icon is Discord's own, whatever the color
			if (settings.openOpacity <= DiscordOpacity.open) return

			// What the user sees behind the icon: the folder color over the server list
			const rail = parse(colors.rail) ?? black
			const background = mix(rail, base, settings.openOpacity / 100)

			// Discord's own icon (the folder color) over its own 15% background is the look to match:
			// keep it while the icon stands out about as much as it does there, or clearly enough
			// (WCAG 3:1 for graphics) when Discord's own look is stronger than that.
			const discordBackground = mix(rail, base, DiscordOpacity.open / 100)
			const needed = Math.max(
				Math.min(contrast(base, discordBackground), ClearContrast) * Tolerance,
				MinContrast,
			)
			if (contrast(base, background) >= needed) return

			return contrast(white, background) >= contrast(black, background)
				? colors.white
				: colors.black
		}
	}
}

/**
 * Normalizes user input to `#rrggbb` (lowercase), accepting it with or without the `#`.
 * Returns `undefined` when it is not a complete 6-digit HEX.
 */
export function normalizeHex(input: string) {
	const match = /^#?([0-9a-f]{6})$/i.exec(input.trim())
	return match ? `#${match[1]!.toLowerCase()}` : undefined
}

/** `rgba()` of a HEX color at `opacity` percent, like Discord's `hexWithOpacity`. */
export function withOpacity(hex: string, opacity: number) {
	const [r, g, b] = parse(hex) ?? [0, 0, 0]
	return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`
}

/** `#rrggbb` of a Discord integer color (what Discord stores for folders). */
export function intToHex(value: number) {
	return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`
}

/** Discord integer color of a `#rrggbb` HEX, or `undefined` when it isn't one. */
export function hexToInt(hex: string) {
	const normalized = normalizeHex(hex)
	return normalized ? Number.parseInt(normalized.slice(1), 16) : undefined
}
