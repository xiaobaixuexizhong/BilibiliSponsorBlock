# Bilibili 页面与播放器加载时序
最后更新：2026-04-12

这份文档总结这次针对 BilibiliSponsorBlock 在 B 站视频页后台加载错位问题的排查结果，重点回答三个问题：

- B 站页面什么时候算真正 ready
- B 站播放器什么时候只完成了“壳 DOM”，什么时候才真正可挂载扩展 UI
- 扩展应该如何做生命周期管理，避免按钮、进度条过早挂载或被宿主页面替换后丢失

## 1. 复现条件

问题最容易在下面的路径出现：

1. 在后台新标签页打开 B 站视频页，不切过去。
2. 等页面在后台自行加载一段时间。
3. 切到该标签页。
4. 此时扩展按钮可能已经出现在播放器左下角，但播放器本身还没准备好，进度条也没出现。
5. 随着播放器继续初始化，按钮会“恢复”到正常位置。

从日志上看，这不是新按钮重新创建，而是旧按钮先挂到了一个尚未稳定的宿主容器里，后续随着宿主容器完成布局，旧按钮一起被带到了正确位置。

## 2. 这次观察到的真实时序

基于 `docs/page-load-log.txt` 中这次后台加载样本，可以把时序拆成五段。

### 2.1 content script 启动

最早阶段只有页面 URL 和少量文档结构可用：

- `content/init`
- `video/setupModule`
- `video/setupMutationListener:missingPlayerRoot`

此时特征：

- `document.hidden === true`
- `document.readyState === "loading"` 或 `"interactive"`
- `#bilibili-player` 可能还不存在
- 控制栏和进度条都还不存在

### 2.2 video 元素出现，但播放器仍未就绪

很快 `<video>` 就会被插入：

- `video/videoIDChange:incoming`
- `video/refreshAttachments:resolved`
- `content/videoElementChange:received`

此时特征：

- `#bilibili-player video` 已经存在
- `video.readyState === 0`
- `video.duration === null`
- 左右控制栏容器类名已经能查到
- 但进度条 `.bpx-player-progress-schedule` 仍不存在

这一阶段最容易误判。因为“video 已存在”和“控制栏容器有 class”不等于“播放器 UI 已可挂载扩展控件”。

### 2.3 页面 ready，但播放器仍可能没 ready

MAIN world 的 Vue 挂载会先完成：

- `main/pageReadyDetected`
- `pageReady/messageReceived`
- `pageReady/resolved`

这代表页面框架已经可用，但不代表播放器控制区已经稳定。后台页尤其如此。

### 2.4 后台页里的宿主控件会提前出现

在后台加载阶段，B 站可能已经把右下角控制栏节点渲染出来，所以旧逻辑会过早创建扩展按钮：

- `playerButtons/create:mounted`
- `playerButtons/create:ready`

但这一刻仍然可能同时满足：

- `hidden === true`
- `progressSchedule` 不存在
- `video.readyState === 0`
- `video.duration === null`

所以“右下角容器存在”只能说明 B 站给出了播放器骨架，不能说明可以挂扩展 UI。

### 2.5 切到前台后，播放器才真正稳定

切换标签页前台后，日志会继续出现：

- `content/visibilitychange.once`
- `content/videoElementChange:readyForUi`
- 一段时间后 `previewBar/create:mounted`

直到下面这些条件同时成立，才可以认为播放器 UI 真正 ready：

- `document.hidden === false`
- 页面 `pageReady === true`
- `#bilibili-player video` 存在
- `video.readyState >= HAVE_METADATA`
- `video.duration` 为有效数值
- 左右控制栏都已经有非零尺寸
- 主进度条 `.bpx-player-progress-schedule` 已存在且有非零尺寸

## 3. 本次问题的直接原因

### 3.1 右下按钮过早挂载

旧逻辑中，右下按钮创建只要求：

- `.bpx-player-control-bottom-right` 存在
- 控制栏子节点数量达到阈值

它没有要求：

- 标签页可见
- 页面 ready
- 视频已有元数据
- 主进度条已出现
- 控制栏位置和尺寸已经稳定

结果是后台页里只要 B 站先渲染出一个播放器骨架，扩展按钮就会先挂进去。

### 3.2 左下按钮过早挂载

左下跳过按钮旧逻辑只要求：

- `pageLoaded === true`
- `.bpx-player-control-bottom-left` 存在

这同样不够。后台页切到前台时，左下控制栏可能还只是宿主占位壳。

### 3.3 预览条的时机相对更晚，但仍然依赖宿主 DOM

