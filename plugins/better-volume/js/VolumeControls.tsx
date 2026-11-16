import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useCallback, useSyncExternalStore } from 'react'
import { StyleSheet, View } from 'react-native'
import { getMediaEngineStore } from './mediaEngine'
import { formatNumber, NumberInput } from './NumberInput'
import {
	amplitudeToPerceptual,
	DEFAULT_CONTEXT,
	perceptualToAmplitude,
	useSettings,
} from './settings'

const { Button, Card, TableRowGroup } = Design

interface AudioActionCreators {
	setLocalVolume(userId: string, amplitude: number): void
	toggleLocalMute(userId: string): void
}

let AudioActionCreators: AudioActionCreators | undefined

/** Finds the action creators that Discord's own volume slider uses. */
export function findAudioActionCreators(): () => void {
	const unpatch = getModules(
		withProps<AudioActionCreators>('setLocalVolume', 'toggleLocalMute'),
		module => {
			AudioActionCreators = module
		},
	)
	return () => {
		unpatch()
		AudioActionCreators = undefined
	}
}

function useLocalVolume(userId: string): number {
	const subscribe = useCallback((callback: () => void) => {
		const store = getMediaEngineStore()
		store.addChangeListener(callback)
		return () => store.removeChangeListener(callback)
	}, [])
	return useSyncExternalStore(subscribe, () =>
		getMediaEngineStore().getLocalVolume(userId, DEFAULT_CONTEXT),
	)
}

/** Volume row added below Discord's slider: [-] [ 100 % ] [+] */
export function VolumeControls({ userId }: { userId: string }) {
	const { maxVolume, step } = useSettings()
	const percent = amplitudeToPerceptual(useLocalVolume(userId))

	const setPercent = (next: number) => {
		const clamped = Math.min(Math.max(next, 0), maxVolume)
		AudioActionCreators?.setLocalVolume(userId, perceptualToAmplitude(clamped))
	}

	const rounded = Number(formatNumber(percent, 2))
	return (
		<TableRowGroup hasIcons={false}>
			<Card start end border="none" shadow="none">
				<View style={styles.row}>
					<Button
						text="-"
						variant="secondary"
						accessibilityLabel="Decrease volume"
						disabled={rounded <= 0}
						onPress={() => setPercent(Math.round(percent) - step)}
					/>
					<View style={styles.field}>
						<NumberInput
							value={percent}
							min={0}
							max={maxVolume}
							decimals={2}
							trailingText="%"
							onCommit={setPercent}
						/>
					</View>
					<Button
						text="+"
						variant="secondary"
						accessibilityLabel="Increase volume"
						disabled={rounded >= maxVolume}
						onPress={() => setPercent(Math.round(percent) + step)}
					/>
				</View>
			</Card>
		</TableRowGroup>
	)
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	field: {
		flex: 1,
	},
})
