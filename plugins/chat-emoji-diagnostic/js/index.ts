import { getErrorStack } from '@valenced/utils/error'
import { startCapture } from './capture'
import { setNativeExperiment } from './native'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { Settings } from './shared'

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage: storage, plugin }) {
		const settings = (): Settings => ({ ...DefaultSettings, ...storage.cache })

		cleanup(
			startCapture(
				() => settings().jsExperiment,
				e => plugin.reportError(`Capture failed: ${getErrorStack(e)}`),
			),
		)

		// The native side starts with the experiment off, so tell it the saved choice
		setNativeExperiment(settings().nativeExperiment).catch(e =>
			plugin.reportError(`Native part unavailable: ${getErrorStack(e)}`),
		)
	},
	SettingsComponent,
})
