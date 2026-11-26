import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Image, Pressable, StyleSheet } from 'react-native'
import { iconTintFor, normalizeHex, withOpacity } from './color'
import { FolderIconAsset } from './shared'
import { lookupTokens, previewColors } from './tokens'
import type { Settings } from './shared'

const { Stack, Text, TextField } = Design

// Measures of Discord's server list (../discord_common/js/packages/tokens/modules/generated/generated-definitions.tsx,
// ../discord_app/modules/guilds_bar/native/GuildsBarGuildFolder.tsx)
const ItemSize = 48 // GUILD_BAR_ITEM_SIZE
const ItemMargin = 4 // GUILD_BAR_ITEM_MARGIN
const PreviewMargin = 6 // GUILD_FOLDER_PREVIEW_ICON_MARGIN
const MiniSize = (ItemSize - PreviewMargin * 2) / 2
// Folder background height: item + margin, plus one slot (item + 2 margins) per server when open
const ClosedHeight = ItemSize + ItemMargin
const SlotHeight = ItemSize + ItemMargin * 2
/** Placeholder servers inside the open folder. */
const Servers = 3
const OpenHeight = ClosedHeight + SlotHeight * Servers
const RailWidth = 72
// Size of the folder icon at the top, centered in its item. Approximate: Discord's asset size isn't in the mirror.
const FolderIconSize = 24
const Duration = 220

/** Sample folder color, only for the preview. Not saved and never applied to real folders. */
const SampleHex = '#515f2e'

const styles = StyleSheet.create({
	row: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
	rail: {
		width: RailWidth,
		height: OpenHeight + ItemMargin * 2,
		borderRadius: 16,
		paddingTop: ItemMargin,
		alignItems: 'center',
	},
	folder: { width: ItemSize, borderRadius: ItemSize },
	layer: {
		position: 'absolute',
		top: 0,
		left: 0,
		width: ItemSize,
		height: ItemSize,
		alignItems: 'center',
		justifyContent: 'center',
	},
	mini: {
		position: 'absolute',
		width: MiniSize,
		height: MiniSize,
		borderRadius: 6,
	},
	server: {
		position: 'absolute',
		left: 0,
		width: ItemSize,
		height: ItemSize,
		borderRadius: 16,
	},
	icon: { width: FolderIconSize, height: FolderIconSize },
	side: { flex: 1, minWidth: 0 },
})

// Corners of the 2x2 grid of mini icons
const MiniPositions = [
	{ top: PreviewMargin, left: PreviewMargin },
	{ top: PreviewMargin, right: PreviewMargin },
	{ bottom: PreviewMargin, left: PreviewMargin },
	{ bottom: PreviewMargin, right: PreviewMargin },
] as const

function useOpenProgress() {
	const progress = useRef(new Animated.Value(0)).current
	const [open, setOpen] = useState(false)

	useEffect(() => {
		const animation = Animated.timing(progress, {
			toValue: open ? 1 : 0,
			duration: Duration,
			easing: Easing.out(Easing.cubic),
			// Animates height and colors, which the native driver can't
			useNativeDriver: false,
		})
		animation.start()
		return () => animation.stop()
	}, [open, progress])

	return { progress, toggle: () => setOpen(value => !value) }
}

interface FolderProps {
	hex: string
	settings: Settings
}

/** Simulated folder: tap to open or close. Reflects the settings live. */
const Folder = memo(function Folder({ hex, settings }: FolderProps) {
	const { progress, toggle } = useOpenProgress()
	const tokens = lookupTokens()
	const iconId = useMemo(() => getAssetIdByName(FolderIconAsset), [])
	if (!tokens) return null

	const colors = previewColors(tokens)
	// What the real folder does: Discord tints the icon with the folder color, and the mode may replace it
	const tint = iconTintFor(hex, settings, colors) ?? hex

	const height = progress.interpolate({
		inputRange: [0, 1],
		outputRange: [ClosedHeight, OpenHeight],
	})
	const backgroundColor = progress.interpolate({
		inputRange: [0, 1],
		outputRange: [
			withOpacity(hex, settings.closedOpacity),
			withOpacity(hex, settings.openOpacity),
		],
	})
	const closedLayer = progress.interpolate({
		inputRange: [0, 1],
		outputRange: [1, 0],
	})

	return (
		<Pressable
			onPress={toggle}
			accessibilityRole="button"
			accessibilityLabel="Preview folder, tap to open or close"
		>
			{/* Over the rail color, like Discord draws it */}
			<Animated.View style={[styles.folder, { height, backgroundColor }]}>
				<Animated.View style={[styles.layer, { opacity: closedLayer }]}>
					{MiniPositions.map((position, index) => (
						// Mini icons keep their own color in every icon mode
						<Animated.View
							key={index}
							style={[
								styles.mini,
								position,
								{ backgroundColor: colors.server },
							]}
						/>
					))}
				</Animated.View>
				<Animated.View style={[styles.layer, { opacity: progress }]}>
					{iconId !== undefined && (
						<Image
							source={iconId as number}
							style={[styles.icon, { tintColor: tint }]}
						/>
					)}
				</Animated.View>
				{Array.from({ length: Servers }, (_, index) => (
					<Animated.View
						key={index}
						style={[
							styles.server,
							{
								top: ClosedHeight + SlotHeight * index,
								backgroundColor: colors.server,
								opacity: progress,
							},
						]}
					/>
				))}
			</Animated.View>
		</Pressable>
	)
})

function RailBackground({ children }: { children: React.ReactNode }) {
	const tokens = lookupTokens()
	const rail = tokens ? previewColors(tokens).rail : undefined
	return (
		<Animated.View
			style={[styles.rail, rail ? { backgroundColor: rail } : null]}
		>
			{children}
		</Animated.View>
	)
}

/**
 * Interactive preview of a Discord server folder. `settings` is the live state of the sliders,
 * so it follows them while they are dragged, before anything is saved.
 */
export default function FolderPreview({ settings }: { settings: Settings }) {
	// What is typed, and the last complete HEX, which the folder keeps showing while typing
	const [text, setText] = useState(SampleHex)
	const [hex, setHex] = useState(SampleHex)
	const invalid = text.length > 0 && normalizeHex(text) === undefined

	return (
		<Animated.View style={styles.row}>
			<RailBackground>
				<Folder hex={hex} settings={settings} />
			</RailBackground>
			<Animated.View style={styles.side}>
				<Stack spacing={12}>
					<Text variant="text-sm/medium" color="text-muted">
						Tap the folder to open or close it. The HEX below is only for this
						preview.
					</Text>
					<TextField
						value={text}
						placeholder="#RRGGBB"
						maxLength={7}
						size="md"
						status={invalid ? 'error' : 'default'}
						errorMessage={invalid ? 'Use the format #RRGGBB' : undefined}
						onChange={value => {
							setText(value)
							const next = normalizeHex(value)
							if (next) setHex(next)
						}}
						onBlur={() => {
							// Back to the last valid color if left incomplete
							if (normalizeHex(text) === undefined) setText(hex)
						}}
					/>
				</Stack>
			</Animated.View>
		</Animated.View>
	)
}
