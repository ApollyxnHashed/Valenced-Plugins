import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Image, Pressable, StyleSheet } from 'react-native'
import { hexToInt, iconTintFor, intToHex, withOpacity } from './color'
import { openColorPicker } from './colorPicker'
import { firstFolderColor } from './folders'
import { FolderIconAsset } from './shared'
import { defaultFolderColor, lookupTokens, lookupUseToken } from './tokens'
import type { IconColors } from './color'
import type { Settings } from './shared'

const { Card, Stack, TableRow, TableRowGroup, Text } = Design

/** Servers inside the open folder, and icons drawn on the closed one. */
const OpenServers = 3

// Springs of Discord's folder (../discord_app/modules/guilds_bar/native/GuildsBarConstants.tsx):
// the folder background grows with TRANSITION_PHYSICS and its icons move with FOLDER_SPRING_PHYSICS.
const HeightSpring = { mass: 0.5, damping: 15, stiffness: 120 }
const IconSpring = { mass: 0.5, damping: 30, stiffness: 300 }

// Width of Discord's server list, and where its items start
const RailWidth = 72
const RailRadius = 16
// Mini icons on a closed folder: GuildIconSizes.XXSMALL and radii.sm
const MiniSize = 16
const MiniRadius = 8

/**
 * Server list measures. They come from Discord's tokens, which depend on experiments (the "visual
 * refresh" layout changes most of them), and fall back to the classic layout's values.
 * ../discord_common/js/packages/tokens/modules/generated/generated-definitions.tsx
 */
const MetricTokens = {
	size: ['GUILD_BAR_ITEM_SIZE', 48],
	margin: ['GUILD_BAR_ITEM_MARGIN', 4],
	left: ['GUILD_FOLDER_BACKGROUND_LEFT', 12],
	radius: ['GUILD_FOLDER_BACKGROUND_RADIUS', 1000],
	widthOffset: ['GUILD_FOLDER_BACKGROUND_WIDTH_OFFSET', 0],
	previewMargin: ['GUILD_FOLDER_PREVIEW_ICON_MARGIN', 6],
	itemRadius: ['GUILD_ITEM_SELECTED_BORDER_RADIUS', 16],
} as const

type Metrics = { -readonly [K in keyof typeof MetricTokens]: number }

/** Semantic colors the preview reads, like the real folder does. */
const ColorTokens = {
	rail: 'BACKGROUND_BASE_LOWEST',
	server: 'BACKGROUND_SURFACE_HIGHEST',
	folder: 'GUILD_FOLDER_BACKGROUND',
} as const

type Colors = { -readonly [K in keyof typeof ColorTokens]?: string }

interface Resolved {
	metrics: Metrics
	colors: Colors
	iconColors: IconColors
	defaultColor: string
}

/**
 * Reads the measures and colors through Discord's `useToken`, so they follow the theme and the
 * layout Discord is showing. Both lookups happen once per mount: the hooks below must run the
 * same number of times on every render.
 */
function useResolved(): Resolved | undefined {
	const [source] = useState(() => {
		const tokens = lookupTokens()
		const useToken = lookupUseToken()
		return tokens && useToken ? { tokens, useToken } : undefined
	})
	if (!source) return undefined
	const { tokens, useToken } = source
	const { mobile } = tokens.default.modules

	const metrics = {} as Metrics
	for (const key of Object.keys(MetricTokens) as (keyof Metrics)[]) {
		const [name, fallback] = MetricTokens[key]
		const value = useToken(mobile[name])
		metrics[key] = typeof value === 'number' ? value : fallback
	}

	const colors: Colors = {}
	for (const key of Object.keys(ColorTokens) as (keyof Colors)[]) {
		const value = useToken(tokens.default.colors[ColorTokens[key]])
		if (typeof value === 'string') colors[key] = value
	}

	const { WHITE_500, BLACK_500 } = tokens.RawColor
	return {
		metrics,
		colors,
		iconColors: {
			white: WHITE_500!,
			black: BLACK_500!,
			rail: colors.rail ?? BLACK_500!,
		},
		defaultColor: defaultFolderColor(tokens),
	}
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
	side: { flex: 1, minWidth: 0 },
	rail: { width: RailWidth, borderRadius: RailRadius, overflow: 'hidden' },
	abs: { position: 'absolute' },
	fill: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
	// Same as the folder color row of Discord's folder settings
	// (../discord_app/modules/guilds_bar/native/GuildsBarFolderSettingsModal.tsx)
	swatch: { minWidth: 24, height: 24, borderRadius: 3 },
})

