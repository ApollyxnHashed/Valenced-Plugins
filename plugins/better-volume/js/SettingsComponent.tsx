import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { NumberInput } from './NumberInput'
import {
	HARD_MAX_PERCENT,
	STOCK_MAX_PERCENT,
	saveSettings,
	useSettings,
} from './settings'

const { Stack, TableRowGroup } = Design

export default function SettingsComponent() {
	const { maxVolume, step } = useSettings()

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<Page>
				<Stack spacing={24}>
					<TableRowGroup title="Limits">
						<Stack spacing={16}>
							<NumberInput
								label="Maximum volume"
								description="The highest volume you can set. Very high values are extremely loud and can distort the audio or hurt your hearing."
								trailingText="%"
								value={maxVolume}
								min={STOCK_MAX_PERCENT}
								max={HARD_MAX_PERCENT}
								onCommit={value => saveSettings({ maxVolume: value })}
							/>
							<NumberInput
								label="Button step"
								description="How much each + and - press changes the volume."
								trailingText="%"
								value={step}
								min={1}
								max={100}
								onCommit={value => saveSettings({ step: value })}
							/>
						</Stack>
					</TableRowGroup>
				</Stack>
			</Page>
		</ScrollView>
	)
}
