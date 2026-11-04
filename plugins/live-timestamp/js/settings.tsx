import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Stack, TableRadioGroup, TableRadioRow, TableRowGroup, TableSwitchRow } =
	Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const { enabled, style, otherFormats } = {
		...DefaultSettings,
		...storage.use(),
	}

	return (
		<Page>
			<Stack spacing={24}>
				<TableRowGroup>
					<TableSwitchRow
						label="Live countdown"
						subLabel="Updates <t:...> timestamps every second, without reloading the chat."
						value={enabled}
						onValueChange={(enabled: boolean) => storage.set({ enabled })}
					/>
					<TableSwitchRow
						label="Other formats"
						subLabel="Also shows the countdown next to t, T, d, D, f and F timestamps."
						value={otherFormats}
						onValueChange={(otherFormats: boolean) =>
							storage.set({ otherFormats })
						}
					/>
				</TableRowGroup>
				<TableRadioGroup
					title="Style"
					defaultValue={style}
					onChange={(style: Settings['style']) => storage.set({ style })}
				>
					<TableRadioRow
						label="Hybrid"
						subLabel="00:10 under 1 minute; above that, in 4 minutes and 59 seconds."
						value="hybrid"
					/>
					<TableRadioRow
						label="Clock"
						subLabel="Always 04:59, 1:02:03, etc."
						value="clock"
					/>
					<TableRadioRow
						label="Words"
						subLabel="Always in 4 minutes and 59 seconds."
						value="words"
					/>
				</TableRadioGroup>
			</Stack>
		</Page>
	)
}
