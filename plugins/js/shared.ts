export interface Settings {
	/** Experiment: swap keyboardType "visible-password" for "default" on React Native text inputs. */
	jsExperiment: boolean
	/** Experiment: native side removes the "visible password" keyboard type from text fields. */
	nativeExperiment: boolean
}

export const DefaultSettings: Settings = {
	jsExperiment: false,
	nativeExperiment: false,
}

export const NativePrefix = 'axonyum.chat-emoji-diagnostic'