// Corners of the 2x2 grid of mini icons: [row, column]
const MiniCells = [
	[0, 0],
	[0, 1],
	[1, 0],
	[1, 1],
] as const

interface RailProps extends Resolved {
	hex: string
	settings: Settings
}

/**
 * A server folder as Discord draws it in the server list
 * (../discord_app/modules/guilds_bar/native/GuildsBarGuildFolder.tsx): a closed one shows four mini
 * icons over a background, an open one shows its icon over a taller background with its servers.
 */
function Rail({
	hex,
	settings,
	metrics: m,
	colors,
	iconColors,
	defaultColor,
}: RailProps) {
	const [expanded, setExpanded] = useState(false)
	const icons = useRef(new Animated.Value(0)).current
	const height = useRef(new Animated.Value(0)).current
	const iconId = useMemo(() => getAssetIdByName(FolderIconAsset), [])

	// One slot per server, and the folder's own icon on top
	const slot = m.size + m.margin * 2
	const closedHeight = m.size + m.margin
	const openHeight = closedHeight + slot * OpenServers
	const itemLeft = m.left + m.widthOffset / 2

	useEffect(() => {
		const toIcons = Animated.spring(icons, {
			toValue: expanded ? 1 : 0,
			...IconSpring,
			useNativeDriver: false,
		})
		if (!expanded) {
			toIcons.start()
			return () => toIcons.stop()
		}
		// The open background grows from the closed folder's height
		height.setValue(closedHeight)
		const grow = Animated.spring(height, {
			toValue: openHeight,
			...HeightSpring,
			useNativeDriver: false,
		})
		toIcons.start()
		grow.start()
		return () => {
			toIcons.stop()
			grow.stop()
		}
	}, [expanded, icons, height, closedHeight, openHeight])

	// Discord draws the default color with its own background and ignores the opacity tokens
	const isDefault = hexToInt(hex) === hexToInt(defaultColor)
	const closedBackground =
		isDefault && colors.folder
			? colors.folder
			: withOpacity(hex, settings.closedOpacity)
	const openBackground =
		isDefault && colors.folder
			? colors.folder
			: withOpacity(hex, settings.openOpacity)
	// What the real folder's icon gets: the folder color, which the icon mode may replace
	const tint = iconTintFor(hex, settings, iconColors) ?? hex

	const opacityIn = icons
	const opacityOut = icons.interpolate({
		inputRange: [0, 1],
		outputRange: [1, 0],
	})
	// The closed icons leave downwards and grow, the folder icon comes in from above
	const miniStyle = {
		opacity: opacityOut,
		transform: [
			{
				translateY: icons.interpolate({
					inputRange: [0, 1],
					outputRange: [0, m.size],
				}),
			},
			{
				scale: icons.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }),
			},
		],
	}
	const iconStyle = {
		opacity: opacityIn,
		transform: [
			{
				translateY: icons.interpolate({
					inputRange: [0, 1],
					outputRange: [-m.size, 0],
				}),
			},
			{
				scale: icons.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
			},
		],
	}

	const iconSource =
		iconId === undefined
			? undefined
			: Image.resolveAssetSource(iconId as number)

	return (
		<Animated.View
			style={[
				styles.rail,
				{
					height: closedHeight + m.margin + slot * OpenServers,
					backgroundColor: colors.rail,
				},
			]}
		>
			{expanded && (
				<Animated.View
					pointerEvents="none"
					style={[
						styles.abs,
						{
							top: m.margin,
							left: m.left,
							width: m.size + m.widthOffset,
							height,
							// A radius larger than half the width makes the same capsule
							borderRadius: Math.min(m.radius, (m.size + m.widthOffset) / 2),
							backgroundColor: openBackground,
						},
					]}
				/>
			)}

			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Preview folder, tap to open or close"
				onPress={() => setExpanded(value => !value)}
				style={[
					styles.abs,
					{ top: m.margin, left: itemLeft, width: m.size, height: m.size },
				]}
			>
				<Animated.View
					style={[
						styles.fill,
						{
							borderRadius: m.itemRadius,
							backgroundColor: expanded ? undefined : closedBackground,
						},
					]}
				>
					{MiniCells.map(([row, column]) => (
						<Animated.View
							key={`${row}${column}`}
							style={[
								styles.abs,
								{
									top: row
										? m.size - m.previewMargin - MiniSize
										: m.previewMargin,
									left: column
										? m.size - m.previewMargin - MiniSize
										: m.previewMargin,
									width: MiniSize,
									height: MiniSize,
									borderRadius: MiniRadius,
									backgroundColor: colors.server,
								},
								miniStyle,
							]}
						/>
					))}
					<Animated.View
						style={[
							styles.fill,
							{ alignItems: 'center', justifyContent: 'center' },
							iconStyle,
						]}
					>
						{iconId !== undefined && (
							<Image
								source={iconId as number}
								style={{
									width: iconSource?.width ?? 24,
									height: iconSource?.height ?? 24,
									tintColor: tint,
								}}
							/>
						)}
					</Animated.View>
				</Animated.View>
			</Pressable>

			{Array.from({ length: OpenServers }, (_, index) => (
				<Animated.View
					key={index}
					pointerEvents="none"
					style={[
						styles.abs,
						{
							top: closedHeight + m.margin + slot * index,
							left: itemLeft,
							width: m.size,
							height: m.size,
							borderRadius: m.itemRadius,
							backgroundColor: colors.server,
							opacity: expanded ? opacityIn : 0,
						},
					]}
				/>
			))}
		</Animated.View>
	)
}

