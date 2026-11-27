import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useRef, useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import FolderPreview from './preview'
import { DefaultSettings, DiscordOpacity, normalizeSettings } from './shared'
import { sliderProps } from './slider'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { IconMode, Settings } from './shared'

const { Button, Card, Slider, Stack, TableRadioGroup, TableRadioRow, Text } =
	Design

type SettingsComponentProps = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: Settings }>
>

// Icons of Discord's own slider settings (../discord_app/modules/user_settings/defs/native/ToastDurationSetting.tsx)
let MinusIcon: ReturnType<typeof lookupGeneratedIconComponent> | null
let PlusIcon: ReturnType<typeof lookupGeneratedIconComponent> | null

function sliderIcons() {
	MinusIcon ??= lookupGeneratedIconComponent('CircleMinusIcon') ?? null
	PlusIcon ??= lookupGeneratedIconComponent('CirclePlusIcon') ?? null
	return {
		start: MinusIcon ? <MinusIcon /> : undefined,
		end: PlusIcon ? <PlusIcon /> : undefined,
	}
}

interface SliderCardProps {
	title: string
	description: string
	value: number
	min: number
	max: number
	/** Value the reset button restores. */
	defaultValue: number
	resetLabel: string
	/** Called on every change, even while dragging, for the live preview. */
	onLive(value: number): void
	onCommit(value: number): void
}

/**
 * Card like Discord's own slider settings
 * (../discord_app/modules/settings/native/renderer/SettingRenderer.tsx, SliderSetting):
 * title with the current value, slider with icons, and a reset button.
 * Saves only when the slider is released.
 */
function SliderCard({
	title,
	description,
	value,
	min,
	max,
	defaultValue,
	resetLabel,
	onLive,
	onCommit,
}: SliderCardProps) {
	const [current, setCurrent] = useState(value)
	const saved = useRef(value)
	const icons = sliderIcons()

	const change = (next: number) => {
		setCurrent(next)
		onLive(next)
	}

	// The slider reports a release under two names (see below), so skip repeats of one value
	// to avoid saving twice
	const commit = (next: number) => {
		if (next === saved.current) return
		saved.current = next
		onCommit(next)
	}

	const sliderConfig = sliderProps({
		value: current,
		min,
		max,
		step: 5,
		label: title,
		onChange: change,
		onCommit: commit,
		startIcon: icons.start,
		endIcon: icons.end,
	})

	return (
		<Card shadow="none" border="none">
			<Stack spacing={12}>
				<Stack direction="horizontal" justify="space-between" align="center">
					<Text variant="text-md/semibold" color="text-default">
						{title}
					</Text>
					<Text variant="text-md/semibold" color="text-muted">
						{Math.round(current)}%
					</Text>
				</Stack>
				<Slider {...sliderConfig} />
				<Text variant="text-sm/medium" color="text-muted">
					{description}
				</Text>
				<Button
					variant="secondary"
					size="sm"
					text={resetLabel}
					disabled={current === defaultValue}
					onPress={() => {
						change(defaultValue)
						commit(defaultValue)
					}}
				/>
			</Stack>
		</Card>
	)
}

const IconModes: { value: IconMode; label: string; subLabel: string }[] = [
	{
		value: 'auto',
		label: 'Automatic (black or white)',
		subLabel:
			"Picks black or white when the folder color would blend into its background. Keeps Discord's icon color when it already stands out.",
	},
	{
		value: 'discord',
		label: "Discord's default",
		subLabel: 'The icon uses the same color as the folder.',
	},
	{
		value: 'lighter',
		label: 'Lighter than the folder',
		subLabel: 'Always a bit lighter than the folder color.',
	},
	{
		value: 'darker',
		label: 'Darker than the folder',
		subLabel: 'Always a bit darker than the folder color.',
	},
]

const OpacityGuide: { range: string; text: string }[] = [
	{ range: '100%', text: 'The exact HEX you picked, solid and unchanged.' },
	{
		range: '50–90%',
		text: 'Close to your color, slightly softened toward the background. Dark colors stay dark, and bright colors lose some punch.',
	},
	{
		range: '15–40%',
		text: "Discord's look, a faint tint. Colors seem darker and less saturated on dark themes, and lighter on light themes.",
	},
	{ range: '0%', text: 'No color at all, as if the folder had none.' },
]

