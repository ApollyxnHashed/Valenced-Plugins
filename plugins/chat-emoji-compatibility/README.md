<div align="center">

# 😀 Chat Emoji Compatibility

Restores the keyboard's emoji button in Discord fields that hide it.

![Valenced](https://img.shields.io/badge/Valenced-plugin-5865F2?logo=discord&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.2-2ea44f)
![Type](https://img.shields.io/badge/type-Kotlin-7F52FF?logo=kotlin&logoColor=white)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

</div>

---

## 💡 Why it exists

In some fields, such as the channel name editor, Discord tells the keyboard to use an input mode that has no class. As a result, the keyboard hides its emoji button, even though the keyboard supports emoji.

This plugin corrects only that input information. The field itself stays the same, and the keyboard treats it as a normal text field.

## 🔍 Before and after

| | Before | After |
|---|---|---|
| Input mode sent to the keyboard | Visible password, no class | Normal text, no suggestions |
| Emoji button | Hidden | Visible |
| Real password fields | Unchanged | Unchanged |

## ✨ Usage

No configuration is needed. Install and enable the plugin. It has no settings screen.

## 🧠 How it works

When a text field creates its connection to the keyboard, the plugin checks the input mode that will be sent. If it is the classless mode, the plugin replaces it with a normal text mode and keeps the other options of the field.

<details>
<summary><b>🔧 Technical details</b></summary>

- The hook is on `TextView.onCreateInputConnection`, a method of the Android framework. It runs after the original method, through Xposed.
- Only the `inputType` of the `EditorInfo` changes. The field, real password fields and the rest of the app are not modified.
- Because the target is an Android framework method, the hook does not depend on internal Discord names.
- The corrected mode is `0x90` (visible password without a text class). Real password fields have the text class, so they are never changed.
- Disabling the plugin removes the hook.
- Source: `src/main/kotlin/axonyum/ChatEmojiCompatibility.kt` (entry point) and `EmojiKeyboardFix.kt` (the fix).

</details>

## ⚠️ Limitations

- If the hook cannot be installed, Valenced shows the error when the plugin is enabled.
- The plugin covers only the classless input mode. Fields that hide the emoji button for other reasons are not affected.

## 🗂️ Project files

| File | Purpose |
|---|---|
| `manifest.json` | Plugin identity and the location of the native class |
| `ChatEmojiCompatibility.kt` | Entry point: installs the fix when the plugin is enabled and removes it when disabled |
| `EmojiKeyboardFix.kt` | The fix for the input mode |

## 🏷️ Plugin information

| Field | Value |
|---|---|
| ID | `axonyum.chat-emoji-compatibility` |
| Version | `1.0.2` |
| Type | Kotlin (native), via `dist.android` |
| Class | `axonyum.ChatEmojiCompatibility` |
| Dependencies | `valenced.api` (`>=1 <2`), `discord` (any version) |

---

<div align="center">

[⬅️ Back to repository](../../README.md)

</div>
