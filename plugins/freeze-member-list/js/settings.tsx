import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { useEffect, useReducer, useState } from 'react'
import { ScrollView } from 'react-native'
import { freeze, isFrozen, subscribe, unfreeze } from './freeze'
import { getNeedsReload, resetPosition, setVisible, useUiState } from './ui-state'

const { Button, Stack, TableRowGroup, TableSwitchRow, Text } = Design

const MESSAGES: Record<string, string> = {
	'no-server': 'Open a server first, then come back here.',
	'no-list': 'The member list of this channel is not loaded yet. Open it once, then try again.',
	'not-ready': 'The plugin is still starting. Try again in a moment.',
}

export function SettingsComponent() {
	const [, refresh] = useReducer((n: number) => n + 1, 0)
	const [notice, setNotice] = useState('')
	const ui = useUiState()

	useEffect(() => subscribe(refresh), [])

	return (
		<Page>
			<ScrollView>
				<Stack spacing={16}>
					{getNeedsReload() ? (
						<Text variant="text-sm/semibold" color="text-feedback-critical">
							Reload Discord once so the floating button can appear.
						</Text>
					) : null}
					<TableRowGroup title="Floating button">
						<TableSwitchRow
							label="Show floating button"
							subLabel="Tap it to freeze or unfreeze. Drag it to move it."
							value={ui.visible}
							onValueChange={(on: boolean) => setVisible(on)}
						/>
					</TableRowGroup>
					<Button
						text="Reset button position"
						variant="secondary"
						size="md"
						onPress={resetPosition}
					/>
					<TableRowGroup title="Freeze">
						<TableSwitchRow
							label="Freeze member list"
							subLabel="Freezes the list of the server that is open right now."
							value={isFrozen()}
							onValueChange={(on: boolean) => {
								if (!on) {
									unfreeze()
									setNotice('')
									return
								}
								setNotice(MESSAGES[freeze()] ?? '')
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