const styles = StyleSheet.create({
	scroll: { flex: 1 },
	// Keeps the last text clear of the system navigation bar
	content: { paddingBottom: 48 },
})

function SectionHeader({
	title,
	subtitle,
}: {
	title: string
	subtitle: string
}) {
	return (
		<Stack spacing={4}>
			<Text variant="heading-md/semibold" color="text-strong">
				{title}
			</Text>
			<Text variant="text-sm/medium" color="text-muted">
				{subtitle}
			</Text>
		</Stack>
	)
}

export default function SettingsComponent({
	api: { jsonStorage: storage, plugin },
}: SettingsComponentProps) {
	const settings = normalizeSettings(storage.use())
	// What the preview shows: follows the sliders while they are dragged, before anything is saved
	const [live, setLive] = useState(settings)
	const preview = (update: Partial<Settings>) =>
		setLive(value =>
			// Same object when nothing changed, so React skips the re-render
			(Object.keys(update) as (keyof Settings)[]).every(
				key => value[key] === update[key],
			)
				? value
				: { ...value, ...update },
		)

	// Folders memoize what they read, so changes only show up after a restart
	const save = (update: Partial<Settings>) => {
		preview(update)
		storage.set(update)
		plugin.requireReload()
	}

	const shifting = live.iconMode === 'lighter' || live.iconMode === 'darker'

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.content}
			showsVerticalScrollIndicator={false}
		>
			<Page>
				<Stack spacing={32}>
					<Stack spacing={12}>
						<SectionHeader
							title="Preview"
							subtitle="A sample folder that follows the settings below as you change them. Its color is only for the preview."
						/>
						<FolderPreview settings={live} />
					</Stack>

					<Stack spacing={12}>
						<SectionHeader
							title="Opacity"
							subtitle="How much of the folder color shows. 100% is the exact HEX you picked."
						/>
						<SliderCard
							title="Expanded folder"
							description={`Background of an open folder. Discord uses ${DiscordOpacity.open}%.`}
							value={settings.openOpacity}
							min={0}
							max={100}
							defaultValue={DiscordOpacity.open}
							resetLabel="Reset to Discord's default"
							onLive={openOpacity => preview({ openOpacity })}
							onCommit={openOpacity => save({ openOpacity })}
						/>
						<SliderCard
							title="Collapsed folder"
							description={`Background of a closed folder. Discord uses ${DiscordOpacity.closed}%.`}
							value={settings.closedOpacity}
							min={0}
							max={100}
							defaultValue={DiscordOpacity.closed}
							resetLabel="Reset to Discord's default"
							onLive={closedOpacity => preview({ closedOpacity })}
							onCommit={closedOpacity => save({ closedOpacity })}
						/>
					</Stack>

					<Stack spacing={12}>
						<SectionHeader
							title="Folder icon"
							subtitle="The icon at the top of an open folder."
						/>
						<TableRadioGroup<IconMode>
							value={live.iconMode}
							onChange={iconMode => save({ iconMode })}
						>
							{IconModes.map(mode => (
								<TableRadioRow
									key={mode.value}
									value={mode.value}
									label={mode.label}
									subLabel={mode.subLabel}
								/>
							))}
						</TableRadioGroup>
						{shifting && (
							<SliderCard
								title="Color shift"
								description={`How far the icon moves toward ${live.iconMode === 'lighter' ? 'white' : 'black'}.`}
								value={settings.iconShift}
								min={5}
								max={60}
								defaultValue={DefaultSettings.iconShift}
								resetLabel="Reset"
								onLive={iconShift => preview({ iconShift })}
								onCommit={iconShift => save({ iconShift })}
							/>
						)}
					</Stack>

					<Stack spacing={12}>
						<SectionHeader
							title="How opacity changes colors"
							subtitle="Discord draws the folder color over the server list background. The lower the opacity, the more of that background shows through."
						/>
						<Card shadow="none" border="none">
							<Stack spacing={16}>
								{OpacityGuide.map(({ range, text }) => (
									<Stack key={range} spacing={2}>
										<Text variant="text-sm/semibold" color="text-default">
											{range}
										</Text>
										<Text variant="text-sm/medium" color="text-muted">
											{text}
										</Text>
									</Stack>
								))}
							</Stack>
						</Card>
						<Text variant="text-xs/medium" color="text-muted">
							Changes apply after you restart Discord.
						</Text>
					</Stack>
				</Stack>
			</Page>
		</ScrollView>
	)
}
