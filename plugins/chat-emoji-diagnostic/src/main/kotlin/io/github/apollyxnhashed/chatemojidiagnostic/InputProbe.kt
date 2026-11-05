package io.github.apollyxnhashed.chatemojidiagnostic

import android.os.Build
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.TextView
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import org.json.JSONArray
import org.json.JSONObject

private const val MAX_ENTRIES = 60

// EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING (API 26), written out so older compile targets still work
private const val IME_FLAG_NO_PERSONALIZED_LEARNING = 0x1000000

/**
 * Watches every text field that opens the keyboard and records what it asks the keyboard for.
 * It never reads the text inside a field.
 */
internal class InputProbe {
    // Experiment: ask the keyboard for a normal text field instead of a "visible password" one
    @Volatile
    var experiment = false

    @Volatile
    var installed = false
        private set

    private val lock = Any()
    private val entries = LinkedHashMap<String, Entry>()

    private var unhook: XC_MethodHook.Unhook? = null

    @Volatile
    private var installError: String? = null

    @Volatile
    private var lastError: String? = null

    @Volatile
    private var lastIme: String? = null

    private class Entry(
        val className: String,
        val hierarchy: String,
        val chain: String,
        val inputType: Int,
        val imeOptions: Int,
        val privateImeOptions: String?,
        val hint: String?,
        val description: String?,
        val tag: String?,
        val firstMs: Long,
    ) {
        var lastMs = firstMs
        var count = 1
        var patched = false
        var patchedInputType = 0
    }

    fun install() {
        try {
            // A framework method, so it works whatever Discord renames
            val method = TextView::class.java.getDeclaredMethod(
                "onCreateInputConnection",
                EditorInfo::class.java,
            )

            unhook = XposedBridge.hookMethod(method, object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    try {
                        onKeyboardRequested(param.thisObject as? TextView, param.args[0] as? EditorInfo)
                    } catch (t: Throwable) {
                        lastError = t.toString()
                    }
                }
            })

