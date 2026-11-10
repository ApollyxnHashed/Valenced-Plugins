import type { ValueMap } from './profiles'

const MinContainsLength = 3
const MaxContainsTextLength = 80
const MaxNesting = 3

// Separators between the username and the pronouns on the line under the display name.
const Delimiter = '[•·|]'
const delimiterAfter = new RegExp(`^\\s*${Delimiter}`)
const delimiterBefore = new RegExp(`${Delimiter}\\s*$`)

/** Calls `callback` with every string in a Text's children, looking a few levels deep. */
function forEachText(
	children: unknown,
	callback: (text: string) => void,
	depth = 0,
): void {
	if (typeof children === 'string') return callback(children)
	if (depth >= MaxNesting || !children || typeof children !== 'object') return

	if (Array.isArray(children)) {
		for (const child of children) forEachText(child, callback, depth + 1)
		return
	}

	const inner = (children as { props?: { children?: unknown } }).props?.children
	if (inner !== undefined) forEachText(inner, callback, depth + 1)
}

/** Ids of the users that have a value the children match, according to `matches`. */
function scan(
	maps: ValueMap[],
	children: unknown,
	matches: (text: string, value: string) => boolean,
): Set<string> {
	const userIds = new Set<string>()
	if (maps.every(map => !map.size)) return userIds

	forEachText(children, rawText => {
		const text = rawText.trim()
		for (const map of maps)
			for (const [value, ids] of map)
				if (matches(text, value)) for (const id of ids) userIds.add(id)
	})
	return userIds
}

export function matchExact(map: ValueMap, children: unknown): Set<string> {
	const userIds = new Set<string>()
	if (!map.size) return userIds

	forEachText(children, text => {
		const ids = map.get(text.trim())
		if (ids) for (const id of ids) userIds.add(id)
	})
	return userIds
}

// Pronouns can share a line with other text, so allow "contains" for short texts.
export const matchContains = (map: ValueMap, children: unknown) =>
	scan(
		[map],
		children,
		(text, value) =>
			text === value ||
			(text.length <= MaxContainsTextLength &&
				value.length >= MinContainsLength &&
				text.includes(value)),
	)

// Strict on purpose: this decides that "a profile is open".
function isAnchorText(text: string, value: string) {
	return (
		text === value ||
		(text.startsWith(value) &&
			delimiterAfter.test(text.slice(value.length))) ||
		(text.endsWith(value) &&
			delimiterBefore.test(text.slice(0, text.length - value.length)))
	)
}

export const matchAnchor = (maps: ValueMap[], children: unknown) =>
	scan(maps, children, isAnchorText)
