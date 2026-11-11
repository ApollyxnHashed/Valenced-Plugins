import { startFreeze } from './freeze'
import { installOverlay } from './overlay'
import { SettingsComponent } from './settings'
import {
	attachStorage,
	DEFAULTS,
	isOverlayMounted,
	setActive,
	setReloadNeeded,
} from './state'
import type { Settings } from './state'

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, plugin, jsonStorage }) {
		attachStorage(jsonStorage)

		// The freeze logic comes first: it never touches the UI
		startFreeze(cleanup)

		cleanup(installOverlay())
		setActive(true)
		cleanup(() => setActive(false))

		// The wrapper slot is only read when the app renders its root, so enabling the plugin
		// after launch needs one reload, unless the overlay is already in the app (turned off and on again)
		const needsReload = plugin.startedLate && !isOverlayMounted()
		setReloadNeeded(needsReload)
		if (needsReload) plugin.requireReload()
	},
	SettingsComponent,
})
