@file:JvmName("ChatEmojiDiagnostic")

package io.github.apollyxnhashed.chatemojidiagnostic

import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod

@Suppress("UNUSED")
val chatEmojiDiagnostic = plugin {
    var probe: InputProbe? = null

    start {
        val prefix = "axonyum.chat-emoji-diagnostic"
        val created = InputProbe().also { it.install() }
        probe = created
        log.i("Chat Emoji Diagnostic: keyboard hook installed = ${created.installed}")

        registerNativeMethod("$prefix.getReport") {
            probe?.report() ?: "{}"
        }

        registerNativeMethod("$prefix.clear") {
            probe?.clear()
            null
        }

        registerNativeMethod("$prefix.setExperiment") { args ->
            probe?.experiment = args[0] as Boolean
            null
        }
    }

    stop {
        probe?.dispose()
        probe = null
    }
}
