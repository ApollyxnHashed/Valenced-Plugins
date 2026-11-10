import { Design } from '@valenced/discord/design'
import { onFluxEventDispatched } from '@valenced/discord/flux'
import { ReactNative } from '@valenced/react'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { patchBio } from './bio'
import { onText, resetOpenState } from './gate'
import { markValuesDirty, resetProfiles, watchProfileStore } from './profiles'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import { setStorage } from './storage'
import type { Settings } from './shared'

/**
 * - Bio: patched on its own component, like the "Selectable Bios" community plugin.
 * - Display name, pronouns and status: see profiles.ts, matching.ts and gate.tsx.
 */
export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start(api) {
		const { cleanup, jsonStorage, plugin } = api
		setStorage(jsonStorage)

		// The Bio patch only works when it is applied before the component is first used.
		if (plugin.startedLate) plugin.requireReload()

		patchBio(api)
		watchProfileStore(api)

		// Custom statuses change with presence updates.
		cleanup(
			onFluxEventDispatched('PRESENCE_UPDATES', payload => {
				markValuesDirty()
				return payload
			}),
		)

		// Design.Text and React Native's Text are both used for profile text.
		for (const Text of new Set([ReactNative.Text, Design.Text]))
			cleanup(insteadJSX(Text, onText))
	},
	stop() {
		resetProfiles()
		resetOpenState()
	},
	SettingsComponent,
})
