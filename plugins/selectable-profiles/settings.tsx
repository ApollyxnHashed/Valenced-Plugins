import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { DefaultSettings, FieldLabels } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { FieldKey, Settings } from './shared'

const { Stack, TableRowGroup, TableSwitchRow } = Design

type SettingComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

const Fields: FieldKey[] = ['displayName', 'pronouns', 'status', 'bio']

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: SettingComponentProps) {
	const settings = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<Stack spacing={24}>
				<TableRowGroup
					title="Selectable fields"
					description="Choose which parts of a profile can be selected with a long press. Changes apply the next time a profile is opened."
				>
					{Fields.map(field => (
						<TableSwitchRow
							key={field}
							label={FieldLabels[field].label}
							subLabel={FieldLabels[field].subLabel}
							value={settings[field]}
							onValueChange={value => storage.set({ [field]: value })}
						/>
					))}
				</TableRowGroup>
			</Stack>
		</Page>
	)
}
