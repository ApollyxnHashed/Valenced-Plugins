import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useCallback, useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { clearJs } from './capture'
import { clearNative, setNativeExperiment } from './native'
import { buildReport } from './report'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Card, Stack, TableRow, TableRowGroup, TableSwitchRow, Text } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings: Settings = { ...DefaultSettings, ...storage.use() }
	const [report, setReport] = useState('Loading...')

	const refresh = useCallback(async () => {
		setReport(await buildReport({ ...DefaultSettings, ...storage.cache }))
	}, [storage])

	useEffect(() => {
		refresh()
	}, [refresh])

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
				<Stack spacing={24}>
					<TableRowGroup title="How to use">
						<TableRow label="1. Tap “Clear data” below" />
						<TableRow label="2. Open the channel settings, tap the name field and try the keyboard emoji button" />
						<TableRow label="3. Come back here and tap “Copy report”, then paste it in the chat" />
					</TableRowGroup>

					<TableRowGroup title="Report">
						<TableRow
							icon={<TableRowAssetIcon name="TrashIcon" />}
							label="Clear data"
							onPress={async () => {
								clearJs()
								await clearNative().catch(() => {})
								refresh()
							}}
						/>
						<TableRow
							icon={<TableRowAssetIcon name="RetryIcon" />}
							label="Refresh"
							onPress={refresh}
						/>
						<TableRow
							icon={<TableRowAssetIcon name="CopyIcon" />}
							label="Copy report"
							subLabel="Copies everything shown below. It never contains what you typed."
							onPress={() => {
								Clipboard.setString(report)
								ToastActionCreators.open(
									'AXONYUM_CHAT_EMOJI_DIAGNOSTIC_COPIED',
									{
										text: 'Report copied to clipboard',
									},
								)
							}}
						/>
					</TableRowGroup>

					<TableRowGroup title="Experiments (keep off, unless asked)">
						<TableSwitchRow
							label="JS experiment"
							subLabel="Replaces the “visible password” keyboard type with the normal one on text inputs. Reopen the screen to apply."
							value={settings.jsExperiment}
							onValueChange={jsExperiment => storage.set({ jsExperiment })}
						/>
						<TableSwitchRow
							label="Native experiment"
							subLabel="Asks the keyboard for a normal text field instead of a “visible password” one. Tap the field again to apply."
							value={settings.nativeExperiment}
							onValueChange={nativeExperiment => {
								storage.set({ nativeExperiment })
								setNativeExperiment(nativeExperiment).catch(() => {})
							}}
						/>
					</TableRowGroup>

					<Card>
						<Text
							selectable
							variant="text-xs/normal"
							style={{ fontFamily: 'monospace' }}
						>
							{report}
						</Text>
					</Card>
				</Stack>
			</ScrollView>
		</Page>
	)
}
