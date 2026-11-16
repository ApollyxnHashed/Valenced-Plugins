import { ToastActionCreators } from '@valenced/discord/actions'
import { getStore } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { hideNotice, showNotice } from './notice'

// Discord command constants (see ApplicationCommandTypes / flow/Server in the Discord source).
const COMMAND_TYPE_CHAT = 1
const INPUT_TYPE_BUILT_IN = 0
const OPTION_TYPE_CHANNEL = 7
const CHANNEL_TYPE_GUILD_VOICE = 2

type Channel = {
	id: string
	name?: string
	type: number
	userLimit?: number
}
type CommandArg = { name: string; value: string }
type CommandContext = { channel: { id: string } }

type Command = {
	id?: string
	name: string
	description: string
	displayName: string
	displayDescription: string
	untranslatedName: string
	untranslatedDescription: string
	applicationId: string
	type: number
	inputType: number
	shouldHide: () => boolean
	options?: {
		name: string
		displayName: string
		description: string
		displayDescription: string
		type: number
		required: boolean
		channelTypes: number[]
	}[]
	execute: (args: CommandArg[], ctx: CommandContext) => void
}

type CommandsModule = {
	getBuiltInCommands(
		types: number | number[],
		all?: boolean,
		unused?: boolean,
	): { id: string; type: number }[]
}
type MessagesModule = {
	sendBotMessage(channelId: string, content: string): void
}
type VoiceActions = { selectVoiceChannel(channelId: string | null): void }
type ChannelUtils = {
	isChannelFull(
		channel: Channel,
		voiceStates: unknown,
		guilds: unknown,
	): boolean
}

type ChannelStore = { getChannel(id: string): Channel | undefined }
type VoiceStateStore = {
	getVoiceStatesForChannel(channelId: string): Record<string, unknown>
}
type SelectedChannelStore = { getVoiceChannelId(): string | null }

type Waiting = { channelId: string; name: string }

let waiting: Waiting | undefined

let messages: MessagesModule | undefined
let voiceActions: VoiceActions | undefined
let channelUtils: ChannelUtils | undefined
let channelStore: ChannelStore | undefined
let voiceStateStore: VoiceStateStore | undefined
let guildStore: unknown
let selectedChannelStore: SelectedChannelStore | undefined

function reply(ctx: CommandContext, content: string) {
	messages?.sendBotMessage(ctx.channel.id, content)
}

/** Whether Discord would refuse to let you into this voice channel right now because it is full. */
function isFull(channel: Channel): boolean {
	if (channelUtils && voiceStateStore)
		return channelUtils.isChannelFull(channel, voiceStateStore, guildStore)

	// Fallback if Discord's helper is not available: plain user limit check.
	const limit = channel.userLimit ?? 0
	const connected = Object.keys(
		voiceStateStore?.getVoiceStatesForChannel(channel.id) ?? {},
	).length
	return limit > 0 && connected >= limit
}

function join(channelId: string) {
	voiceActions?.selectVoiceChannel(channelId)
}

/** Runs on every voice state change; joins as soon as the awaited channel has room. */
function onVoiceStateChange() {
	if (!waiting || !channelStore) return

	const { channelId, name } = waiting
	const channel = channelStore.getChannel(channelId)

	// The channel was deleted, or you already joined it yourself: nothing left to wait for.
	if (!channel || selectedChannelStore?.getVoiceChannelId() === channelId) {
		waiting = undefined
		return
	}

	if (isFull(channel)) return

	waiting = undefined
	join(channelId)
	ToastActionCreators.open(`wait-for-slot-joined-${Date.now()}`, {
		text: `A slot opened in ${name}, so you joined.`,
		variant: 'success',
	})
}

function makeCommand(
	name: string,
	description: string,
	execute: Command['execute'],
	channelOption?: { name: string; description: string },
): Command {
	return {
		name,
		description,
		displayName: name,
		displayDescription: description,
		untranslatedName: name,
		untranslatedDescription: description,
		applicationId: '-1',
		type: COMMAND_TYPE_CHAT,
		inputType: INPUT_TYPE_BUILT_IN,
		shouldHide: () => false,
		options: channelOption && [
			{
				name: channelOption.name,
				displayName: channelOption.name,
				description: channelOption.description,
				displayDescription: channelOption.description,
				type: OPTION_TYPE_CHANNEL,
				required: true,
				channelTypes: [CHANNEL_TYPE_GUILD_VOICE],
			},
		],
		execute,
	}
}