            installed = true
        } catch (t: Throwable) {
            installError = t.toString()
        }
    }

    fun dispose() {
        unhook?.unhook()
        unhook = null
        installed = false
        clear()
    }

    fun clear() = synchronized(lock) { entries.clear() }

    private fun onKeyboardRequested(view: TextView?, info: EditorInfo?) {
        if (view == null || info == null) return

        val now = System.currentTimeMillis()
        val inputType = info.inputType
        val imeOptions = info.imeOptions
        val hint = view.hint?.toString()?.take(60)
        val privateIme = info.privateImeOptions

        lastIme = runCatching {
            Settings.Secure.getString(view.context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
        }.getOrNull()

        val key = "${view.javaClass.name}|$inputType|$imeOptions|$privateIme|$hint"

        // Null once the list is full, the experiment still applies
        val entry = synchronized(lock) {
            val existing = entries[key]

            if (existing != null) {
                existing.count++
                existing.lastMs = now
                existing
            } else if (entries.size >= MAX_ENTRIES) {
                null
            } else {
                Entry(
                    className = view.javaClass.name,
                    hierarchy = hierarchyOf(view),
                    chain = parentsOf(view),
                    inputType = inputType,
                    imeOptions = imeOptions,
                    privateImeOptions = privateIme,
                    hint = hint,
                    description = view.contentDescription?.toString()?.take(60),
                    tag = view.tag?.toString()?.take(40),
                    firstMs = now,
                ).also { entries[key] = it }
            }
        }

        if (experiment) applyExperiment(info, entry)
    }

    private fun applyExperiment(info: EditorInfo, entry: Entry?) {
        val type = info.inputType
        val isText = type and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_TEXT
        val variation = type and InputType.TYPE_MASK_VARIATION

        // Only the "visible password" type. Real password fields stay untouched.
        if (isText && variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD) {
            info.inputType = (type and InputType.TYPE_MASK_VARIATION.inv()) or InputType.TYPE_TEXT_VARIATION_NORMAL
            synchronized(lock) {
                entry?.patched = true
                entry?.patchedInputType = info.inputType
            }
        }

        // Asks the keyboard for plain ASCII, which hides emoji
        if (info.imeOptions and EditorInfo.IME_FLAG_FORCE_ASCII != 0) {
            info.imeOptions = info.imeOptions and EditorInfo.IME_FLAG_FORCE_ASCII.inv()
            synchronized(lock) { entry?.patched = true }
        }
    }

    fun report(): String {
        val root = JSONObject()

        root.put(
            "device",
            JSONObject()
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL)
                .put("sdk", Build.VERSION.SDK_INT)
                .put("release", Build.VERSION.RELEASE)
                .put("ime", lastIme ?: JSONObject.NULL),
        )
        root.put("hookInstalled", installed)
        root.put("installError", installError ?: JSONObject.NULL)
        root.put("lastError", lastError ?: JSONObject.NULL)
        root.put("experiment", experiment)

        val list = JSONArray()
        synchronized(lock) {
            for (e in entries.values) {
                list.put(
                    JSONObject()
                        .put("className", e.className)
                        .put("hierarchy", e.hierarchy)
                        .put("chain", e.chain)
                        .put("inputType", describeInputType(e.inputType))
                        .put("imeOptions", describeImeOptions(e.imeOptions))
                        .put("privateImeOptions", e.privateImeOptions ?: JSONObject.NULL)
                        .put("hint", e.hint ?: JSONObject.NULL)
                        .put("description", e.description ?: JSONObject.NULL)
                        .put("tag", e.tag ?: JSONObject.NULL)
                        .put("firstMs", e.firstMs)
                        .put("lastMs", e.lastMs)
                        .put("count", e.count)
                        .put("patched", e.patched)
                        .put(
                            "patchedInputType",
                            if (e.patched && e.patchedInputType != 0) describeInputType(e.patchedInputType) else JSONObject.NULL,
                        ),
                )
            }
        }
        root.put("entries", list)

        return root.toString()
    }

    // The view's class and its parents up to TextView, so a renamed class is still recognizable
    private fun hierarchyOf(view: View): String {
        val names = ArrayList<String>()
        var type: Class<*>? = view.javaClass

        while (type != null && type != TextView::class.java && names.size < 8) {
            names.add(type.name)
            type = type.superclass
        }

        return names.joinToString(" > ")
    }

    // The views around the field, closest first
    private fun parentsOf(view: View): String {
        val names = ArrayList<String>()
        var parent = view.parent

        while (parent != null && names.size < 8) {
            names.add(parent.javaClass.simpleName.ifEmpty { parent.javaClass.name })
            parent = parent.parent
        }

        return names.joinToString(" < ")
    }

    private fun hex(value: Int) = "0x" + Integer.toHexString(value).padStart(8, '0')

    private fun describeInputType(type: Int): String {
        val inputClass = type and InputType.TYPE_MASK_CLASS
        val variation = type and InputType.TYPE_MASK_VARIATION

        val className = when (inputClass) {
            InputType.TYPE_NULL -> "NONE"
            InputType.TYPE_CLASS_TEXT -> "TEXT"
            InputType.TYPE_CLASS_NUMBER -> "NUMBER"
            InputType.TYPE_CLASS_PHONE -> "PHONE"
            InputType.TYPE_CLASS_DATETIME -> "DATETIME"
            else -> "OTHER"
        }

        val variationName = if (inputClass == InputType.TYPE_CLASS_TEXT) {
            when (variation) {
                InputType.TYPE_TEXT_VARIATION_NORMAL -> "NORMAL"
                InputType.TYPE_TEXT_VARIATION_URI -> "URI"
                InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS -> "EMAIL_ADDRESS"
                InputType.TYPE_TEXT_VARIATION_EMAIL_SUBJECT -> "EMAIL_SUBJECT"
                InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE -> "SHORT_MESSAGE"
                InputType.TYPE_TEXT_VARIATION_LONG_MESSAGE -> "LONG_MESSAGE"
                InputType.TYPE_TEXT_VARIATION_PERSON_NAME -> "PERSON_NAME"
                InputType.TYPE_TEXT_VARIATION_POSTAL_ADDRESS -> "POSTAL_ADDRESS"
                InputType.TYPE_TEXT_VARIATION_PASSWORD -> "PASSWORD"
                InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD -> "VISIBLE_PASSWORD"
                InputType.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT -> "WEB_EDIT_TEXT"
                InputType.TYPE_TEXT_VARIATION_FILTER -> "FILTER"
                InputType.TYPE_TEXT_VARIATION_PHONETIC -> "PHONETIC"
                InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS -> "WEB_EMAIL_ADDRESS"
                InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD -> "WEB_PASSWORD"
                else -> hex(variation)
            }
        } else {
            hex(variation)
        }

        val flags = listOf(
            InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS to "CAP_CHARACTERS",
            InputType.TYPE_TEXT_FLAG_CAP_WORDS to "CAP_WORDS",
            InputType.TYPE_TEXT_FLAG_CAP_SENTENCES to "CAP_SENTENCES",
            InputType.TYPE_TEXT_FLAG_AUTO_CORRECT to "AUTO_CORRECT",
            InputType.TYPE_TEXT_FLAG_AUTO_COMPLETE to "AUTO_COMPLETE",
            InputType.TYPE_TEXT_FLAG_MULTI_LINE to "MULTI_LINE",
            InputType.TYPE_TEXT_FLAG_IME_MULTI_LINE to "IME_MULTI_LINE",
            InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS to "NO_SUGGESTIONS",
        ).filter { type and it.first != 0 }.joinToString("|") { it.second }

        return "${hex(type)} [class=$className, variation=$variationName, flags=${flags.ifEmpty { "none" }}]"
    }

    private fun describeImeOptions(options: Int): String {
        val action = when (options and EditorInfo.IME_MASK_ACTION) {
            EditorInfo.IME_ACTION_UNSPECIFIED -> "UNSPECIFIED"
            EditorInfo.IME_ACTION_NONE -> "NONE"
            EditorInfo.IME_ACTION_GO -> "GO"
            EditorInfo.IME_ACTION_SEARCH -> "SEARCH"
            EditorInfo.IME_ACTION_SEND -> "SEND"
            EditorInfo.IME_ACTION_NEXT -> "NEXT"
            EditorInfo.IME_ACTION_DONE -> "DONE"
            EditorInfo.IME_ACTION_PREVIOUS -> "PREVIOUS"
            else -> hex(options and EditorInfo.IME_MASK_ACTION)
        }

        val flags = listOf(
            EditorInfo.IME_FLAG_NO_FULLSCREEN to "NO_FULLSCREEN",
            EditorInfo.IME_FLAG_NAVIGATE_NEXT to "NAVIGATE_NEXT",
            EditorInfo.IME_FLAG_NAVIGATE_PREVIOUS to "NAVIGATE_PREVIOUS",
            EditorInfo.IME_FLAG_NO_EXTRACT_UI to "NO_EXTRACT_UI",
            EditorInfo.IME_FLAG_NO_ACCESSORY_ACTION to "NO_ACCESSORY_ACTION",
            EditorInfo.IME_FLAG_NO_ENTER_ACTION to "NO_ENTER_ACTION",
            EditorInfo.IME_FLAG_FORCE_ASCII to "FORCE_ASCII",
            IME_FLAG_NO_PERSONALIZED_LEARNING to "NO_PERSONALIZED_LEARNING",
        ).filter { options and it.first != 0 }.joinToString("|") { it.second }

        return "${hex(options)} [action=$action, flags=${flags.ifEmpty { "none" }}]"
    }
}
