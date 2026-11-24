import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useState } from 'react'
import { Image, Text } from 'react-native'
import type { ImageStyle, StyleProp } from 'react-native'

/** Discord's own emoji helper: on Android it points to the emoji images shipped inside the app. */
interface EmojiUtils {
	getURL(surrogate: string): string | undefined
	applyPlatformToThemedEmojiColorPalette: unknown
}

/** With and without the emoji variation selector, since the image name depends on the form Discord uses. */
const SNOWFLAKES = ['❄️', '❄']

let sources: string[] | undefined

/** The snowflake image addresses from Discord, found once and then reused. */
function getSources() {
	if (sources) return sources

	const [EmojiUtils] = lookupModule(
		withProps<EmojiUtils>('getURL', 'applyPlatformToThemedEmojiColorPalette'),
	)
	if (!EmojiUtils) return []

	const uris = SNOWFLAKES.map(emoji => EmojiUtils.getURL(emoji)).filter(
		(uri): uri is string => Boolean(uri),
	)
	sources = [...new Set(uris)]
	return sources
}

interface Props {
	size: number
	style?: StyleProp<ImageStyle>
}

/**
 * The :snowflake: emoji drawn from the image Discord already has, so the plugin carries no image.
 * If an image can't be loaded it tries the next one, and ends on the system emoji.
 */
export function SnowflakeIcon({ size, style }: Props) {
	const [failed, setFailed] = useState(0)
	const uri = getSources()[failed]

	if (!uri)
		return <Text style={{ fontSize: size * 0.85 }}>{SNOWFLAKES[0]}</Text>

	return (
		<Image
			source={{ uri }}
			resizeMode="contain"
			style={[{ width: size, height: size }, style]}
			onError={() => setFailed(failed + 1)}
		/>
	)
}
