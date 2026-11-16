import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ReactNative } from '@valenced/react'
import type { React } from '@valenced/react'

const NOTICE_KEY = 'wait-for-slot-notice'

function NoticeContent() {
	return (
		<ReactNative.View style={{ gap: 12 }}>
			<Design.Text variant="text-md/medium">
				Wait for Slot joins a full voice channel for you as soon as someone
				leaves and a slot opens.
			</Design.Text>
			<Design.Text variant="text-md/medium">
				/wait-for-slot: type the command and pick a voice channel. If the
				channel has room, you join right away. If it is full, the plugin keeps
				waiting and joins you the moment a slot opens.
			</Design.Text>
			<Design.Text variant="text-md/medium">
				/stop-waiting: cancels the wait. Waiting also stops when you join the
				channel yourself or when the channel is deleted.
			</Design.Text>
			<Design.Text variant="text-sm/medium">
				Only one channel is awaited at a time, and channels without a user limit
				have nothing to wait for.
			</Design.Text>
		</ReactNative.View>
	)
}

export function showNotice() {
	// Read lazily: the Design API cannot be touched before the init phase (plugins load earlier).
	// AlertActions is not part of the typed surface; it exists on some Discord builds.
	const AlertActions = (
		Design as unknown as {
			AlertActions?: React.ComponentType<{ children: React.ReactNode }>
		}
	).AlertActions

	const GotIt = (
		<Design.AlertActionButton
			text="Got it"
			variant="primary"
			onPress={() => AlertActionCreators.dismissAlert(NOTICE_KEY)}
		/>
	)

	AlertActionCreators.openAlert(
		NOTICE_KEY,
		<Design.AlertModal
			title="Wait for Slot"
			content={<NoticeContent />}
			actions={AlertActions ? <AlertActions>{GotIt}</AlertActions> : GotIt}
		/>,
		undefined,
		{ dismissable: true },
	)
}

export function hideNotice() {
	AlertActionCreators.dismissAlert(NOTICE_KEY)
}
