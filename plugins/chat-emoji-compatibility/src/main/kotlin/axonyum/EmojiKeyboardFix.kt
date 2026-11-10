package axonyum

import android.text.InputType
import android.view.inputmethod.EditorInfo
import android.widget.TextView
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge

/**
 * Discord's "sanitized input" workaround gives some fields an input type that has no class
 * (0x90, only the "visible password" variation). Keyboards then hide their emoji button.
 *
 * This returns a normal text type for those fields. Real password fields have the text class,
 * so they are never changed. Only what the keyboard is told changes, not the field itself.
 */
internal class EmojiKeyboardFix {
    // A framework method, so it works whatever Discord renames
    private val unhook: XC_MethodHook.Unhook = XposedBridge.hookMethod(
        TextView::class.java.getDeclaredMethod("onCreateInputConnection", EditorInfo::class.java),
        object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                val info = param.args[0] as? EditorInfo ?: return
                info.inputType = fixInputType(info.inputType)
            }
        },
    )

    fun dispose() = unhook.unhook()
}

/** Returns [type] unchanged unless it is the class-less "visible password" type. */
internal fun fixInputType(type: Int): Int {
    val noClass = type and InputType.TYPE_MASK_CLASS == InputType.TYPE_NULL
    val visiblePassword =
        type and InputType.TYPE_MASK_VARIATION == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD

    if (!noClass || !visiblePassword) return type

    // A normal text field. Keeps the old flags and still asks for no suggestions, like before
    return InputType.TYPE_CLASS_TEXT or
        (type and InputType.TYPE_MASK_FLAGS) or
        InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
}
