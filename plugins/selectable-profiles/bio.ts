import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { ReactNative } from '@valenced/react'
import { isEnabled } from './storage'
import { noop } from './shared'
import type { PluginApi } from '@valenced/plugins/types'

interface Node {
	type?: unknown
	props?: Record<string, unknown>
}

interface BioTextModule {
	default(props: unknown): Node | null
}

const hasBioText = (module: object): module is BioTextModule =>
	'default' in module && typeof module.default === 'function'

function makeSelectable(props: Record<string, unknown>) {
	props.selectable = true
	// A Text with a press handler becomes the touch responder, which lets the native
	// long-press selection start inside a pressable parent.
	if (typeof props.onPress !== 'function') props.onPress = noop
}

function selectAllText(node: unknown): void {
	if (!node || typeof node !== 'object') return

	const { type, props } = node as Node
	if (type === ReactNative.Text && props) makeSelectable(props)

	const children = props?.children
	if (Array.isArray(children)) for (const child of children) selectAllText(child)
	else selectAllText(children)
}

// Same technique as the "Selectable Bios" community plugin: `BioText` renders the bio.
export function patchBio({ cleanup }: Pick<PluginApi, 'cleanup'>) {
	cleanup(
		getModules(
			withName('BioText'),
			module => {
				if (!hasBioText(module)) return

				cleanup(
					after(module, 'default', result => {
						if (!isEnabled('bio') || !result?.props) return result

						makeSelectable(result.props)
						selectAllText(result)

						return result
					}),
				)
			},
			{ returnNamespace: true, max: 1 },
		),
	)
}
