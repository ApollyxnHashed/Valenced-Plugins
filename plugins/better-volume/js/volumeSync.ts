import { Dispatcher } from '@valenced/discord/common/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { getMediaEngineStore } from './mediaEngine'
import {
	clearOverride,
	DEFAULT_CONTEXT,
	getSettings,
	perceptualToAmplitude,
	STOCK_MAX_AMPLITUDE,
	setOverride,
} from './settings'
import type { Api } from './settings'

interface PendingSettings {
	volume?: number
	muted?: boolean
}

interface AudioSettingsPending {
	updatePendingSettings(
		context: string,
		userId: string,
		settings: PendingSettings,
	): void
	drainPendingAudioSettings: unknown
	getPendingAudioSettings: unknown
}

/**
 * Discord only syncs volumes up to 200% to your account, so anything higher is kept in
 * the plugin's own storage and put back whenever Discord loads or updates your settings.
 */
export function installVolumeSync(
	cleanup: Api['cleanup'],
	plugin: Api['plugin'],
): void {
	let timer: ReturnType<typeof setTimeout> | undefined

	const reapply = () => {
		timer = undefined
		try {
			const store = getMediaEngineStore()
			const maxAmplitude = perceptualToAmplitude(getSettings().maxVolume)
			for (const [userId, saved] of Object.entries(getSettings().overrides)) {
				const volume = Math.min(saved, maxAmplitude)
				if (store.getLocalVolume(userId, DEFAULT_CONTEXT) === volume) continue
				void Dispatcher.dispatch({
					type: 'AUDIO_SET_LOCAL_VOLUME',
					context: DEFAULT_CONTEXT,
					userId,
					volume,
				})
			}
		} catch (error) {
			plugin.reportError(error)
		}
	}

	// Subscribers run during the dispatch, so wait until it is over before dispatching again.
	const schedule = () => {
		clearTimeout(timer)
		timer = setTimeout(reapply, 0)
	}

	cleanup(
		getModules(
			withProps<AudioSettingsPending>(
				'updatePendingSettings',
				'drainPendingAudioSettings',
				'getPendingAudioSettings',
			),
			module => {
				cleanup(
					instead(
						module,
						'updatePendingSettings',
						([context, userId, settings], original) => {
							const volume = settings?.volume
							if (context !== DEFAULT_CONTEXT || typeof volume !== 'number') {
								return original(context, userId, settings)
							}

							if (volume <= STOCK_MAX_AMPLITUDE) {
								clearOverride(userId)
								return original(context, userId, settings)
							}

							// Our own re-dispatch: the account already holds the 200% version.
							if (getSettings().overrides[userId] === volume) return

							setOverride(userId, volume)
							return original(context, userId, {
								...settings,
								volume: STOCK_MAX_AMPLITUDE,
							})
						},
					),
				)
			},
		),
	)

	for (const type of ['USER_SETTINGS_PROTO_UPDATE', 'POST_CONNECTION_OPEN']) {
		Dispatcher.subscribe(type, schedule)
		cleanup(() => Dispatcher.unsubscribe(type, schedule))
	}
	cleanup(() => clearTimeout(timer))

	schedule()
}