预览条依赖 `.bpx-player-progress-schedule`，因此通常比按钮更晚出现，更不容易错位。
但如果宿主后续重建 progress DOM，而扩展没有重新挂载，仍然可能出现预览条不显示、丢失或挂在旧节点上的问题。

### 3.4 后台页阶段会错过部分视频事件

旧逻辑在后台标签页时不会立即挂 `video` 监听器，而是等前台后再挂。这会丢掉隐藏阶段已经发生的：

- `loadstart`
- `durationchange`
- 其他依赖播放器初始化的事件

这不是本次错位的唯一根因，但会加重“切到前台时状态不同步”的问题。

## 4. 修复策略

本次修复把“播放器稳定后才能挂 UI”抽成了一套统一门槛。

核心思路：

1. 尽早识别 video 元素，尽早挂视频监听器。
2. UI 挂载统一等待 `waitForPlayerUiReady()`。
3. 右下按钮、左下按钮、预览条共享同一套“播放器稳定”定义。
4. 如果宿主节点还没稳定，不立即失败，而是继续等待。

### 4.1 新的播放器就绪条件

`src/content/playerUi.ts` 中统一定义：

- 页面必须可见
- 页面必须已经 pageReady
- `video.readyState >= HAVE_METADATA`
- `video.duration > 0`
- 左控制栏存在且有非零尺寸
- 右控制栏存在且有非零尺寸
- 主进度条存在且有非零尺寸

另外还会做一次短暂二次确认，避免宿主正处在“刚出现但马上要重排”的瞬间。

### 4.2 右下按钮修复

`src/render/PlayerButton.tsx` 现在会先等待 `waitForPlayerUiReady()`，再创建按钮。

这意味着：

- 后台页即使已经渲染了控制栏骨架，也不会立刻挂扩展按钮
- 切到前台且播放器稳定后，按钮才会真正插入
- 并发创建请求会被同一个 `creationPromise` 合并，避免同一实例被重复 prepend

### 4.3 左下按钮修复

`src/js-components/skipButtonControlBar.ts` 的 `attachToPage()` 现在会等待统一的播放器 ready 条件，而不再只看 `.bpx-player-control-bottom-left` 是否存在。

### 4.4 预览条修复

`src/content/previewBarManager.ts` 中：

- `createPreviewBar()` 在播放器未就绪时不会提前创建
- `checkPreviewBarState()` 也会等待同样的 ready 条件再重试

这减少了挂到临时 progress DOM 上的概率。

### 4.5 视频监听器修复

`src/content.ts` 中 `videoElementChange()` 现在把两件事拆开：

- `setupVideoListeners(video)`：只等配置 ready，尽早安装
- `setupSkipButtonControlBar` / `createPreviewBar` / `updatePlayerButtons`：等待播放器 UI ready

这样后台页阶段不会再错过初始化期间的 video 事件。

## 5. 推荐的生命周期规则

后续给 B 站播放器注入 UI 时，建议遵守下面的规则。

### 5.1 可以尽早做的事

- 识别 videoID
- 识别 `HTMLVideoElement`
- 安装 video 事件监听器
- 拉取 sponsor 数据
- 恢复草稿状态

这些事不要求控制栏和进度条已经存在。

### 5.2 必须等播放器稳定后才能做的事

- 创建右下角扩展按钮
- 创建左下角跳过按钮
- 创建扩展预览条
- 依赖控制栏位置和尺寸的任何 DOM 注入

### 5.3 必须做重挂载检查的事

- 宿主会替换或清空的 DOM 节点
- 进度条附着节点
- 控制栏附着节点

判断标准不要只看“元素还存在”，还要看：

- 这个节点是否仍然在当前参考树里
- 它是否有非零尺寸
- 它是否还是当前播放器对应的那一个实例

## 6. 调试建议

当前已加的生命周期日志可以直接在控制台中搜索：

- `[BSB lifecycle]`

重点看这些阶段：

- `pageReady/*`
- `playerUI/wait:*`
- `video/refreshAttachments:*`
- `content/videoElementChange:*`
- `playerButtons/create:*`
- `skipButton/attach:*`
- `previewBar/create:*`
- `previewBar/checkState:detached`

如果再次遇到问题，最有价值的信息仍然是：

- 从后台打开页面到恢复正常的完整 `window.SBLogs.lifecycle`
- 错位时的 DOM 快照
- 错位时和恢复后的截图

## 7. 当前代码入口

这次问题相关的关键代码在：

- `src/content/playerUi.ts`
- `src/content.ts`
- `src/render/PlayerButton.tsx`
- `src/js-components/skipButtonControlBar.ts`
- `src/content/previewBarManager.ts`
- `src/utils/video.ts`
- `src/content/videoListeners.ts`
