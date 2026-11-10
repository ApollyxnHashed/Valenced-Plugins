export interface Settings {
	displayName: boolean
	pronouns: boolean
	status: boolean
	bio: boolean
}

export type FieldKey = keyof Settings

export const DefaultSettings: Settings = {
	displayName: true,
	pronouns: true,
	status: true,
	bio: true,
}

export const FieldLabels: Record<
	FieldKey,
	{ label: string; subLabel: string }
> = {
	displayName: {
		label: 'Display name',
		subLabel: 'The big name at the top of the profile.',
	},
	pronouns: {
		label: 'Pronouns',
		subLabel: 'The pronouns line, when the user has set one.',
	},
	status: {
		label: 'Custom status',
		subLabel: "The text of the user's custom status.",
	},
	bio: {
		label: 'Bio',
		subLabel: 'The bio text of the profile.',
	},
}

export const noop = () => {}
