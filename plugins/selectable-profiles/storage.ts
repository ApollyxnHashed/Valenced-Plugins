import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { FieldKey, Settings } from './shared'

let storage: JsonStorage<Settings>

export function setStorage(jsonStorage: JsonStorage<Settings>) {
	storage = jsonStorage
}

export const isEnabled = (field: FieldKey) =>
	storage?.cache?.[field] ?? DefaultSettings[field]
