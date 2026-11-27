<div align="center">

# 🗂️ Folder Opacity

Choose how opaque your server folders are, up to the exact HEX color you picked, with matching folder icon colors.

![Valenced](https://img.shields.io/badge/Valenced-plugin-5865F2?logo=discord&logoColor=white)
![Version](https://img.shields.io/badge/version-1.0.2-2ea44f)
![Type](https://img.shields.io/badge/type-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

</div>

---

## 💡 Why it exists

Discord lets you give a server folder a custom HEX color, but it draws that color mostly transparent over the server list: 15% for an open folder and 40% for a closed one. The result looks darker and less saturated than the color you picked. Folder Opacity lets you decide how much of the color shows, all the way up to the exact HEX.

## ✨ Usage

Works with the folders you already have. Nothing to recreate or configure again.

In **Settings > Valenced > Plugins > Folder Opacity** you can change:

| Setting | Default | What it does |
|---|---|---|
| Expanded folder | `100%` | Opacity of an open folder's background. Discord uses 15%. |
| Collapsed folder | `100%` | Opacity of a closed folder's background. Discord uses 40%. |
| Folder icon | Automatic | Color of the icon at the top of an open folder (see below). |
| Color shift | `30%` | How far the icon moves toward white or black, for the lighter and darker modes. |

Each slider has a button to go back to Discord's own value.

**Folder icon modes**

| Mode | What it does |
|---|---|
| Automatic (black or white) | Keeps Discord's icon color while it stands out. When the folder color would blend into its background, it picks black or white. At or below Discord's own opacity, it always keeps Discord's icon. |
| Discord's default | The icon uses the same color as the folder. |
| Lighter than the folder | Always a bit lighter than the folder color. |
| Darker than the folder | Always a bit darker than the folder color. |

**Live preview**

At the top of the settings there is a sample server folder that looks like the real one in Discord's server list: closed, it shows four mini icons; open, it shows three servers. Tap it to open or close it. It follows the sliders and the icon mode while you change them, before anything is saved.

**Folder Color**

The preview starts with the color of the first folder in your server list (servers outside folders are ignored). If you have no folder, it uses Discord's default color. Tap the *Folder Color* row to pick another color with Discord's own color picker. That color is only for the preview: it is not saved and never changes your real folders.

> ℹ️ Turning the plugin on or off, or changing any setting, needs a Discord restart to take effect. The plugin asks for it.

## 🧠 How it works

Discord multiplies the folder color's opacity by two design tokens, `GUILD_FOLDER_COLOR_OPACITY` (open) and `GUILD_FOLDER_PREVIEW_OPACITY` (closed). The plugin makes both return your chosen value, so at 100% Discord draws the exact HEX.

The folder icon is tinted with the folder color itself, which only stood out while the background was mostly transparent. The plugin gives that icon one color of its own, based on the mode you picked.

<details>
<summary><b>🔧 Technical details</b></summary>

- Opacity: the `resolve` function of both tokens in `Tokens.default.modules.mobile` is replaced. Folders read them through `useToken` on every render, so the new values apply as soon as they render again after a restart.
- Icon: a `beforeJSX` patch on `FastImage` swaps the tint of the folder icon only. It is recognized by its asset (`FolderIcon`) and by a string `tintColor`. Every other image returns right away.
- Automatic mode mixes the folder color over the server list color (`BACKGROUND_BASE_LOWEST`, resolved for the active theme) at your opacity, and compares contrast with what Discord shows at 15%. Black and white come from Discord's raw colors, so no color is hardcoded.
- Preview: a simulated folder built with Discord's own measures, read with `useToken`, and the same springs as the real folder. It uses the same `iconTintFor` as the real folders. The sliders feed it through local state, so dragging never saves anything.
- First folder color: read from `SortedGuildStore.getGuildFolders()` once when the settings open, taking the first entry that is a real folder.
- Color picker: opens Discord's native color sheet. If it can't be found, a simpler built-in sheet (palette, HEX, RGB sliders) is used instead.
- Turning the plugin off removes every patch.

</details>

## ⚠️ Limitations

- **A restart is required** when you turn the plugin on or off or change a setting, because folders keep what they already rendered.
- **Automatic icon color depends on the server list color.** If that color can't be resolved, the plugin assumes a dark background, which can choose the wrong icon color on a light theme.
- **Major updates may require a plugin update.** The plugin depends on internal Discord parts (the two folder opacity tokens, `FastImage` and the `FolderIcon` asset).

## 🗂️ Project files

| File | Purpose |
|---|---|
| `manifest.json` | Plugin identity: ID, version, author and dependencies |
| `js/index.ts` | Plugin entry: opacity tokens and folder icon patch |
| `js/color.ts` | Icon color choice (contrast, lighter and darker modes) |
| `js/shared.ts` | Settings type, defaults and validation |
| `js/settings.tsx` | The plugin's settings screen |
| `js/preview.tsx` | The interactive folder preview |
| `js/colorPicker.tsx` | Opens Discord's color picker (with a built-in fallback) |
| `js/folders.ts` | Finds the color of the first folder in the server list |
| `js/slider.ts` | Slider props shared by the settings and the fallback picker |
| `js/tokens.ts` | Discord tokens and theme colors shared by the patch and the preview |
| `tsconfig.json` | Type-checking configuration |

## 🏷️ Plugin information

| Field | Value |
|---|---|
| ID | `axonyum.folder-opacity` |
| Version | `1.0.2` |
| Type | JavaScript |
| Dependencies | `valenced.api` (`>=1 <2`), `discord` (any version) |

---

<div align="center">

[⬅️ Back to repository](https://github.com/ApollyxnHashed/Valenced-Plugins)

</div>
