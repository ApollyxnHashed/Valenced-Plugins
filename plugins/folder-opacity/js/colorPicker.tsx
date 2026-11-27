import {
	ActionSheetActionCreators,
	ActionSheetActionCreatorsModuleId,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import {
	allOf,
	withDependencies,
	withName,
	withProps,
} from '@valenced/modules/finders/filters'
import { useState } from 'react'
import { Animated, Pressable, StyleSheet } from 'react-native'
import { hexToInt, intToHex, normalizeHex } from './color'
import { sliderProps } from './slider'
import { lookupTokens, tokensFilter } from './tokens'
import type { ComponentType } from 'react'

const { BottomSheet, BottomSheetTitleHeader, Button, Stack, Text, TextField } =
	Design

/** Props of Discord's role color sheet (../discord_app/components_native/common/color_picker/RoleColorPickerActionSheet.tsx). */
export interface ColorSheetProps {
	/** Selected color, as an integer. */
	color: number
	/** Color "Reset" goes back to. */
	defaultColor: number
	onSelect(color: number): void
}

const SheetPath =
	'components_native/common/color_picker/RoleColorPickerActionSheet.tsx'
const SheetName = 'RoleColorPickerActionSheet'
const SheetKey = 'FolderOpacityColorPicker'

// Modules the sheet imports, in this order, before its own code (same sheet file as above)
const SheetImports = [
	'modules/color_picker/native/showCustomColorPickerActionSheet.tsx',
	'components_native/common/color_picker/ColorBlock.tsx',
]

let nativeSheet: ComponentType<ColorSheetProps> | undefined

/**
 * Discord's own color sheet: the palette with the eyedropper that opens the HSV picker.
 *
 * Discord loads it only when something opens it, so it may not exist yet. In that case it's
 * found by what it imports, which Discord's finders read before running any module, so only
 * modules that import the same things in the same order are initialized, and the sheet is
 * told apart from them by its name.
 */
function lookupNativeSheet() {
	if (nativeSheet) return nativeSheet

	const [loaded, loadedId] = lookupModuleWithImportedPath<{
		default: ComponentType<ColorSheetProps>
	}>(SheetPath)
	if (loadedId !== undefined) return (nativeSheet = loaded?.default)

	const [, tokensId] = lookupModule(tokensFilter(), { cached: true })
	if (tokensId === undefined) return undefined

	const imports: number[] = [tokensId, ActionSheetActionCreatorsModuleId]
	for (const path of SheetImports) {
		const [, id] = lookupModuleWithImportedPath(path)
		if (id !== undefined) imports.push(id)
	}

	const [found, id] = lookupModule(
		allOf(
			withDependencies(withDependencies.ordered(imports)),
			withName(SheetName),
		),
	)
	return id === undefined
		? undefined
		: (nativeSheet = found as ComponentType<ColorSheetProps>)
}

interface RoleColors {
	ROLE_COLORS: number[]
	DEFAULT_ROLE_COLOR: number
}

const styles = StyleSheet.create({
	body: { paddingHorizontal: 16, paddingBottom: 32 },
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		justifyContent: 'center',
		maxWidth: 340,
		alignSelf: 'center',
	},
	// Same measures as Discord's ColorBlock (../discord_app/components_native/common/color_picker/ColorBlock.tsx)
	block: {
		minWidth: 44,
		height: 44,
		borderRadius: 24,
		marginHorizontal: 12,
		marginVertical: 8,
	},
	selected: { borderWidth: 3 },
})

/** Palette in the order Discord shows it: light row, dark row, light row, dark row. */
function paletteOrder(colors: number[]) {
	return [
		...colors.slice(0, 5),
		...colors.slice(10, 15),
		...colors.slice(5, 10),
		...colors.slice(15, 18),
	]
}

const Channels = [
	{ name: 'Red', shift: 16 },
	{ name: 'Green', shift: 8 },
	{ name: 'Blue', shift: 0 },
] as const

/**
 * Plain version of the color sheet, for when Discord's own can't be found: its palette, a HEX
 * field and red, green and blue sliders. It doesn't draw the saturation and hue picker, which
 * needs Discord's gradient and gesture views.
 */
function FallbackColorSheet({
	color,
	defaultColor,
	onSelect,
}: ColorSheetProps) {
	const [current, setCurrent] = useState(color)
	const [text, setText] = useState(intToHex(color))
	const [role] = lookupModule(
		withProps<RoleColors>('ROLE_COLORS', 'DEFAULT_ROLE_COLOR'),
		{ cached: true },
	)
	const palette = role ? paletteOrder(role.ROLE_COLORS) : []
	const ringColor = lookupTokens()?.RawColor.WHITE_500

	const pick = (next: number) => {
		setCurrent(next)
		setText(intToHex(next))
	}

	return (
		<BottomSheet
			scrollable
			header={
				<BottomSheetTitleHeader
					title="Select a color"
					trailing={
						<Button
							size="sm"
							text="Save"
							onPress={() => {
								onSelect(current)
								ActionSheetActionCreators.hideActionSheet(SheetKey)
							}}
						/>
					}
				/>
			}
		>
			<Stack spacing={16}>
				<Animated.View style={[styles.body, styles.grid]}>
					{palette.map(value => (
						<Pressable
							key={value}
							accessibilityRole="button"
							accessibilityLabel={intToHex(value)}
							onPress={() => pick(value)}
							style={[
								styles.block,
								{ backgroundColor: intToHex(value) },
								value === current
									? [styles.selected, { borderColor: ringColor }]
									: null,
							]}
						/>
					))}
				</Animated.View>
				<Animated.View style={styles.body}>
					<Stack spacing={12}>
						<TextField
							value={text}
							maxLength={7}
							placeholder="#RRGGBB"
							status={
								text.length > 0 && !normalizeHex(text) ? 'error' : 'default'
							}
							onChange={value => {
								setText(value)
								const next = hexToInt(value)
								if (next !== undefined) setCurrent(next)
							}}
						/>
						{Channels.map(({ name, shift }) => (
							<Stack key={name} spacing={4}>
								<Text variant="text-sm/semibold" color="text-default">
									{name}
								</Text>
								<Design.Slider
									{...sliderProps({
										value: (current >> shift) & 0xff,
										min: 0,
										max: 255,
										step: 1,
										label: name,
										onChange: channel =>
											pick(
												(current & ~(0xff << shift)) |
													(Math.round(channel) << shift),
											),
										onCommit: () => {},
									})}
								/>
							</Stack>
						))}
						<Button
							variant="secondary"
							text="Reset"
							onPress={() => pick(defaultColor)}
						/>
					</Stack>
				</Animated.View>
			</Stack>
		</BottomSheet>
	)
}

/** Opens the color sheet: Discord's own when it's available, a plain one otherwise. */
export function openColorPicker(props: ColorSheetProps) {
	let sheet: ComponentType<ColorSheetProps> | undefined
	try {
		sheet = lookupNativeSheet()
	} catch {
		// A lookup that fails must not stop the picker from opening
	}
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: sheet ?? FallbackColorSheet }),
		SheetKey,
		props,
	)
}
