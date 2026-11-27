import { Stores } from '@valenced/discord/flux'
import { intToHex } from './color'

// ../discord_app/stores/SortedGuildStore.tsx
// Servers outside a folder are in this list too, as a folder of one server without an id
// and without the `expanded` flag.
interface GuildFolder {
	folderId?: unknown
	folderColor?: unknown
	expanded?: unknown
}

interface SortedGuildStore {
	getGuildFolders(): GuildFolder[]
}

/**
 * Color of the first folder in the server list, in the order Discord draws it, as a HEX.
 * `undefined` when there's no folder, or the first one has no custom color.
 */
export function firstFolderColor() {
	try {
		const store = Stores.SortedGuildStore as unknown as SortedGuildStore
		const folder = store
			.getGuildFolders()
			.find(
				({ folderId, expanded }) =>
					folderId != null && typeof expanded === 'boolean',
			)
		const color = folder?.folderColor
		return typeof color === 'number' &&
			Number.isInteger(color) &&
			color >= 0 &&
			color <= 0xffffff
			? intToHex(color)
			: undefined
	} catch {
		// Store unavailable: the preview just starts from Discord's default color
		return undefined
	}
}
