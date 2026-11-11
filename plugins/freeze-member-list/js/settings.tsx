import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { describeFailure, freeze, unfreeze, useFrozen } from './freeze'
import { DEFAULTS, useReloadNeeded } from './state'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './state'

const { Button, Stack, TableRowGroup, TableSwitchRow, Text } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export function SettingsComponent({ api }: Props) {
	const frozen = useFrozen()
	const reloadNeeded = useReloadNeeded()
	const [notice, setNotice] = useState('')
	const { visible } = api.jsonStorage.use() ?? DEFAULTS

	return (
		<Page>
			<ScrollView>
				<Stack spacing={16}>
					{reloadNeeded ? (
						<Text variant="text-sm/semibold" color="text-feedback-critical">
							Reload Discord once so the floating button can appear.
						</Text>
					) : null}
					<TableRowGroup title="Floating button">
						<TableSwitchRow
							label="Show floating button"
							subLabel="Tap it to freeze or unfreeze. Drag it to move it."
							value={visible}
							onValueChange={(on: boolean) =>
								void api.jsonStorage.set({ visible: on })
							}
						/>
					</TableRowGroup>
					<Button
						text="Reset button position"
						variant="secondary"
						size="md"
						onPress={() =>
							void api.jsonStorage.set({ position: DEFAULTS.position })
						}
					/>
					<TableRowGroup title="Freeze">
						<TableSwitchRow
							label="Freeze member list"
							subLabel="Freezes the list of the server that is open right now."
							value={frozen}
							onValueChange={(on: boolean) => {
								if (!on) {
									unfreeze()
									setNotice('')
									return
								}
								setNotice(describeFailure(freeze()) ?? '')
							}}
						/>
					</TableRowGroup>
					{notice ? (
						<Text variant="text-sm/semibold" color="text-feedback-critical">
							{notice}
						</Text>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