/**
 * Preview of a server folder: the color row, and the folder itself, which opens and closes.
 * `settings` is the live state of the controls, so it follows them before anything is saved.
 * The color is only for the preview and never reaches the real folders.
 */
export default function FolderPreview({ settings }: { settings: Settings }) {
	const resolved = useResolved()
	// First folder in Discord's server list, read once when the screen opens. A color picked by
	// hand always wins over it.
	const [detected] = useState(firstFolderColor)
	const [picked, setPicked] = useState<string>()

	if (!resolved) {
		return (
			<Text variant="text-sm/medium" color="text-muted">
				The preview isn't available on this version of Discord.
			</Text>
		)
	}

	const hex = picked ?? detected ?? resolved.defaultColor
	const isDefault = hexToInt(hex) === hexToInt(resolved.defaultColor)

	return (
		<Stack spacing={16}>
			<TableRowGroup>
				<TableRow
					label="Folder Color"
					subLabel={hex}
					arrow
					trailing={
						<Animated.View style={[styles.swatch, { backgroundColor: hex }]} />
					}
					onPress={() =>
						openColorPicker({
							color: hexToInt(hex) ?? 0,
							defaultColor: hexToInt(resolved.defaultColor) ?? 0,
							onSelect: color => setPicked(intToHex(color)),
						})
					}
				/>
			</TableRowGroup>
			<Card shadow="none" border="none">
				<Animated.View style={styles.row}>
					<Rail {...resolved} hex={hex} settings={settings} />
					<Animated.View style={styles.side}>
						<Stack spacing={8}>
							<Text variant="text-sm/medium" color="text-muted">
								Tap the folder to open or close it. The color is only for this
								preview.
							</Text>
							{isDefault && (
								<Text variant="text-sm/medium" color="text-muted">
									Discord draws its default color with its own background, so
									opacity doesn't apply to it. Pick another color to see the
									opacity.
								</Text>
							)}
						</Stack>
					</Animated.View>
				</Animated.View>
			</Card>
		</Stack>
	)
}
