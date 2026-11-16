import { Stores } from '@valenced/discord/flux'

interface MediaEngineStore {
	getLocalVolume(userId: string, context?: string): number
	addChangeListener(callback: () => void): void
	removeChangeListener(callback: () => void): void
}

/** The store that holds the volume you set for each user. */
export function getMediaEngineStore(): MediaEngineStore {
	return Stores.MediaEngineStore as unknown as MediaEngineStore
}
