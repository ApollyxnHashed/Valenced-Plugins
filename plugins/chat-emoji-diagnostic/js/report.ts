import { ClientInfoModule } from '@valenced/discord/native'
import { getErrorStack } from '@valenced/utils/error'
import { getDroppedCount, getJsEntries } from './capture'
import { getNativeReport } from './native'
import type { Settings } from './shared'

const pad = (n: number, length = 2) => String(n).padStart(length, '0')

function time(ms: number) {
	const d = new Date(ms)
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function discordVersion() {
	try {
		return String(ClientInfoModule.getConstants().Version)
	} catch {
		return 'unknown'
	}
}

export async function buildReport(settings: Settings) {
	const lines: string[] = [
		'=== Chat Emoji Diagnostic report ===',
		`Generated: ${time(Date.now())}`,
		`Discord: ${discordVersion()}`,
		`Experiments: js=${settings.jsExperiment ? 'ON' : 'off'} native=${settings.nativeExperiment ? 'ON' : 'off'}`,
		'',
		'-- NATIVE: keyboard request (EditorInfo) --',
	]

	try {
		const native = await getNativeReport()
		const { device } = native

		lines.push(
			`Device: ${device.manufacturer} ${device.model}, Android ${device.release} (SDK ${device.sdk})`,
			`Keyboard (IME): ${device.ime ?? 'unknown'}`,
			`Hook installed: ${native.hookInstalled}${native.installError ? ` (error: ${native.installError})` : ''}`,
		)
		if (native.lastError) lines.push(`Last native error: ${native.lastError}`)
		if (!native.entries.length) lines.push('(nothing captured yet)')

		for (const e of native.entries) {
			lines.push(
				'',
				`${time(e.firstMs)} x${e.count}${e.patched ? ' [EXPERIMENT APPLIED]' : ''}`,
				`  view: ${e.hierarchy}`,
				`  inputType: ${e.inputType}`,
				`  imeOptions: ${e.imeOptions}`,
				`  privateImeOptions: ${JSON.stringify(e.privateImeOptions)}`,
				`  hint: ${JSON.stringify(e.hint)} description: ${JSON.stringify(e.description)} tag: ${JSON.stringify(e.tag)}`,
				`  parents: ${e.chain}`,
			)
			if (e.patchedInputType)
				lines.push(`  inputType after experiment: ${e.patchedInputType}`)
		}
	} catch (e) {
		lines.push(`Native part unavailable: ${getErrorStack(e)}`)
	}

	lines.push('', '-- JS: text input props --')
	const js = getJsEntries()
	if (!js.length) lines.push('(nothing captured yet)')

	for (const e of js) {
		lines.push(
			'',
			`${time(e.firstMs)} x${e.count} ${e.source}${e.patched ? ' [EXPERIMENT APPLIED]' : ''}`,
			`  props: ${JSON.stringify(e.props)}`,
			`  all prop names: ${e.propKeys.join(', ')}`,
			`  value length: ${e.valueLength ?? 'n/a'}`,
			`  stack: ${e.stack.join(' < ')}`,
		)
	}

	const dropped = getDroppedCount()
	if (dropped) lines.push('', `(${dropped} more entries were not recorded)`)

	return lines.join('\n')
}
