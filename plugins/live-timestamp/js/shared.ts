import type { Style } from './core'

export interface Settings {
	/** Turns the live countdown on or off. */
	enabled: boolean
	/** hybrid: "00:10" under 1 minute, "in 4 minutes and 59 seconds" above. */
	style: Style
	/** Also shows " · 00:10" on the t, T, d, D, f and F formats. */
	otherFormats: boolean
}

export const DefaultSettings: Settings = {
	enabled: true,
	style: 'hybrid',
	otherFormats: false,
}
