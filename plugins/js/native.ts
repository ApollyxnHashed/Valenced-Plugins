import { callNativeMethod } from '@valenced/modules/native'
import { NativePrefix } from './shared'

export interface NativeEntry {
	className: string
	hierarchy: string
	chain: string
	inputType: string
	imeOptions: string
	privateImeOptions: string | null
	hint: string | null
	description: string | null
	tag: string | null
	firstMs: number
	lastMs: number
	count: number
	patched: boolean
	patchedInputType: string | null
}

export interface NativeReport {
	device: {
		manufacturer: string
		model: string
		sdk: number
		release: string
		ime: string | null
	}
	hookInstalled: boolean
	installError: string | null
	lastError: string | null
	experiment: boolean
	entries: NativeEntry[]
}

export async function getNativeReport(): Promise<NativeReport> {
	return JSON.parse(await callNativeMethod(`${NativePrefix}.getReport`, []))
}

export function clearNative() {
	return callNativeMethod(`${NativePrefix}.clear`, [])
}

export function setNativeExperiment(enabled: boolean) {
	return callNativeMethod(`${NativePrefix}.setExperiment`, [enabled])
}

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'axonyum.chat-emoji-diagnostic.getReport': [[], string]
		'axonyum.chat-emoji-diagnostic.clear': [[], null]
		'axonyum.chat-emoji-diagnostic.setExperiment': [[enabled: boolean], null]
	}
}
