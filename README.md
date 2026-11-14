<div align="center">

# 🧩 Axonyum's Plugins

Plugins for [Valenced](https://valenced.app/), a client mod for the Discord mobile app.
Each one solves an everyday annoyance.

![Valenced](https://img.shields.io/badge/Valenced-plugins-5865F2?logo=discord&logoColor=white)
![Plugins](https://img.shields.io/badge/plugins-4-2ea44f)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Platform](https://img.shields.io/badge/platform-Android-3DDC84?logo=android&logoColor=white)

</div>

---

## 👋 Overview

This repository contains the plugins I create for Valenced. Each folder inside [`plugins/`](plugins) is one plugin, published automatically so it can be installed and updated from inside the app.

## 💡 Why this repository exists

The Discord mobile app has a few everyday friction points: a member list that keeps reordering, profile text that can't be copied, an emoji button that disappears in some fields, and a GIF picker that stops after the first page. Each plugin in this repository targets one of them.

## 🧩 Plugins

| | Plugin | Description | Type | Version |
|:-:|---|---|:-:|:-:|
| ❄️ | [**Freeze Member List**](https://github.com/ApollyxnHashed/Valenced-Plugins/tree/main/plugins/freeze-member-list) | Freezes the member list of the open server. | JavaScript | `1.0.1` |
| ✏️ | [**Selectable Profiles**](https://github.com/ApollyxnHashed/Valenced-Plugins/tree/main/plugins/selectable-profiles) | Lets you select and copy the display name, pronouns, status and bio on a profile. | JavaScript | `1.0.1` |
| 😀 | [**Chat Emoji Compatibility**](https://github.com/ApollyxnHashed/Valenced-Plugins/tree/main/plugins/chat-emoji-compatibility) | Restores the keyboard emoji button in fields where Discord hides it. | Kotlin | `1.0.2` |
| ♾️ | [**Infinite GIFs**](https://github.com/ApollyxnHashed/Valenced-Plugins/tree/main/plugins/infinite-gifs) | Keeps loading new GIFs as you scroll the GIF picker. | JavaScript | `1.0.0` |

## 📦 Installation

Requires the Valenced app.

1. Open **Settings > Valenced > Plugins**.
2. Open the settings gear next to the **Plugins** header and add this repository by URL:

   ```
   https://apollyxnhashed.github.io/Valenced-Plugins/index.json
   ```

3. Open **Browse Plugins** (the **+** button at the bottom of the Plugins page) and tap **Install** on the plugin you want.
4. Enable the plugin with its toggle in the plugin list. Newly installed plugins start disabled.

Some plugins may ask for an app reload to apply their changes. Their card shows a status icon when this is needed.

## 🗂️ Repository structure

```
Valenced-Plugins/
├── plugins/
│   ├── freeze-member-list/          ❄️  freezes the member list (JavaScript)
│   ├── selectable-profiles/         ✏️  text selection on profiles (JavaScript)
│   ├── chat-emoji-compatibility/    😀  emoji button in blocked fields (Kotlin)
│   └── infinite-gifs/               ♾️  endless scrolling in the GIF picker (JavaScript)
├── themes/                          🎨  themes (empty for now)
├── .github/                         ⚙️  workflows and publishing scripts
├── repo.config.json                 🧾  repository name and channels
└── LICENSE                          📜  GPL-3.0 license
```

## ⚠️ Disclaimer

Using Valenced violates Discord's Terms of Service, as any client modification does. Use it at your own risk. Discord has not been known to ban users solely for client modifications, but it can change its enforcement policy at any time. The Valenced team takes no responsibility for what happens to your account.

Plugins have full access to your Discord client, including your messages and your token. Install only plugins you trust, from sources you trust.

## 🤖 AI-assisted development

All plugins in this repository were created with the assistance of Claude, an AI model by Anthropic. In other words, they are vibe-coded. They are provided as-is, without warranty.

## 📜 License

Distributed under the GNU General Public License v3.0. See [LICENSE](LICENSE).

## 💬 Contact

- Discord: `axonyum`
- GitHub: [ApollyxnHashed](https://github.com/ApollyxnHashed)
- Questions about Valenced itself: [official Valenced community](https://discord.com/invite/dtBTQHYSx4)
