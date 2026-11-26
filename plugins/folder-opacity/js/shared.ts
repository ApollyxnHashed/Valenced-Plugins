export type IconMode = 'auto' | 'discord' | 'lighter' | 'darker'

export interface Settings {
	/** Opacity of an expanded folder's background, from 0 to 100. */
	openOpacity: number
	/** Opacity of a collapsed folder's background, from 0 to 100. */
	closedOpacity: number
	/** How the folder icon of an expanded folder is colored. */
	iconMode: IconMode
	/** How far the icon moves toward white or black in `lighter` and `darker` modes, from 5 to 60. */
	iconShift: number
}

export const DefaultSettings: Settings = {
	// 100 shows the exact HEX. Discord's own values are 15 (expanded) and 40 (collapsed).
	openOpacity: 100,
	closedOpacity: 100,
	iconMode: 'auto',
	iconShift: 30,
}

/** Folder icon shown at the top of an expanded folder. */
export const FolderIconAsset = 'FolderIcon'

/** Discord's own folder opacities, in percent. */
export const DiscordOpacity = { open: 15, closed: 40 }

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

const IconModes: readonly IconMode[] = ['auto', 'discord', 'lighter', 'darker']

/** Merges stored values over defaults and drops anything out of range. */
export function normalizeSettings(stored?: Partial<Settings>): Settings {
	const merged = { ...DefaultSettings, ...stored }
	return {
		openOpacity: clamp(Number(merged.openOpacity) || 0, 0, 100),
		closedOpacity: clamp(Number(merged.closedOpacity) || 0, 0, 100),
		iconMode: IconModes.includes(merged.iconMode)
			? merged.iconMode
			: DefaultSettings.iconMode,
		iconShift: clamp(
			Number(merged.iconShift) || DefaultSettings.iconShift,
			5,
			60,
		),
	}
}