const commands: Command[] = [
	makeCommand(
		'wait-for-slot',
		'Join a full voice channel as soon as a slot opens',
		(args, ctx) => {
			const channelId = args.find(arg => arg.name === 'channel')?.value
			const channel = channelId
				? channelStore?.getChannel(channelId)
				: undefined

			if (!channel || channel.type !== CHANNEL_TYPE_GUILD_VOICE)
				return reply(ctx, 'Pick a voice channel to wait for.')

			const name = channel.name ?? channel.id
			const { userLimit = 0 } = channel

			if (selectedChannelStore?.getVoiceChannelId() === channel.id)
				return reply(ctx, `You are already in ${name}.`)

			if (userLimit <= 0)
				return reply(
					ctx,
					`${name} has no user limit, so there is nothing to wait for.`,
				)

			if (!isFull(channel)) {
				waiting = undefined
				join(channel.id)
				return reply(ctx, `${name} has room, so you joined right away.`)
			}

			waiting = { channelId: channel.id, name }
			reply(
				ctx,
				`Waiting for a slot in ${name}. You'll join as soon as someone leaves.`,
			)
		},
		{ name: 'channel', description: 'The voice channel to wait for' },
	),
	makeCommand('stop-waiting', 'Stop waiting for a voice slot', (_args, ctx) => {
		const name = waiting?.name
		waiting = undefined
		reply(
			ctx,
			name
				? `Stopped waiting for ${name}.`
				: 'You are not waiting for a voice slot.',
		)
	}),
]

/** Appends our commands to Discord's built-in command list. */
function patchBuiltInCommands(exports: CommandsModule) {
	let idsAssigned = false

	return instead(exports, 'getBuiltInCommands', (args, orig) => {
		const result = orig.apply(exports, args)

		// Never touch results we do not understand.
		if (!Array.isArray(result)) return result

		// Give our commands ids below every other built-in/library command, once.
		// Discord always passes the command types as an array (same shape as its own callers).
		if (!idsAssigned) {
			idsAssigned = true
			try {
				const all = orig.apply(exports, [[COMMAND_TYPE_CHAT], true, false])
				const ids = Array.isArray(all)
					? all
							.map(command => Number.parseInt(command.id, 10))
							.filter(Number.isFinite)
					: []
				const lowest = Math.min(0, ...ids)
				commands.forEach((command, index) => {
					command.id = String(lowest - index - 1)
				})
			} catch {
				commands.forEach((command, index) => {
					command.id = String(-1000 - index)
				})
			}
		}

		const wanted = args[0]
		return result.concat(
			commands.filter(command =>
				Array.isArray(wanted)
					? wanted.includes(command.type)
					: command.type === wanted,
			) as never[],
		)
	})
}

export default plugin({
	start({ cleanup, logger, plugin: self }) {
		// Show the how-to notice when the plugin is turned on (not when Discord restarts with it already on).
		if (self.startedLate) {
			try {
				showNotice()
			} catch (error) {
				logger.warn('Could not show the activation notice', error)
			}
		}

		cleanup(
			getModules(withProps('getBuiltInCommands'), exports => {
				cleanup(patchBuiltInCommands(exports as CommandsModule))
			}),
			getModules(withProps('sendBotMessage'), exports => {
				messages = exports as MessagesModule
			}),
			getModules(withProps('selectVoiceChannel'), exports => {
				voiceActions = exports as VoiceActions
			}),
			getModules(withProps('isChannelFull'), exports => {
				channelUtils = exports as ChannelUtils
			}),
			getStore<ChannelStore>('ChannelStore', store => {
				channelStore = store
			}),
			getStore<unknown>('GuildStore', store => {
				guildStore = store
			}),
			getStore<SelectedChannelStore>('SelectedChannelStore', store => {
				selectedChannelStore = store
			}),
			getStore<VoiceStateStore>('VoiceStateStore', store => {
				voiceStateStore = store
				store.addChangeListener(onVoiceStateChange)
				cleanup(() => store.removeChangeListener(onVoiceStateChange))
			}),
			() => {
				waiting = undefined
				hideNotice()
			},
		)
	},
})
