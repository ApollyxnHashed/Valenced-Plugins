@file:JvmName("ChatEmojiCompatibility")

package axonyum

import app.valenced.plugins.plugin

@Suppress("UNUSED")
val chatEmojiCompatibility = plugin {
    var fix: EmojiKeyboardFix? = null

    start {
        // If the hook cannot be installed this throws, so Valenced shows the error
        fix = EmojiKeyboardFix()
        log.i("Chat Emoji Compatibility: keyboard hook installed")
    }

    stop {
        fix?.dispose()
        fix = null
    }
}
