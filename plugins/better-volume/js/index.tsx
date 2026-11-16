import { installProfileControls } from './profileControls'
import SettingsComponent from './SettingsComponent'
import { bindStorage, DefaultSettings } from './settings'
import { findAudioActionCreators } from './VolumeControls'
import { installVolumeSync } from './volumeSync'
import type { Settings } from './settings'

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, plugin }) {
		bindStorage(jsonStorage)

		cleanup(findAudioActionCreators())
		installVolumeSync(cleanup, plugin)
		installProfileControls(cleanup, plugin)
	},
	SettingsComponent,
})
