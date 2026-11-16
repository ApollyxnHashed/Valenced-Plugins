import { Design } from '@valenced/discord/design'
import { useState } from 'react'

const { TextInput } = Design

export interface NumberInputProps {
	value: number
	min: number
	max: number
	/** How many decimals to show. */
	decimals?: number
	label?: string
	description?: string
	trailingText?: string
	onCommit(value: number): void
}

export function formatNumber(value: number, decimals = 0): string {
	const factor = 10 ** decimals
	return String(Math.round((value + Number.EPSILON) * factor) / factor)
}

function parseNumber(text: string): number | undefined {
	// Many keyboards only have a decimal comma
	const normalized = text.trim().replace(',', '.')
	if (normalized === '') return undefined
	const value = Number(normalized)
	return Number.isFinite(value) ? value : undefined
}

/**
 * Number field that only applies its value when you are done typing,
 * so half-typed numbers never reach the call.
 */
export function NumberInput({
	value,
	min,
	max,
	decimals = 0,
	label,
	description,
	trailingText,
	onCommit,
}: NumberInputProps) {
	// null while not editing, so the field follows `value`
	const [draft, setDraft] = useState<string | null>(null)
	const shown = formatNumber(value, decimals)

	const commit = () => {
		if (draft === null) return
		setDraft(null)
		const parsed = parseNumber(draft)
		if (parsed === undefined || draft === shown) return
		onCommit(Math.min(Math.max(parsed, min), max))
	}

	// Not part of the typed props, but passed on to the native input
	const nativeProps = {
		keyboardType: 'numeric',
		returnKeyType: 'done' as const,
		selectTextOnFocus: true,
		accessibilityLabel: label ?? 'Volume in percent',
	}

	return (
		<TextInput
			{...nativeProps}
			label={label}
			description={description}
			trailingText={trailingText}
			value={draft ?? shown}
			onFocus={() => setDraft(shown)}
			onChange={setDraft}
			onBlur={commit}
		/>
	)
}
