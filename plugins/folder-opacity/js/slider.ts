import type { Design } from '@valenced/discord/design'
import type { ComponentProps, ReactNode } from 'react'

type SliderComponentProps = ComponentProps<typeof Design.Slider>

interface SliderOptions {
	value: number
	min: number
	max: number
	step: number
	label: string
	onChange(value: number): void
	/** Called when the slider is released. */
	onCommit(value: number): void
	startIcon?: ReactNode
	endIcon?: ReactNode
}

/**
 * Props of Discord's slider.
 *
 * The slider takes its range under the names @valenced/types declares (`minimumValue`,
 * `maximumValue`, `onValueChange`, `onSlidingComplete`). Discord's own settings code uses
 * `minValue`, `maxValue`, `onChange` and `onChangeEnd` for the same props, so both are
 * passed. With only the latter the range falls back to a default one and the thumb sticks to the end.
 */
export function sliderProps({
	value,
	min,
	max,
	step,
	label,
	onChange,
	onCommit,
	startIcon,
	endIcon,
}: SliderOptions) {
	return {
		step,
		value,
		minimumValue: min,
		maximumValue: max,
		onValueChange: onChange,
		onSlidingComplete: onCommit,
		minValue: min,
		maxValue: max,
		onChange,
		onChangeEnd: onCommit,
		startIcon,
		endIcon,
		accessibilityLabel: label,
	} as unknown as SliderComponentProps
}
