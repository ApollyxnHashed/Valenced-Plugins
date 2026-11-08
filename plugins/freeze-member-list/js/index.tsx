import { instead } from '@valenced/patcher'
import { startFreeze } from './freeze'
import { installOverlay, wasOverlayMounted } from './overlay'
import { SettingsComponent } from './settings'
import {
	attachStorage,
	DEFAULTS,
	detachStorage,
	setEnabled,
	setNeedsReload,
} from './ui-state'
import type { Persisted } from './ui-state'

export default plugin<{ jsonStorage: Persisted }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, plugin, jsonStorage }) {
		// Freeze logic first: it never touches the UI
		startFreeze(cleanup)

		// The overlay must be registered before the app's first render, which is when plugins start at launch
		cleanup(installOverlay(instead as never))
		setEnabled(true)
		cleanup(() => {
			setEnabled(false)
			detachStorage()
		})

		// The wrapper slot is only read when the app renders its root, so a late start needs one reload,
		// unless the overlay is already part of the app tree (plugin turned off and on again)
		if (plugin.startedLate && !wasOverlayMounted()) {
			setNeedsReload(true)
			plugin.requireReload()
		}

		jsonStorage.get().then(
			loaded => attachStorage(jsonStorage, loaded),
			() => {},
		)
	},
	SettingsComponent,
})
