[한국어](README.md) | **English**

<div align="center">
<img src="../src-tauri/icons/icon.ico" alt="DM Note Logo" width="120" height="120">

<h1>DM Note</h1>
  
  <p>
    <strong>Open-source key viewer for rhythm games</strong>
  </p>
  <p>
    <strong>Custom key mapping and styling, quick preset switching, and a clean, intuitive UI</strong>
  </p>
  
[![GitHub release](https://img.shields.io/github/release/lee-sihun/DmNote.svg?logo=github)](https://github.com/lee-sihun/DmNote/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/lee-sihun/DmNote/total.svg?logo=github)](https://github.com/lee-sihun/DmNote/releases/download/1.2.1/DM.NOTE.v.1.2.1.zip)
[![GitHub license](https://img.shields.io/github/license/lee-sihun/DmNote.svg?logo=github)](https://github.com/lee-sihun/DmNote/blob/master/LICENSE)
</div>

https://github.com/user-attachments/assets/20fb118d-3982-4925-9004-9ce0936590c2

## 🌟 Overview

**DM Note** is a key viewer built for DJMAX RESPECT V. Built with Electron and React, powered by [node-global-key-listener-extended](https://github.com/lee-sihun/node-global-key-listener) for global keyboard hooks.
Set it up in minutes and visualize your keystrokes for streams or gameplay captures. Windows only for now, and it works with non-rhythm games too

[Download DM NOTE v1.2.1](https://github.com/lee-sihun/DmNote/releases/download/1.2.1/DM.NOTE.v.1.2.1.zip)

## ✨ Features

### ⌨️ Keyboard input and mapping

- Detect and visualize keyboard input in real time
- Configure custom key mappings

### 🎨 Key style customization

- Resize keys and add or remove keys
- Grid-based key layout
- Assign images to keys
- Support for custom CSS

### 💾 Presets and settings management

- Auto-save user settings
- Save and load presets

### 🖼️ Overlay and window management

- Lock window position
- Keep window always on top
- Choose a resize anchor

### 🌧️ Raining Note effect customization

- Adjust color, opacity, rounding, speed, and height
- Reverse direction

### ⚙️ Graphics and settings

- Multilingual support (Korean, English)
- Graphics rendering options (Direct3D 11/9, OpenGL)
- Reset to defaults

## 🚀 Development

### Tech stack

- **Frontend**: React 19 + TypeScript + Vite 7
- **Backend**: Electron
- **Styling**: Tailwind CSS 3
- **Keyboard hooking**: [node-global-key-listener-extended](https://github.com/lee-sihun/node-global-key-listener)
- **Package manager**: npm

### Project structure

```
DmNote/
├── src/                          # Source code
│   ├── main/                     # Electron main process
│   │   ├── app/                  # Application bootstrap
│   │   ├── core/                 # ipcRouter, windowRegistry
│   │   ├── domains/              # Domain routing (app, settings, keys, overlay, css, preset, system)
│   │   │   ├── keys/             # Default key mappings
│   │   │   └── positions/        # Default key positions
│   │   ├── services/             # Services (keyboard listener, etc.)
│   │   ├── store/                # electron-store + Zod schema
│   │   ├── windows/              # BrowserWindow wrapper + config
│   │   ├── preload.ts            # Expose contextBridge API (dmn)
│   │   └── main.ts               # Main entry point
│   ├── renderer/                 # React renderer
│   │   ├── components/           # UI components
│   │   ├── hooks/                # State/sync hooks
│   │   ├── stores/               # Zustand stores
│   │   ├── windows/              # Renderer windows (main/overlay)
│   │   ├── styles/               # Global/common styles
│   │   └── assets/               # Static assets
│   └── types/                    # Shared types/schemas
├── package.json                  # Project dependencies and scripts
├── tsconfig.json                 # TypeScript (renderer/shared) config
├── tsconfig.main.json            # TypeScript (main) config
├── vite.config.ts                # Vite (renderer) config
└── dist/                         # Build output
```

### Basic setup and run

This project uses [node-global-key-listener-extended](https://github.com/lee-sihun/node-global-key-listener), which relies on `node-gyp` and builds native C++ code, so you need the following development environment

- **Node.js**
- **Python 3.x**
- **Visual Studio Build Tools** with the C++ Desktop Development workload

Once your environment is ready, run the following commands in your terminal

```bash
git clone https://github.com/lee-sihun/DmNote.git
cd DmNote
npm install
npm run start
```

### (Optional) quick test without C++ build tools

If setting up a C++ build environment is difficult, you can test with a prebuilt version of the package. Remove the `postinstall` script from `package.json` and change `dependencies` as below

```json
{
  "dependencies": {
    "node-global-key-listener-extended": "github:lee-sihun/node-global-key-listener#win-keyserver-version"
  }
}
```

After editing the file, run `npm install` and then `npm run start`

## 🖼️ Screenshots

<!--img src="docs/assets/2025-08-29_12-07-12.webp" alt="Note Effect" width="700"-->

<img src="./assets/IMG_1005.gif" alt="Note Effect" width="700">

<!--img src="docs/assets/1.webp" alt="키뷰어 데모 1" width="700"-->

<img src="./assets/2025-09-20_11-55-17.gif" alt="키뷰어 데모 2" width="700">

<!--img src="./assets/IMG_1008.gif" alt="키뷰어 데모 3" width="700"-->

<img src="./assets/2025-09-20_11-57-38.gif" alt="키뷰어 데모 4" width="700">

## 📝 Notes

- If you encounter graphics issues, try changing the graphics API option in Settings
- With OBS Window Capture, you can bring it in with a transparent background — no chroma key needed
- When overlaying on top of a game, enable **Always on top** and turn on **Overlay window lock**
- Default presets and custom CSS examples live in `resources/resources`
- When adding class names, enter just the name — no selector (`blue` = OK, `.blue` = not OK)
- Default settings live at `%appdata%/dm-note/config.json`

## 🤝 Contributing

We welcome your contributions. See the [contribution guide](CONTRIBUTING.md) for details

## 📄 License

[GPL-3.0 License Copyright (C) 2024 lee-sihun](https://github.com/lee-sihun/DmNote/blob/master/LICENSE)

## ❤️ Special thanks

- [electron/electron](https://github.com/electron/electron)
- [LaunchMenu/node-global-key-listener](https://github.com/LaunchMenu/node-global-key-listener)

<!--
## 🔜 Coming soon

- Keystroke counter and input speed visualization
- Millisecond interval display for simultaneous presses
- Input analytics
-->


