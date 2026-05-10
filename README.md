# ShinyScenarioViewer

[中文](#中文) | [English](#english)

## 中文

ShinyScenarioViewer 是一个静态网页形式的 ADV 剧情播放器，基于 enza 版『アイドルマスター シャイニーカラーズ』前端播放器行为实现。

本仓库只包含播放器源码和资源路径约定，不包含游戏资源或剧情数据。运行前需要自行准备 `assets/` 下的资源文件。

### 功能

- 播放本地准备的剧情 JSON。
- 支持文本、说话人、文本框、选项、日志、语音、SE、BGM、背景、前景、still、movie、Spine 等资源类型。
- 没有指定 `eventId` 时，会显示自制的可视化剧情入口页。
- 支持在日志界面重放语音。
- 支持为 `produce_events` 入口卡片配置可选缩略图。

### 截图

![入口页面](./001.png)

![播放界面](./002.png)

![缩略图入口页面](./003.png)

![点击羽毛特效](./feather.png)

### 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | 浏览器入口文件。 |
| `main.js` | 应用启动、剧情加载和可视化入口页逻辑。 |
| `main.css` | 播放器和入口页样式。 |
| `scripts/` | 播放器核心模块。 |
| `lib/` | 播放器运行所需的 JavaScript 库。 |
| `assets/` | 本地运行资源目录，已被 git 忽略。 |

### assets 配置

`assets/` 不会提交到 git。请根据要播放的剧情自行准备资源。

目录结构：

```text
assets/
├─ json/
├─ fonts/
├─ images/
├─ sounds/
├─ spine/
├─ movies/
└─ thumbnail/
```

其中，thumbnail用来配置scenarioviewer的入口处缩略图。

播放器至少需要字体、UI 图集、文本框、日志框、头像和 UI 音效。具体剧情还可能引用背景、前景、语音、BGM、SE、still、movie、Spine 等资源。

资源根路径在 `scripts/Constants.js` 中配置：

```js
const ASSET_PATH = './assets';
const DOWNLOADS_PATH = './assets';
```

### 剧情 JSON 入口

入口页会扫描 `assets/json/`，并按 event type 分组显示剧情。

```text
assets/
└─ json/
   ├─ produce_events/
   │  ├─ 100100001.json
   │  └─ 100200001.json
   ├─ support_events/
   │  └─ ...
   └─ special_communications/
      └─ ...
```

不带参数打开时，会进入可视化入口页：

```text
http://127.0.0.1:8000/
```

![剧情日志](./004.png)

带参数打开时，会直接播放指定剧情：

```text
http://127.0.0.1:8000/?eventType=produce_events&eventId=100100001
```

如果省略 `eventType`，默认使用 `produce_events`。

### language URL 参数

播放器支持通过 URL query 参数切换显示语言。

相比于 enza 可以识别并选择性播放 JSON 文件中的 text_cn，select_cn 等新字段。

当前约定：

- `language=cn`：优先使用 `text_cn` / `select_cn`
- `language=en`：预留给 `text_en` / `select_en`
- 不传 `language`：使用原始 `text` / `select`（日文）

示例：

```JSON
  {
    "speaker": "プロデューサー",
    "text": "（ふぅ、あと少しだ……\r\nなんとか今日中に終わればいいんだけど……）",
    "textCtrl": "p",
    "textFrame": "002",
    "text_cn": "（呼，还差一点……\r\n希望能赶在今天之内完成……）",
    "text_en": "(Phew, just a little more...\r\nI hope I can finish it today somehow...)"
  },
  ```
  如果传入 `language` 的参数是 `cn`，那么优先选择播放 `text_cn`

```text
http://127.0.0.1:8000/?eventType=produce_events&eventId=100100001&language=cn
```

```text
http://127.0.0.1:8000/?eventType=produce_events&eventId=100100001&language=en
```

你也可以在可视化入口处切换语言

![SwitchLanguage](./SwitchLanguage.png)

补充说明：

- 如果指定了 `language=cn`，但剧情 JSON 中没有 `text_cn` 或 `select_cn`，会自动回退到原始 `text` / `select`。
- `language=cn` 或者 `language=en` 下会默认切换到中文字体配置（当前项目内对应 `Yuanti`）。
- 对话日志界面的人物小头头像，是根据 `speaker` 来决定的，只有日文适配，非必要不建议翻译 `speaker`

### 可选缩略图

`produce_events` 入口卡片会从剧情 ID 中读取角色 ID，并可显示角色缩略图。

推荐尺寸：

```text
480x270
```

路径格式：

```text
assets/thumbnail/classic/001.jpg
assets/thumbnail/classic/002.jpg
...
assets/thumbnail/classic/028.jpg

assets/thumbnail/fes/001.jpg
assets/thumbnail/fes/002.jpg
...
assets/thumbnail/fes/028.jpg
```

`classic` 图片默认显示；如果存在对应 `fes` 图片，鼠标悬停时会淡入显示。


### 本地运行

请使用本地静态服务器运行。不要直接用 `file://` 打开 `index.html`，否则浏览器可能阻止 JSON 扫描或资源加载。

```bash
python -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/
```

### 剧情汉化与录制

如果你使用本项目播放并录制剧情内容，用于剧情汉化、视频投稿或相关展示，请在简介、说明或字幕组信息中标明使用了本项目。

### Special thanks

- yesterday17：没有他就不会有这个项目。
- Euphokumiko / [ShinyColorsDB-EventViewer](https://github.com/ShinyColorsDB/ShinyColorsDB-EventViewer)：该项目对本项目的实现方向提供了很大启发。

---

## English

ShinyScenarioViewer is a static web-based ADV scenario player based on the frontend playback behavior of the enza version of 『アイドルマスター シャイニーカラーズ』.

This repository only contains the player source code and asset path conventions. Game assets and scenario data are not included. You must prepare the required files under `assets/` yourself.

### Features

- Plays locally prepared scenario JSON files.
- Supports text, speakers, text frames, choices, log view, voice, SE, BGM, backgrounds, foregrounds, still images, movies, and Spine resources.
- Shows a custom visual scenario entry page when no `eventId` is specified.
- Supports voice replay from the scenario log screen.
- Supports optional thumbnails for `produce_events` entry cards.

### Screenshots

![Entry Page](./001.png)

![Player View](./002.png)

![Thumbnail Entry View](./003.png)

![Scenario Log](./004.png)

![Tap Feather Effect](./feather.png)

### Project structure

| Path | Description |
| --- | --- |
| `index.html` | Browser entry point. |
| `main.js` | App startup, scenario loading, and visual entry page logic. |
| `main.css` | Player and entry page styles. |
| `scripts/` | Core player modules. |
| `lib/` | JavaScript libraries required by the player. |
| `assets/` | Local runtime assets. This directory is ignored by git. |

### Assets

`assets/` is ignored by git. Prepare the required assets according to the scenarios you want to play.

Recommended layout:

```text
assets/
├─ json/
├─ fonts/
├─ images/
├─ sounds/
├─ spine/
├─ movies/
└─ thumbnail/
```

thumbnail folder is used to configure the window which you choose the json file.

The player shell requires fonts, UI atlases, text frames, log frames, speaker icons, and UI sound effects. Individual scenarios may additionally reference backgrounds, foregrounds, voices, BGM, SE, still images, movies, and Spine data.

Asset roots are configured in `scripts/Constants.js`:

```js
const ASSET_PATH = './assets';
const DOWNLOADS_PATH = './assets';
```

### Scenario JSON entry page

The entry page scans `assets/json/` and groups scenario files by event type.

```text
assets/
└─ json/
   ├─ produce_events/
   │  ├─ 100100001.json
   │  └─ 100200001.json
   ├─ support_events/
   │  └─ ...
   └─ special_communications/
      └─ ...
```

Open without parameters to show the visual entry page:

```text
http://127.0.0.1:8000/
```

Open with parameters to start playback directly:

```text
http://127.0.0.1:8000/?eventType=produce_events&eventId=100100001
```

If `eventType` is omitted, `produce_events` is used by default.

### `language` URL parameter

The player supports switching display language through a URL query parameter.

Current behavior:

- `language=cn`: prefers `text_cn` / `select_cn`
- `language=en`: reserved for `text_en` / `select_en`
- no `language` parameter: uses the original `text` / `select` fields (Japanese)

Examples:

```
  {
    "speaker": "プロデューサー",
    "text": "（ふぅ、あと少しだ……\r\nなんとか今日中に終わればいいんだけど……）",
    "textCtrl": "p",
    "textFrame": "002",
    "text_cn": "（呼，还差一点……\r\n希望能赶在今天之内完成……）",
    "text_en": "(Phew, just a little more...\r\nI hope I can finish it today somehow...)"
  },
  ```
If `language = en` , ScenarioViewer will pick `text_en` and play automatically.

```text
http://127.0.0.1:8000/?eventType=produce_events&eventId=100100001&language=cn
```

```text
http://127.0.0.1:8000/?eventType=produce_events&eventId=100100001&language=en
```

![Chinese Screenshot](./Chinese.png)
![English Screenshot](./English.png)

You can also switch language in the entry page:

![SwitchLanguage](./SwitchLanguage.png)

Notes:

- If `language=en` is provided but the scenario JSON does not contain `text_en` or `select_en`, the player automatically falls back to the original `text` / `select`.
- Under `language=cn` or `language=en`, the player also switches to the Preset font configuration (`Yuanti` in the current project setup).
- The Character circle icon shown in log window is defined and decided by the `speaker`. So I recommend not to change it if not necessary.

### Optional thumbnails

For `produce_events`, the entry page reads the character ID from the scenario ID and can show optional thumbnails.

Recommended size:

```text
480x270
```

Expected paths:

```text
assets/thumbnail/classic/001.jpg
assets/thumbnail/classic/002.jpg
...
assets/thumbnail/classic/028.jpg

assets/thumbnail/fes/001.jpg
assets/thumbnail/fes/002.jpg
...
assets/thumbnail/fes/028.jpg
```

`classic` images are shown by default. If a matching `fes` image exists, it fades in on hover.

### Running locally

Use a local static server. Do not open `index.html` directly with `file://`, because browsers may block JSON directory scanning or asset loading.

```bash
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

### Scenario translation and recording

If you use this project to play and record scenarios for translation, video uploads, or related presentations, please mention that this project was used in the description, credits, or translation notes.

### Special thanks

- yesterday17: This project would not exist without him.
- Euphokumiko / [ShinyColorsDB-EventViewer](https://github.com/ShinyColorsDB/ShinyColorsDB-EventViewer): This project was a major source of inspiration for ShinyScenarioViewer.
