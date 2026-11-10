<div align="center">

# ✏️ Selectable Profiles

Long-press profile text to select and copy it: display name, pronouns, custom status and bio.

![Valenced](https://img.shields.io/badge/Valenced-plugin-5865F2?logo=discord&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.0-2ea44f)
![Type](https://img.shields.io/badge/type-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

</div>

---

## 💡 Why it exists

In the Discord mobile app, profile text can't be selected. Copying a pronoun, a status or a bio means retyping it. This plugin makes those texts selectable.

## ✨ Usage

1. Open a user's profile.
2. Long-press the text you want to copy.
3. Adjust the selection and use the copy option in the menu that appears.

| Field | When it is selectable |
|---|---|
| Display name | While the profile is open |
| Pronouns | While the profile is open |
| Custom status | While the profile is open |
| Bio | Whenever the bio is shown |

If you enable the plugin while the app is already open, Discord asks you to restart once.

## ⚙️ Settings

Each field has its own switch, labeled as in the app: **Display name**, **Pronouns**, **Custom status** and **Bio**. Changes apply the next time you open a profile.

## 🧠 How it works

Discord does not expose a stable component for the display name, pronouns and status. The plugin therefore learns these values whenever a profile is read. When text on screen matches one of those values and the profile is open, that text becomes selectable. The bio is handled separately, in the component that displays it.

<details>
<summary><b>🔧 Technical details</b></summary>

- Values read for each user are kept for up to 30 minutes after the last read.
- An open profile is detected through an anchor line (username and pronouns) that exists only inside the profile.
- The bio uses a patch on the `BioText` component, based on the same technique as the community plugin "Selectable Bios".
- Display name, pronouns and status use a patch on `UserProfileStore` (`getUserProfile` and `getGuildMemberProfile`) and `insteadJSX` on `Text` components.
- Disabling the plugin clears the stored values and removes the patches.

</details>

## ⚠️ Limitations

- The plugin matches text by content. Text that differs a lot from the values read from the profile may not become selectable.
- The plugin depends on internal Discord components (`BioText` and `UserProfileStore`). A major app update may require a plugin update.

## 🗂️ Project files

| File | Purpose |
|---|---|
| `manifest.json` | Plugin identity: ID, version, author and dependencies |
| `index.tsx` | Entry point: lifecycle, and hooking everything together |
| `bio.ts` | Bio patch (`BioText` component) |
| `profiles.ts` | Learns which users have a profile on screen and their display name, pronouns and status |
| `matching.ts` | Matches text on screen against those values |
| `gate.tsx` | Makes matching text selectable while the profile is open, and detects when it closes |
| `storage.ts` | Access to the saved settings |
| `shared.ts` | Types, default values and labels for the settings |
| `settings.tsx` | Settings screen with the four switches |
| `tsconfig.json` | Type-checking configuration |

## 🏷️ Plugin information

| Field | Value |
|---|---|
| ID | `axonyum.selectable-profiles` |
| Version | `1.0.0` |
| Type | JavaScript |
| Dependencies | `valenced.api` (`>=1 <2`), `discord` (any version) |

## 🙏 Credits

- The bio technique is based on the community plugin **Selectable Bios**.

---

<div align="center">

[⬅️ Back to repository](../../README.md)

</div>
