import { getStore, onFluxEventDispatched } from '@valenced/discord/flux'
import { getJsonStorage, pluginStoragePathFor } from '@valenced/json-storage'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import {
	cloneElement,
	isValidElement,
	useMemo,
	useSyncExternalStore,
} from 'react'
import { closeNotice, openNotice } from './notice'
import { PaginationController } from './pagination/controller'
import { createAdapterFactory } from './providers/factory'
import {
	GIF_PROVIDERS_ID,
	readGifProvidersSettings,
} from './providers/settings'
import { fetchJson } from './providers/shared'
import type { ReactElement, ReactNode } from 'react'
import type { Gif } from './pagination/types'

/** Start loading when the user is within this many screens of the end. */
const END_THRESHOLD = 1.5
/** Patcher priority: lowest, so any other plugin's patch on the same component wraps ours. */
const LOWEST_PRIORITY = -1000

interface QuerySuccess {
	query?: string
	items?: Gif[]
}

interface PickerItem {
	id?: string
	src?: string
	format?: unknown
	[key: string]: unknown
}

interface ResultsListProps {
	resultItems?: ReadonlyArray<PickerItem>
	loading?: boolean
}

type GetFn = (options: never) => Promise<{ body: unknown }>
interface HttpModule {
	HTTP: { get: GetFn; post: GetFn }
	get: GetFn
	post: unknown
	put: unknown
	patch: unknown
	del: unknown
}
type ListFn = (props: ResultsListProps) => ReactNode

// Extra GIFs live here, outside Discord's store: the store's own success handler would
// not take a second GIF_PICKER_QUERY_SUCCESS for the same query (verified on device).
let version = 0
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
function bump() {
	version++
	for (const listener of listeners) listener()
}

const VIDEO = /\.(mp4|webm)(\?|$)/i

/** Maps a normalized GIF to the object shape `GIFPickerViewStore.getResultItems()` produces. */
function toPickerItem(gif: Gif, image: unknown, video: unknown): PickerItem {
	return {
		width: gif.width,
		height: gif.height,
		src: gif.src,
		gifSrc: gif.gif_src,
		url: gif.url,
		id: gif.id,
		format: VIDEO.test(gif.src) ? video : image,
	}
}

function formatsOf(base: ReadonlyArray<PickerItem>): {
	image: unknown
	video: unknown
} {
	let image: unknown
	let video: unknown
	for (const item of base) {
		if (typeof item.src !== 'string') continue
		if (VIDEO.test(item.src)) video ??= item.format
		else image ??= item.format
		if (image !== undefined && video !== undefined) break
	}
	return { image, video: video ?? image }
}

export default plugin({
	start({ cleanup, logger, plugin }) {
		let stopped = false
		let locale = 'en-US'
		let mediaFormat = 'tinywebp'
		let discordGet: GetFn | undefined

		const controller = new PaginationController({
			factory: createAdapterFactory({
				fetchJson,
				get: options =>
					discordGet
						? discordGet(options as never)
						: Promise.reject(new Error('HTTP module not available')),
				getMediaFormat: () => mediaFormat,
				readGifProvidersSettings: () =>
					readGifProvidersSettings(() =>
						getJsonStorage(
							pluginStoragePathFor(GIF_PROVIDERS_ID, 'storage.json'),
						),
					),
			}),
			getLocale: () => locale,
			publish() {
				if (!stopped) bump()
			},
			log: { warn: (message, ...rest) => logger.warn(message, ...rest) },
		})
		cleanup(() => {
			stopped = true
			controller.reset()
			bump()
			closeNotice()
		})

		// Shown every time the user turns the plugin on. `startedLate` is only true when the plugin
		// is enabled while Discord is running; when Discord itself restarts the plugin starts
		// during boot (`startedLate` false), so a restart never brings the notice back.
		if (plugin.startedLate) {
			try {
				openNotice()
			} catch (error) {
				logger.warn('Could not show the activation notice', error as unknown)
			}
		}

		cleanup(
			getStore<{ locale?: string }>('LocaleStore', store => {
				if (typeof store.locale === 'string') locale = store.locale
			}),
		)
		cleanup(
			getStore<{ getSelectedFormat(): string }>('GIFPickerViewStore', store => {
				mediaFormat = store.getSelectedFormat()
			}),
		)
		// Same lookup GIF Providers uses; `module.get` is the client's own request function,
		// which is not the `module.HTTP.get` that GIF Providers patches.
		cleanup(
			getModules(
				withProps<HttpModule>('HTTP', 'get', 'post', 'put', 'patch', 'del'),
				module => {
					if (typeof module.get === 'function')
						discordGet = module.get.bind(module)
				},
			),
		)

		// The picker's first page of a search or of trending GIFs starts a pagination session.
		cleanup(
			onFluxEventDispatched<QuerySuccess>(
				'GIF_PICKER_QUERY_SUCCESS',
				payload => {
					if (stopped || !Array.isArray(payload.items)) return payload
					const query = typeof payload.query === 'string' ? payload.query : ''
					controller.begin({
						kind: query ? 'search' : 'trending',
						query,
						items: payload.items,
					})
					return payload
				},
			),
		)
		// A new query, a reset or a re-initialised picker ends the current session.
		for (const type of [
			'GIF_PICKER_QUERY',
			'GIF_PICKER_INITIALIZE',
			'GIF_PICKER_QUERY_FAILURE',
		] as const)
			cleanup(
				onFluxEventDispatched(type, payload => {
					controller.reset()
					bump()
					return payload
				}),
			)

		cleanup(
			getModules(
				withName<ListFn>('GIFPickerResultsList'),
				target => {
					if (stopped) return
					try {
						cleanup(
							instead(
								target as unknown as { default: ListFn },
								'default',
								function (args, original) {
									// Hook runs on every render of the list, always in the same order.
									const current = useSyncExternalStore(subscribe, () => version)
									const props = args[0] as ResultsListProps
									const owned =
										!stopped &&
										!props.loading &&
										controller.owns(props.resultItems)
									const extras = useMemo(
										() => (owned ? controller.extras() : []),
										[owned, current],
									)
									let callArgs = args
									if (owned && extras.length > 0 && props.resultItems) {
										const { image, video } = formatsOf(props.resultItems)
										callArgs = [
											{
												...props,
												resultItems: props.resultItems.concat(
													extras.map(gif => toPickerItem(gif, image, video)),
												),
											},
										]
									}
									const result = Reflect.apply(original, this, callArgs)
									if (!owned || !isValidElement(result)) return result
									const element = result as ReactElement<{
										onEndReached?: () => void
										onEndReachedThreshold?: number
									}>
									const previous = element.props.onEndReached
									return cloneElement(element, {
										onEndReached: () => {
											previous?.()
											void controller.loadMore()
										},
										onEndReachedThreshold: END_THRESHOLD,
									})
								},
								{ priority: LOWEST_PRIORITY },
							),
						)
					} catch (error) {
						plugin.reportError(error)
					}
				},
				{ returnNamespace: true },
			),
		)
	},
})
