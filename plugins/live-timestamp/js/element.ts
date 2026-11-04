import { cloneElement, isValidElement } from 'react'
import type { ReactNode } from 'react'

const TABULAR = { fontVariant: ['tabular-nums'] }

/** First string in the tree, e.g. "in 5 minutes" from the native render. */
export function firstString(node: ReactNode): string | undefined {
	if (typeof node === 'string') return node
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = firstString(child)
			if (found !== undefined) return found
		}
		return undefined
	}
	if (isValidElement(node)) return firstString((node.props as any)?.children)
	return undefined
}

/**
 * Returns a copy of the tree with the first text replaced. Keeps the original
 * element's props, styles, onPress, etc. Tabular digits stop the width from
 * shifting every second.
 */
export function replaceFirstString(
	node: ReactNode,
	next: string,
): { node: ReactNode; found: boolean } {
	if (typeof node === 'string') return { node: next, found: true }

	if (Array.isArray(node)) {
		let found = false
		const out = node.map(child => {
			if (found) return child
			const r = replaceFirstString(child, next)
			found = r.found
			return r.node
		})
		return { node: found ? out : node, found }
	}

	if (isValidElement(node)) {
		const props = node.props as any
		const r = replaceFirstString(props?.children, next)
		if (!r.found) return { node, found: false }
		const holdsText =
			typeof props.children === 'string' ||
			(Array.isArray(props.children) &&
				props.children.some((c: unknown) => typeof c === 'string'))
		const patch: Record<string, unknown> = { children: r.node }
		if (holdsText) patch.style = [props.style, TABULAR]
		return { node: cloneElement(node, patch), found: true }
	}

	return { node, found: false }
}
