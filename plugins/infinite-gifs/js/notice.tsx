import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import type { ReactNode } from 'react'

const ALERT_KEY = 'infinite-gif-scroll-notice'

/** GIF Providers authors, from its manifest (author + contributors). */
const GIF_PROVIDERS_CREDITS = 'Palm, Livie and Benjii'

function NoticeBody() {
	return (
		<View style={{ gap: 12 }}>
			<Design.Text variant="text-md/medium">
				This plugin works best together with the GIF Providers plugin. With it
				enabled, the GIF picker keeps loading new results from Tenor and Giphy
				for as long as you scroll.
			</Design.Text>
			<Design.Text variant="text-md/medium">
				Without GIF Providers only Discord's built-in Klipy search is used, and
				Discord's server returns at most 100 GIFs per search. The list will grow
				from 50 to 100 GIFs and then stop.
			</Design.Text>
			<Design.Text variant="text-sm/medium">
				GIF Providers is made by {GIF_PROVIDERS_CREDITS}. Thank you for making
				multi-provider GIF search possible.
			</Design.Text>
		</View>
	)
}

/** Opens the closable first-run notice. */
export function openNotice() {
	// AlertActions wraps the buttons in Discord's own alerts; it is not typed, so fall back to the bare button.
	const AlertActions = (Design as unknown as Record<string, unknown>)
		.AlertActions as ((props: { children: ReactNode }) => ReactNode) | undefined
	const button = (
		<Design.AlertActionButton
			text="Got it"
			variant="primary"
			onPress={() => AlertActionCreators.dismissAlert(ALERT_KEY)}
		/>
	)
	AlertActionCreators.openAlert(
		ALERT_KEY,
		<Design.AlertModal
			title="Infinite GIFs"
			content={<NoticeBody />}
			actions={AlertActions ? <AlertActions>{button}</AlertActions> : button}
		/>,
		undefined,
		{ dismissable: true },
	)
}

export function closeNotice() {
	AlertActionCreators.dismissAlert(ALERT_KEY)
}
