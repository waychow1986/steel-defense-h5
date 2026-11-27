# 钢铁防线技术方案

> 依据：已确认意图 v2（含 G1 的 Q1～Q5、R1～R8 人工答案）、规格 `spec.md`（FR-001～FR-048、NFR-001～NFR-003、假设 A-1～A-15）、项目宪章。本次没有 `g2Decisions`。
> 项目还没有系统现状（`.ai-delivery/system-current.md` 不存在），仓库现状只有 `README.md` 与交付文档，没有任何代码、构建、测试、CI 或基础设施定义；本方案即项目的第一版技术基线，全部为“新增”。

## 技术上下文（Technical Context）

### 已由文档写明、直接引用的事实

| 事实 | 出处 |
|---|---|
| 编码与独立测试的 Pod 预装 Node 22、Playwright 与 Chromium；可在 Pod 内 `localhost` 启动应用并用 Playwright 驱动 Chromium；`localhost` 是安全上下文 | `runtime/agent-pod.md` |
| 部署声明 `docs/deployment.json` 的字段规则；服务镜像由 ACR Tasks 按 Dockerfile 构建，镜像用户必须是正整数 UID；对外服务经网关得到 HTTPS 地址，TLS 在网关终止后以 HTTP 转发到 `port` | `runtime/candidate.md` |
| 开发者命令写在 Feature 目录 `runtime/deployment.json`，类别顺序 `staticAnalysis → build → developerTests → integrationTests`，以 `bash -euo pipefail` 执行 | `runtime/candidate.md`、`runtime/catalog-facts.md` |
| 平台没有内置错误日志规则，只按 `operations.errorLogRules` 识别 | `runtime/candidate.md` |
| 浏览器自动播放策略：`AudioContext` 在用户手势（click/keydown/touchend）中创建或 `resume()` 后进入 `running`；iOS Safari 要求在 `touchend`/`click` 手势内解锁，`touchstart` 不可靠；iOS 静音开关会使网页音频不出声 | Chrome “Autoplay policy” 文档；WebKit “New video policies for iOS” 与 MDN `AudioContext.resume()` |
| `OfflineAudioContext` 可在不出声的情况下把音频图渲染成 `AudioBuffer`，适合对合成音效做数值比较 | MDN `OfflineAudioContext` |
| Playwright `page.clock` 可伪造 `Date`、`setTimeout`/`setInterval`、`requestAnimationFrame`、`performance.now`；`install()` 后时间默认继续自然流逝，`pauseAt()` 后只随 `runFor()`/`fastForward()` 前进 | Playwright 文档 “Clock” |
| CSS `transition`/`animation` 由合成器按真实时间驱动，不受 `page.clock` 控制 | Playwright 文档 “Clock”（只列出上述 JS 计时 API） |
| `KeyboardEvent.code` 表示物理按键位置（`ArrowUp`、`KeyW`、`Space`），与键盘布局和输入法无关 | MDN `KeyboardEvent.code` |
| Pointer Events 的 `setPointerCapture`、`pointercancel`；`touch-action: none` 阻止浏览器在该元素上的平移与缩放手势 | MDN Pointer Events、MDN `touch-action` |
| `localStorage` 在禁用存储或隐私模式写满时抛出异常（`SecurityError`/`QuotaExceededError`） | MDN `Window.localStorage` |
| `nginxinc/nginx-unprivileged` 镜像以 UID 101 运行、默认监听 8080，访问日志与错误日志分别链接到 stdout/stderr；nginx 错误日志行格式为 `YYYY/MM/DD HH:MM:SS [level] pid#tid: *cid message` | 镜像仓库 README；nginx 文档 `error_log` |

### 不确定项与结论

| 编号 | 不确定项（会改变的决定） | 结论 | 证据 |
|---|---|---|---|
| U-1 | 本平台 Pod 中预装的 Chromium 对应哪个 `@playwright/test` 版本（决定 `package.json` 锁定的版本；不匹配时 `integrationTests` 需要下载浏览器，而执行环境不保证可下载） | 预装的浏览器目录为 `/ms-playwright/chromium-1255`（`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`），`@playwright/test@1.65.1` 期望的 chromium 版本正是 1255，无需下载即可启动 | 实验 E-1 |
| U-2 | 无头 Chromium 中，在点击/触摸开始按钮的处理函数里创建的 `AudioContext` 是否立即为 `running`（决定集成测试能否在 Pod 中断言“开始后音频处于运行状态”，以及是否需要额外的解锁逻辑） | 是：`tap` 开始按钮后 `AudioContext.state` 为 `running` | 实验 E-1 |
| U-3 | Canvas 2D（预渲染精灵 + 每帧重绘约 170 个格子、24 辆带阴影旋转的坦克、400 个粒子）在 390×844、DPR 3、CPU 降速 4 倍的无头 Chromium 中能否维持 60 帧（决定用 Canvas 2D 还是引入 WebGL 渲染库） | 能：帧间隔中位数 16.7ms、p95 16.7ms、最大 16.8ms；工作量已高于本游戏实际峰值（场上最多 1 辆玩家 + 4 辆敌方坦克） | 实验 E-1 |
| U-4 | `page.clock.pauseAt()` 之后 `runFor(1000)` 时 `requestAnimationFrame` 是否按约 16ms 节拍触发、`performance.now()` 是否恰好前进 1000ms（决定“时间控制”约定能否让测试确定地推进游戏） | 是：1000ms 内 rAF 触发 64 次，`performance.now()` 前进 1000.0ms；未 `pauseAt` 时时间继续自然流逝（同一实验中观察到 1811ms） | 实验 E-2 |
| U-6 | Playwright 以 `hasTouch`/`isMobile` 模拟手机时，`(pointer: coarse)` 与 `(orientation: landscape)` 媒体查询是否按模拟设备匹配（决定虚拟按键与横屏提示是否用 CSS 媒体查询判定，以及测试能否复现） | 是：桌面上下文 `coarse=false`；手机竖屏 `coarse=true, landscape=false`；手机横屏 `coarse=true, landscape=true`；只开 `hasTouch` 也为 `coarse=true` | 实验 E-3 |
| U-5 | 真实中低端手机（尤其 iOS Safari、安卓 Chrome）上 Canvas 2D 能否稳定 60 帧 | **待验证假设 H-1**（本会话无真机，无头 Chromium 的 CPU 降速不能代表移动 GPU 与合成器）；附后备做法 TD-005 的自适应画质，见“开放决策” | — |

## 治理与技术约束

| 约束 | 来源 | 设计响应 |
|---|---|---|
| 保持已批准的业务意图和范围；优先最简单架构 | 宪章“产品与架构” | 纯前端静态应用，无后端、无数据库、无外部依赖；用一个静态文件服务容器部署（TD-001、TD-010） |
| 记录重大决策和有充分理由的例外 | 宪章“产品与架构” | 下文“技术决策与替代方案”；唯一为可测性新增的能力（只读诊断快照、`seed` 参数）在 TD-012 写明理由 |
| 凭据保留在服务端；least privilege；不记录 secret 或客户内容 | 宪章“安全与隐私” | 本应用没有任何凭据与机密；只在浏览器本地保存一个整数（历史最高分）；容器非 root、只读静态文件；nginx 访问日志只含请求行，不含任何个人内容（TD-011） |
| 每项用户可见能力都有可独立执行的验收场景 | 宪章“测试与质量” | “可测性约定”给出可访问名称、时间与随机性控制、只读诊断快照，独立测试可在测试环境公开入口上驱动全部画面 |
| 外部 integration 针对真实测试服务测试，Mock 不替代验收证据 | 宪章“测试与质量” | 本次没有外部集成；集成测试在真实 Chromium 中运行真实构建 |
| 名称、地图、造型、配色、音效与音乐全部原创 | 意图约束、FR-003 | 所有图形由代码程序化绘制、所有声音由 Web Audio 程序化合成，仓库中没有任何外部美术/音频素材文件（TD-003、TD-006）；指挥所造型为“雷达掩体”，不使用经典作品中常见的鸟类徽记 |
| 不修改已有 CI、部署脚本与基础设施 | 平台规则 | 仓库中没有；本次不新增 CI，只新增部署声明要求的 `Dockerfile` |

## 架构概览（Architecture）

单页静态网页应用，TypeScript 编写，Vite 构建为静态文件，由 nginx（非 root）容器对外提供。运行时全部在浏览器内：

```
index.html ─ src/main.ts
   │
   ├─ app/      DOM 层：页面标题、“怎么玩”、画面浮层（开始/开场/过关/失败/通关/横屏提示）、HUD、静音按钮、虚拟按键、布局缩放、诊断快照
   ├─ input/    键盘与触摸 → 输入状态（方向栈 + 开火按住）
   ├─ game/     纯逻辑模拟（无 DOM、无 Canvas、无音频）：地图、坦克、子弹、道具、关卡、规则、事件
   ├─ render/   Canvas 2D 渲染：调色板、预渲染精灵、地形层、粒子、屏幕震动、插值
   ├─ audio/    Web Audio：音效合成配方、背景音乐音序器、总线与静音
   └─ storage/  历史最高分（localStorage）
```

- **主循环**：`requestAnimationFrame` 驱动；模拟以固定步长 1/60 秒推进（累加器，单帧最多补 4 步、帧间隔超过 250ms 时截断，避免切回标签页时“快进”）；渲染按累加器余量插值位置。
- **单向数据流**：输入 → `game.step(dt, input)` 产生状态与事件列表（`fire`、`hit`、`brickHit`、`explode`、`pickup`、`levelClear`、`gameOver`、`victory`、`lifeLost`、`scoreChanged` 等）→ 渲染层据状态绘制、据事件生成特效 → 音频层据事件播放音效 → DOM 层据状态更新 HUD 与画面 → 存储层据 `scoreChanged` 保存最高分。模拟层不依赖任何其他层，便于单元测试。
- **画面状态机**（DOM 层持有，时间来自主循环时钟）：`start → levelIntro → playing → levelClear → (levelIntro | victory)`；`playing → gameOver`；`gameOver | victory → start`；任意状态下横屏提示独立叠加。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 证据 | 来源 |
|---|---|---|---|---|---|
| TD-001 | 语言与构建：TypeScript 5（`strict`）+ Vite（`vite build` 输出静态文件），Node 22（`package.json` 写 `"engines": {"node": ">=22"}`，代码不使用 22 之后才有的 API）；包管理用 npm 并提交 `package-lock.json` | 平台 Pod 预装 Node 22；Vite 零配置支持 TS、产出带哈希的静态资源；无运行时框架依赖 | 纯 JS 无构建（缺少类型检查，逻辑规模大时易错）；Webpack（配置更重） | `runtime/agent-pod.md` | 全部 FR |
| TD-002 | 不使用游戏引擎与 UI 框架：自写固定步长模拟 + Canvas 2D 渲染；DOM 部分用原生 TS（少量模板函数） | 游戏规模小（13×13 格、场上最多 5 辆坦克）；Canvas 2D 在实验中有充足余量；自写可完全控制输入延迟与时序，且模拟层可纯函数测试 | Phaser/PixiJS（体积与学习成本、渲染管线不透明，测试需绕过引擎）；React（画面浮层很少，不值得引入） | 实验 E-1（U-3） | FR-010、FR-039、NFR-001、NFR-002 |
| TD-003 | 全部图形程序化绘制：启动时把每种坦克（4 个朝向 × 4 个履带相位 × 普通/受击闪白）、砖块、钢块、水面帧、指挥所、道具预渲染到离屏画布（按当前缩放与 DPR），游戏中只 `drawImage` | 素材完全原创且无加载闪烁；统一的光源与描边在一处实现；预渲染保证每帧开销低 | 位图素材（需原创美术来源，且有加载与缩放模糊问题）；SVG DOM 元素（大量节点影响帧率） | 实验 E-1（U-3） | FR-003、FR-031、FR-032 |
| TD-004 | 统一画法：光源固定在左上；所有物体投影向右下偏移（0.06 格，`rgba(10,14,12,0.35)`）；统一 2 逻辑像素深色描边 `#14181c`；高光在左上边缘、暗面在右下边缘；全部颜色只从 `src/render/palette.ts` 取 | 满足 R2 改写的“阴影方向一致、描边方式一致、同一套配色”，且可由单元测试检查精灵配方只引用调色板 | 每个物体各自定义颜色（无法保证统一） | 规格 FR-031 | FR-031、FR-032 |
| TD-005 | 渲染分层与画质：静态地形层（地面、钢墙、水面底色）缓存为离屏画布，仅在缩放变化时重建；砖墙层在砖块被打掉时局部重绘；水面波光每帧以 4 帧循环贴图绘制；动态层每帧重绘。画布后备尺寸 = CSS 尺寸 × `min(devicePixelRatio, 2)`；粒子上限 300。**自适应画质（H-1 的后备）**：连续 2 秒平均帧间隔超过 18ms 时，DPR 上限降到 1.5、粒子上限减半、关闭坦克投影模糊，仍超过则 DPR 降到 1；降级只降清晰度与粒子数量，不去掉任何规格要求的效果 | 保证手机 60 帧；降级不削弱体验要求（效果都在，只是更少粒子） | WebGL（实验显示不需要；兼容与复杂度更高）；固定 DPR 1（高清屏发虚，削弱“精致”） | 实验 E-1（U-3）；H-1 | NFR-002、FR-039 |
| TD-006 | 音频：Web Audio API 程序化合成，不使用音频文件。节点图 `cue/music → sfxBus(1.0) / musicBus(0.3) → master → destination`；6 种音效各有独立配方（见“Interface 与契约 · 音效配方”）；背景音乐为原创 8 小节循环，用前瞻调度器（`setInterval` 25ms、提前 0.12s 用 `AudioContext.currentTime` 排音符）播放 | 素材原创且体积为零；音效互不相同可用 `OfflineAudioContext` 数值验证；音乐音量低于音效由总线增益保证 | 音频文件（需原创录制/授权，增加加载与解码）；`<audio>` 元素（iOS 上延迟高、并发差） | Chrome Autoplay policy；MDN `OfflineAudioContext` | FR-040、FR-041、FR-043 |
| TD-007 | 音频解锁：`AudioContext` 在第一个用户手势中惰性创建（开始按钮 `click`、静音按钮 `click`、任意 `keydown`），并在同一手势中 `resume()` 且播放一个 1 采样的静音缓冲（iOS 解锁惯例）；`visibilitychange` 回到可见或下一次手势时若状态不是 `running` 再次 `resume()` | 规格以“点击开始按钮”作为启用声音的时机；iOS 要求在 `click`/`touchend` 内解锁，开始按钮使用 `click`（触摸后会派发 click） | 页面加载即创建（会被自动播放策略挂起）；在 `touchstart` 中解锁（iOS 不可靠） | 实验 E-1（U-2）；WebKit 视频/音频策略；MDN `resume()` | FR-043、AC-21 |
| TD-008 | 静音：`master.gain` 用 `setTargetAtTime(0, now, 0.01)` 置 0，并停止音乐调度器排新音符；取消静音时恢复增益 1 并从下一拍继续排音乐。静音状态只在内存中，每次打开默认有声 | 一处控制全部声音，满足“全部停止发声”；短时间常数避免爆音 | `AudioContext.suspend()`（恢复时需要手势且有延迟，切换不跟手） | MDN `AudioParam.setTargetAtTime` | FR-042、AC-20 |
| TD-009 | 输入：键盘监听 `window` 的 `keydown/keyup`，按 `event.code` 识别 `ArrowUp/Down/Left/Right`、`KeyW/A/S/D`、`Space`；游戏进行中对这些键 `preventDefault()`（防止页面滚动）；忽略 `repeat`；`blur`/`visibilitychange` 时清空按住状态。方向用“按住栈”：最后按下的方向优先，松开后回到栈中仍按住的方向（A-4）。触摸：虚拟方向键为 4 个按钮放在同一容器中，容器用 Pointer Events + `setPointerCapture`，`pointermove` 时用 `document.elementFromPoint` 判定手指当前所在方向（手指滑到相邻方向即切换），`pointerup/pointercancel` 释放；开火按钮 `pointerdown` 即开火。按住开火（键盘或触摸）时只要己方子弹数未达上限即连续开火。输入状态在下一个模拟步（≤16.7ms）生效 | 按下到响应 ≤ 一个模拟步 + 一帧（约 34ms），远低于 100ms；松开在下一个模拟步停止 | `keypress`/`key`（受布局与输入法影响）；touch 事件（与鼠标两套逻辑）；HTML 按钮的 `click`（触摸要等抬起，延迟大） | MDN `KeyboardEvent.code`、Pointer Events | FR-007、FR-008、FR-010、NFR-001、A-4、A-9 |
| TD-010 | 部署：单个服务 `web`，多阶段 Dockerfile（`node:22-alpine` 构建 → `nginxinc/nginx-unprivileged:1.27-alpine` 提供静态文件），`USER 101`，端口 8080，健康检查 `/healthz` | 最简单：无后端；nginx 静态服务成熟；非 root 满足平台要求 | Node 自写静态服务器（多一份要维护的代码）；对象存储静态网站（需要云依赖与 IaC，平台部署声明只支持容器服务） | `runtime/candidate.md`；镜像 README | FR-044 等全部 |
| TD-011 | nginx 配置：`/healthz` 返回 200 `ok` 且不写访问日志；`/assets/`（带哈希文件名）`Cache-Control: public, max-age=31536000, immutable`；`/` 与 `index.html` `Cache-Control: no-cache`；`gzip on`（js/css/html/svg/json）；`server_tokens off`；`log_not_found off`（扫描器请求不存在的文件不写错误日志）；安全响应头：`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Permissions-Policy: camera=(), microphone=(), geolocation=()` | 发布新版本后 `index.html` 立即生效、资源长期缓存；最小权限的 CSP（应用无内联脚本与外部请求） | 不设 CSP（降低防护）；在 `index.html` 用 `<meta>` CSP（`frame-ancestors` 不能用 meta 设置） | nginx 文档；MDN CSP | 宪章“安全与隐私” |
| TD-012 | **为可测性新增的能力（理由见“可测性约定”）**：①只读诊断快照 `window.steelDefense.snapshot()`（返回当前游戏状态的深拷贝，任何调用都不能改变游戏）；②URL 参数 `?seed=<非负整数>` 指定随机种子（缺省时用 `crypto.getRandomValues` 生成，并在快照中给出实际种子） | 游戏画面在 Canvas 中，坦克位置、砖块破损、子弹与道具等状态没有无障碍角色可以定位；只读快照让独立测试在测试环境公开入口上判定地形、敌人类型、道具、生命等规则，且不改变产品行为；种子让敌人行为可复现，便于复现缺陷。两者对玩家不可见，不改变任何已确认的产品行为 | 像素比对截图（脆弱、受 DPR 与动效影响）；为测试另开调试端点或“直达第 N 关”参数（改变产品行为，未纳入，见开放决策 OD-3） | `runtime/independent-test.md`（造数与可测性约定要求） | AC-6～AC-13、AC-19、AC-20、AC-23 |
| TD-013 | 历史最高分：`localStorage` 键 `steel-defense.highScore.v1`，值为十进制非负整数字符串；读取时校验（非整数、负数、超过 9 999 999 一律视为 0）；本局分数一旦大于已知最高分即同步写入（每次加分最多一次写入，开销可忽略）；读写包在 `try/catch` 中，失败时游戏照常、最高分显示 0 且不提示（A-7） | 满足 R5“进行中超过即保存”，关闭页面也不丢；`localStorage` 同步写入在 `pagehide` 前已完成 | IndexedDB（异步、复杂度高）；只在一局结束时保存（不满足 R5） | MDN `localStorage` | FR-005、FR-030、A-7 |
| TD-014 | 布局与自适应：CSS Grid 页面骨架；`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`；`html, body { overflow-x: hidden; }` 且所有容器 `max-width: 100%`、`box-sizing: border-box`；高度用 `100dvh`（不支持时回退 `100vh`）。画布为正方形，边长 = `min(可用宽度, 可用高度)`，由 `ResizeObserver` 计算后只在尺寸变化时重设后备尺寸并在同一帧重绘（避免闪烁）。**竖屏手机（`(pointer: coarse)` 且竖屏）**：自上而下为标题栏（标题 + 静音按钮，44px）→ HUD 条（40px）→ 地图画布 → 操作区（方向键在左、开火在右，高度 ≥ 150px）；四个区域在网格中各占一行，互不重叠。**电脑**：地图画布居中，HUD 与静音按钮在画布上方，虚拟按键不显示；宽度 ≥ 1024px 时“怎么玩”说明在画布右侧面板常驻。**横屏手机**（`(pointer: coarse) and (orientation: landscape)`）：显示旋转提示浮层 | 360×640 竖屏可用高度：44 + 40 + 360 + 150 = 594px ≤ 640，可放下；网格分行保证 AC-5 的不重叠；不改画布尺寸就不重绘，避免闪烁 | 画布占满全屏并把按键叠在地图上（违反 FR-009）；用 `transform: scale` 缩放整页（文字模糊、触摸坐标换算复杂） | MDN `ResizeObserver`、CSS `dvh` | FR-009、FR-044、FR-045、AC-5、AC-22 |
| TD-015 | 画面过渡：浮层用 CSS `opacity`+`transform` 过渡（进入 350ms、离开 300ms）；地图在关卡开场时以“上下幕帘合拢再拉开”动画（Canvas 中绘制，450ms）；画面状态切换的时序由主循环时钟（`performance.now`）驱动的状态机决定，CSS 只负责视觉；浮层元素在离开动画结束后才设 `hidden`，进入时先去掉 `hidden` 再在下一帧加可见类 | 状态切换可被 `page.clock` 确定地推进；先渲染后加类保证过渡真实播放、不出现瞬间切换或闪一下 | 全部用 CSS 动画驱动状态（不受 `page.clock` 控制，测试不可确定） | 实验 E-2（U-4）；Playwright Clock 文档 | FR-038、AC-18 |
| TD-016 | 地图与碰撞：13×13 格地图，每格 4×4 个“砖块单元”；坦克占 1 格减 2 个单元边距（实际 0.875 格），连续坐标移动；转向为垂直方向时把横向坐标吸附到最近的半格，便于进入通道；碰撞用轴对齐矩形对地形单元与其他坦克检测；子弹每步按速度分 2 个子步检测，避免高速穿墙；子弹击中砖墙时清除以命中点为中心、垂直于飞行方向的 2×4 个单元（逐块破损）；火力升级的子弹同样清除 2×4 单元（威力不变，速度与并发提高） | 逐块破损自然；吸附让操作手感跟手；子步检测保证高速子弹正确 | 整格破坏（不满足“逐块”）；像素级碰撞（开销大且不必要） | 规格 FR-012～FR-015 | FR-011～FR-015、A-5 |
| TD-017 | 游戏数值（集中在 `src/game/config.ts`）：玩家速度 3.0 格/秒；普通型 2.0、快速型 3.5（=1.75 倍，≥1.5）、重甲型 1.6；生命值：普通 1、快速 1、重甲 3（≥2）；子弹速度 9 格/秒，火力升级后 13 格/秒且玩家可同时有 2 发子弹（平时 1 发）；敌方每辆最多 1 发子弹，开火间隔 0.8～2.0 秒随机；分数：普通 100、快速 200、重甲 300；护盾 10 秒（再次拾取重置）；场上敌人同时最多 4 辆，补位间隔 2.5 秒，出生点为顶行第 1、7、13 列轮换；玩家出生点为底行第 5 列、朝上；指挥所在底行第 7 列，周围 3 面为砖墙 | 满足 R6 倍数、AC-7 重甲至少 2 次、A-1～A-3、A-12；数值集中可单元测试 | 分散在各实体中（难以审查与测试） | 规格 FR-016～FR-027、A-1～A-3、A-12 | FR-016～FR-027 |
| TD-018 | 关卡数据：5 关地图写成 13 行字符串（`.` 空地、`B` 砖墙格（4×4 个砖块单元）、`S` 钢墙格、`W` 水面格、`H` 指挥所；玩家与敌人出生点固定，不写在字符串中），与敌人编队一起放在 `src/game/levels.ts`；编队见“领域与数据模型 · 关卡编队表” | 数据即文档，单元测试可直接校验 AC-11 的数量关系与“每关三种地形都有、布局互不相同” | 外部 JSON 文件（需加载，多一个失败点） | 规格 FR-046、FR-047 | FR-046、FR-047、AC-11 |
| TD-019 | 敌人 AI：沿当前方向前进；被阻挡或每经过一个整格以 25% 概率重新选方向，方向权重“向下 40%、左右各 20%、向上 20%”；开火按随机间隔；随机数全部来自同一个种子化 PRNG（mulberry32） | 简单、有压迫感（倾向指挥所）、可复现 | 寻路 AI（复杂且不必要） | 规格 FR-018 | FR-018、TD-012 |
| TD-020 | 携带道具的坦克与掉落：每关编队中指定第几辆为携带者（见编队表）；携带者车身上有一个绕车体旋转的金色光环标记（连续旋转，不做明暗闪烁，避免被视为“闪烁”）；被消灭时在其位置掉落道具，种类按本关携带者序号交替：奇数序号护盾、偶数序号火力升级；道具停留到被拾取或本关结束（A-3） | 可辨认且符合 FR-039 不闪烁；掉落确定，便于测试 | 随机掉落种类（测试不可确定） | 规格 FR-020、FR-027、A-3、A-11 | FR-020、FR-027 |
| TD-021 | 测试工具：单元测试 Vitest（Node 环境，只测 `game/`、`storage/`、`render/palette` 与音效配方数据）；集成测试 `@playwright/test@1.65.1` + 预装 Chromium，对 Vite 开发服务器运行；ESLint（`typescript-eslint` 推荐规则）与 `tsc --noEmit` 作静态检查 | Vitest 与 Vite 同配置；Playwright 版本与 Pod 预装浏览器一致，免下载 | Jest（需额外 TS 转换配置）；Cypress（Pod 未预装） | 实验 E-1（U-1） | 全部 |

## 技术先后依赖

- `src/game/config.ts`、`src/game/types.ts`（实体、事件与快照类型）必须先于 `game/` 其余模块、`render/`、`audio/`、`app/`，因为后者都按这些类型消费模拟状态与事件。
- `src/render/palette.ts` 必须先于所有精灵绘制代码（`render/sprites/*`）与 `src/styles/main.css` 中的配色变量，因为 TD-004 要求全部颜色只从调色板取，CSS 变量由同一份调色板值写出。
- 模拟层的事件类型（`GameEvent`）必须先于音频层与特效层，因为音效与特效只按事件触发，事件名是两者共同的契约。
- 诊断快照的结构（`SteelDefenseSnapshot`，见“Interface 与契约”）必须先于集成测试，因为集成测试与独立测试都通过它判定状态。
- `package.json` 中的脚本名（`lint`、`typecheck`、`build`、`test:unit`、`test:integration`）必须先于 `runtime/deployment.json` 中的开发者命令生效，因为开发者命令直接调用这些脚本；`@playwright/test` 必须锁定 1.65.1，否则与 Pod 预装的 chromium-1255 不匹配（实验 E-1）。
- `Dockerfile` 与 `deploy/nginx.conf` 必须在 `npm run build` 能产出 `dist/` 之后才能通过部署前构建，因为镜像的第二阶段从第一阶段复制 `dist/`。

## 领域与数据模型

### 模拟状态（`src/game/types.ts`，内存中）

| 实体 | 关键字段 | 说明 |
|---|---|---|
| `GameState` | `screen`、`level`(1～5)、`score`、`lives`、`enemiesRemaining`、`enemiesSpawned`、`timeMs`、`rngSeed` | `enemiesRemaining = 本关总数 − 已消灭数`（含未出场），不变量见规格 |
| `MapGrid` | `cols=13`、`rows=13`、`cells: Uint8Array(52×52)` | 每个单元取值 `0 空地 / 1 砖 / 2 钢 / 3 水`；单元边长 = 1/4 格 |
| `Base` | `x, y`（格坐标）、`destroyed` | 2×2 个单元占位的中心在底行第 7 列；任何子弹命中即 `destroyed=true` 并触发 `gameOver` |
| `Tank` | `id`、`side: 'player'|'enemy'`、`type: 'player'|'normal'|'fast'|'heavy'`、`x, y`（格坐标，左上角）、`dir: 'up'|'down'|'left'|'right'`、`moving`、`hp`、`maxHp`、`carrier`、`fireCooldownMs`、`recoilMs`、`treadPhase` | 玩家另有 `shieldMs`、`firepower: 0|1`、`maxBullets` |
| `Bullet` | `id`、`owner: 'player'|'enemy'`、`ownerId`、`x, y`、`dir`、`speed` | 拖尾由渲染层按历史位置绘制，模拟层不保存 |
| `PowerUp` | `id`、`type: 'shield'|'firepower'`、`x, y` | 停留到被拾取或本关结束 |
| `GameEvent` | `type` + 负载 | `fire`、`brickHit`、`steelHit`、`tankHit`（未消灭，含护盾挡下）、`explode`（`target: 'tank'|'base'`）、`pickup`（`powerUp`）、`lifeLost`、`scoreChanged`、`enemySpawned`、`levelClear`、`gameOver`、`victory` |

### 持久化

只有一项：`localStorage["steel-defense.highScore.v1"]`，十进制非负整数字符串（TD-013）。没有服务端数据，没有迁移。

### 关卡编队表（`src/game/levels.ts`）

| 关 | 敌人总数 | 普通 | 快速 | 重甲 | 较强类型合计 | 携带道具的出场序号 |
|---|---|---|---|---|---|---|
| 1 | 10 | 7 | 2 | 1 | 3 | 4、8 |
| 2 | 12 | 7 | 3 | 2 | 5 | 4、9 |
| 3 | 14 | 7 | 4 | 3 | 7 | 3、8、12 |
| 4 | 16 | 7 | 5 | 4 | 9 | 3、8、13 |
| 5 | 18 | 7 | 6 | 5 | 11 | 3、7、11、15 |

总数逐关递增；快速、重甲各自逐关不减；第 5 关较强类型（11）多于第 1 关（3）（AC-11、R8）。出场顺序在每关数据中写成固定序列（例如第 1 关 `N N F N N H N F N N`），较强类型分布在中后段。5 张地图由编码按以下设计约束原创绘制：每张都同时含砖、钢、水三种地形；指挥所三面砖墙包围；玩家出生点与指挥所之间、敌人出生点下方至少各有一条无钢/水阻断的通路；5 张布局两两不同（单元测试比较字符串）；不得复刻任何现有游戏的关卡。

## Component 边界与项目结构

Coding 会创建的路径（全部新增）：

- `./package.json`、`./package-lock.json`、`./tsconfig.json`、`./vite.config.ts`、`./vitest.config.ts`、`./playwright.config.ts`、`./playwright.e2e.config.ts`、`./eslint.config.js`、`./.gitignore`、`./.dockerignore`
- `./index.html`：页面骨架（标题、怎么玩、浮层、HUD、画布、操作区的静态 DOM 与无障碍属性）
- `./Dockerfile`：多阶段构建（TD-010）
- `deploy/`：`deploy/nginx.conf`（TD-011）
- `src/main.ts`：启动入口（读取 `seed`，调用 `boot()`）
- `src/app/boot.ts`：`boot(root, { seed, startLevel? })` 创建各层、启动主循环、挂载诊断快照；`startLevel` 只由 `tests/integration/harness/` 的测试页传入，`main.ts` 从不传入
- `src/app/`：`screens.ts`（画面状态机与浮层）、`hud.ts`、`controls.ts`（虚拟按键）、`layout.ts`（ResizeObserver 与缩放）、`loop.ts`（主循环与帧统计）、`diagnostics.ts`（只读快照）
- `src/input/`：`keyboard.ts`、`touch.ts`、`input-state.ts`（方向按住栈）
- `src/game/`：`config.ts`、`types.ts`、`rng.ts`、`map.ts`、`levels.ts`、`tanks.ts`、`bullets.ts`、`powerups.ts`、`enemy-ai.ts`、`spawner.ts`、`sim.ts`（`step()` 与规则）
- `src/render/`：`palette.ts`、`sprites/`（坦克、地形、指挥所、道具的预渲染配方）、`renderer.ts`、`terrain-layer.ts`、`particles.ts`、`effects.ts`（炮口火光、击中火花、爆炸、震动、拾取动画、开场幕帘）、`quality.ts`（自适应画质）
- `src/audio/`：`audio-engine.ts`（上下文、总线、解锁、静音）、`cues.ts`（6 种音效配方）、`music.ts`（背景音乐音序器与曲谱）
- `src/storage/`：`high-score.ts`
- `src/styles/`：`main.css`
- `tests/unit/`：Vitest 单元测试
- `tests/e2e/`：开发者端到端用例（不进开发者命令）
- `tests/integration/`：Playwright 集成测试与 `tests/integration/harness/`（只在开发服务器上可访问的测试页，用于以指定起始关挂载应用，不进入构建产物）
- `docs/`：`docs/dependencies.json`、`docs/deployment.json`（本步骤已写出）

不创建：后端、数据库、CI 工作流、云 IaC。

## 数据流、状态、并发与生命周期

- **启动**：`index.html` 加载单个 JS 包 → 读取 URL `seed` → 读取最高分 → 预渲染精灵（同步，约数十毫秒，在首帧前完成，避免首帧闪现未绘制内容）→ 显示开始画面 → 启动 `requestAnimationFrame` 主循环（开始画面背景中也绘制一张静态地图作为装饰）。
- **每帧**：`loop.ts` 取 rAF 时间戳 → 累加器推进 0～4 个模拟步（每步 1000/60ms）→ 收集事件 → 分派给特效、音频、HUD、存储 → 渲染（插值）→ 更新帧统计。只有 `playing` 状态推进 `sim.step`；`levelIntro`/`levelClear` 等状态只推进动画计时。
- **并发**：浏览器单线程；音乐调度器用 `setInterval`，只读主循环共享的静音标志，不修改游戏状态。不使用 Worker。
- **生命周期**：标签页隐藏时 rAF 暂停，回到可见时帧间隔截断为 250ms（只补 4 步），不“快进”；页面关闭不需要清理（最高分已同步写入）。新一局重置 `GameState`（第 1 关、分数 0、生命 3），最高分保留。
- **画面时序**：`levelIntro` 1800ms（含幕帘动画）→ `playing`；最后一辆敌人被消灭后等待爆炸动画 1200ms → `levelClear` 2000ms → 下一关 `levelIntro` 或 `victory`；指挥所被击中或生命为 0 → 爆炸动画 1200ms → `gameOver`。`gameOver`/`victory` 停留到玩家点击“返回开始画面”。上述时长写在 `config.ts`。

## Interface 与契约（Contract）

本应用没有服务端 API。对外契约是：页面 DOM 的无障碍角色与可见名称、键盘与触摸输入、URL 参数、只读诊断快照、`localStorage` 键、HTTP 静态资源与健康检查。契约的代码位置：DOM 在 `index.html`，快照类型在 `src/app/diagnostics.ts`（类型 `SteelDefenseSnapshot`），数值在 `src/game/config.ts`，关卡在 `src/game/levels.ts`。

### HTTP（容器 `web`，端口 8080）

| 路径 | 结果 |
|---|---|
| `GET /` | `index.html`，200，`Cache-Control: no-cache` |
| `GET /assets/*` | 带哈希的 JS/CSS，200，长期缓存 |
| `GET /healthz` | 200，正文 `ok`，不写访问日志 |
| 其他不存在路径 | 404（不写错误日志） |

### 输入

| 输入 | 作用（仅 `playing` 状态） |
|---|---|
| `ArrowUp`/`KeyW`、`ArrowDown`/`KeyS`、`ArrowLeft`/`KeyA`、`ArrowRight`/`KeyD`（按 `event.code`） | 按住移动，松开停止；多键按“最后按下优先” |
| `Space` | 开火；按住时子弹可用即连续开火 |
| 虚拟按键“向上/向下/向左/向右” | 同方向键；手指在方向键之间滑动即切换方向 |
| 虚拟按键“开火” | 同空格 |

### URL 参数

`?seed=<0～4294967295 的整数>`：随机种子；非法或缺省时随机生成。不接受其他参数。

### 页面元素的无障碍角色与可见名称

全部文字为中文（A-15）。独立测试按角色 + 名称定位，不按样式或结构。

| 元素 | 角色 | 可访问名称 / 文本 | 说明 |
|---|---|---|---|
| 页面标题 | `heading` level 1 | `钢铁防线` | 始终可见（页面顶部） |
| 静音按钮 | `button` | `静音`；`aria-pressed="false|true"` | 始终可见；按下状态下图标变为静音样式 |
| “怎么玩”说明 | `region` | `怎么玩`（含 `heading`“怎么玩”） | 开始画面内；电脑宽屏下另在右侧面板常驻。内容：方向键或 W/A/S/D 移动、空格开火；手机按住屏幕下方方向键移动、松开即停，按开火按钮发射；目标：消灭本关全部敌方坦克、守住指挥所；提示句“手机处于静音模式等系统原因时，可能听不到音效。” |
| 开始画面 | `dialog` | `开始画面` | 含标题、说明、开始按钮、历史最高分 |
| 开始按钮 | `button` | `开始游戏` | |
| 历史最高分 | `status`（`<output>`） | `历史最高分`；文本为整数 | 出现在开始画面、失败画面、全部通关画面 |
| 关卡开场提示 | `dialog` | `关卡开场`；文本含 `第 N 关` 与 `敌人 M 辆` | |
| 过关画面 | `dialog` | `过关`；文本含 `第 N 关 过关` | |
| 失败画面 | `dialog` | `失败` | 含 `本局分数`、`历史最高分` 两个 `status` 与按钮 `返回开始画面` |
| 全部通关画面 | `dialog` | `全部通关` | 同上 |
| 返回按钮 | `button` | `返回开始画面` | |
| HUD 容器 | `group` | `战况` | 地图上方 |
| HUD 数值 | `status`（`<output>`） | `关卡`、`分数`、`生命`、`剩余敌人`；文本为整数 | 在 `levelIntro`、`playing`、`levelClear` 期间可见 |
| 地图画布 | `img` | `战场` | Canvas |
| 道具拾取提示 | `status` | `道具提示`；文本 `护盾` 或 `火力升级` | 显示 1500ms 后淡出 |
| 虚拟方向键容器 | `group` | `方向键` | 只在 `(pointer: coarse)` 时显示 |
| 虚拟方向键 | `button` | `向上`、`向下`、`向左`、`向右` | |
| 开火按钮 | `button` | `开火` | 只在 `(pointer: coarse)` 时显示 |
| 横屏提示 | `alertdialog` | `请旋转手机`；文本“请将手机竖过来玩” | 只在 `(pointer: coarse) and (orientation: landscape)` 时显示 |

浮层（`dialog`）在过渡期间带属性 `data-transition="entering|leaving"`，过渡结束后去掉该属性；不可见的浮层带 `hidden`。

### 只读诊断快照 `window.steelDefense`

`window.steelDefense` 为冻结对象 `{ version: string, snapshot(): SteelDefenseSnapshot }`。`snapshot()` 返回当时状态的深拷贝（纯数据，可 `JSON.stringify`），调用它不改变任何状态；没有任何写入方法。坐标单位为“格”（左上角为 0,0，向右为 x、向下为 y）。

```ts
interface SteelDefenseSnapshot {
  screen: 'start' | 'levelIntro' | 'playing' | 'levelClear' | 'gameOver' | 'victory';
  transitioning: boolean;            // 浮层或幕帘过渡动画进行中
  seed: number;
  level: number; score: number; lives: number; enemiesRemaining: number; highScore: number;
  levelInfo: { total: number; byType: { normal: number; fast: number; heavy: number } };
  levels: Array<{ level: number; total: number; byType: { normal: number; fast: number; heavy: number }; layout: string[] }>; // 5 关静态数据，layout 为 13 行字符串
  player: null | { x: number; y: number; dir: Dir; moving: boolean; shieldMs: number; firepower: 0 | 1; maxBullets: number; speed: number; recoilMs: number; treadPhase: number };
  enemies: Array<{ id: number; type: 'normal' | 'fast' | 'heavy'; x: number; y: number; dir: Dir; moving: boolean; hp: number; maxHp: number; speed: number; carrier: boolean }>;
  bullets: Array<{ id: number; owner: 'player' | 'enemy'; x: number; y: number; dir: Dir; speed: number }>;
  powerUps: Array<{ id: number; type: 'shield' | 'firepower'; x: number; y: number }>;
  base: { x: number; y: number; destroyed: boolean };
  map: { cols: 13; rows: 13; unitsPerTile: 4; cells: string[] };  // 52 行，每字符一个单元：'.' 空 'B' 砖 'S' 钢 'W' 水
  effects: { particles: number; shakeMs: number; muzzleFlashes: number; hitSparks: number; explosions: number; pickupAnims: number; trails: number };
  audio: { state: 'none' | 'suspended' | 'running' | 'closed' | 'interrupted'; muted: boolean; masterGain: number; musicPlaying: boolean;
           cues: Array<{ name: 'fire' | 'hit' | 'explosion' | 'pickup' | 'levelClear' | 'gameOver'; atMs: number }> }; // 最近 50 次
  perf: { fps: number; maxFrameGapMs: number; frames: number; quality: 'high' | 'medium' | 'low' }; // 最近 5 秒窗口
  input: { direction: Dir | null; fire: boolean; lastResponseMs: number | null }; // 最近一次按下到模拟中坦克开始响应的毫秒数（按 event.timeStamp 与响应时的 performance.now 计算）
}
type Dir = 'up' | 'down' | 'left' | 'right';
```

### 事件 → 音效 → 特效映射

| 模拟事件 | 音效 cue | 视觉效果 |
|---|---|---|
| `fire` | `fire` | 炮口火光（3 帧放射状光斑，约 80ms）、炮管后坐（沿车头反方向缩回 0.08 格，120ms 回弹） |
| `brickHit` | `hit` | 6～10 个砖色碎屑粒子沿反弹方向飞散并下落淡出；被清除单元立即从砖墙层擦除 |
| `steelHit` | `hit` | 白黄色火花放射（8 粒子）+ 圆形冲击闪光 |
| `tankHit`（未消灭；含护盾挡下） | `hit` | 同钢墙火花 + 被击坦克精灵闪白 1 帧组（100ms，使用预渲染的受击版本，不改变可见性）；护盾时护盾泡泡波纹扩散 |
| `explode`（坦克/指挥所） | `explosion` | 火光（橙黄径向渐变扩散 400ms）+ 烟雾（8～14 个灰色粒子缓慢上升扩散 1200ms）+ 屏幕震动（坦克 250ms、振幅 0.08 格；指挥所 500ms、0.15 格，衰减） |
| `pickup` | `pickup` | 道具放大淡出 + 光环扩散（400ms）+ “道具提示”文字 |
| `levelClear` | `levelClear` | 过关浮层 |
| `gameOver` | `gameOver` | 失败浮层 |

移动中的坦克每移动 0.125 格履带相位 +1（4 相位循环），停止时相位不变；子弹拖尾为最近 6 个位置的渐隐线段。

### 音效配方（`src/audio/cues.ts`，均为原创合成）

| cue | 配方要点 | 时长 |
|---|---|---|
| `fire` | 白噪声经带通（1.8kHz）快速衰减 + 方波 220→90Hz 下滑 | 0.12s |
| `hit` | 三角波 1400Hz + 2100Hz 金属叮声，指数衰减 | 0.15s |
| `explosion` | 白噪声经低通（1.2kHz→200Hz 扫频）+ 正弦 60Hz 低频冲击 | 0.9s |
| `pickup` | 正弦琶音 C6-E6-G6-C7 上行，每音 60ms | 0.3s |
| `levelClear` | 方波+三角波大调四音号角（G4-C5-E5-G5，末音延长） | 1.2s |
| `gameOver` | 锯齿波经低通的小调下行三音（E4-C4-A3），慢颤音 | 1.4s |

背景音乐：原创 8 小节循环，112 BPM，低音（三角波）+ 军鼓感噪声打击 + 方波主旋律（低通），只在 `levelIntro`/`playing`/`levelClear` 期间播放，在 `gameOver`/`victory` 停止。音乐总线增益 0.3，低于音效总线 1.0（FR-041）。

## 可测性约定

项目此前没有系统现状与可测性约定，以下全部为本次新增。

### 接口契约的位置

见上节“Interface 与契约”：DOM 契约在 `index.html`；快照类型 `SteelDefenseSnapshot` 在 `src/app/diagnostics.ts`；数值在 `src/game/config.ts`；关卡与编队在 `src/game/levels.ts`；音效配方在 `src/audio/cues.ts`。测试只按角色 + 可访问名称定位 DOM，只按快照字段判定 Canvas 内的状态。

### 为可测性新增的产品能力及理由（TD-012）

- 只读快照 `window.steelDefense.snapshot()`：Canvas 内的坦克位置与朝向、砖块单元、子弹、道具、敌人类型与血量、护盾时间、特效计数、音频状态与已播放 cue、帧统计，没有任何无障碍角色可以表达；没有它，AC-6～AC-13、AC-16、AC-17、AC-19、AC-20、AC-23 只能靠截图像素比对，结果受 DPR、动效相位影响而不稳定。快照只读、对玩家不可见、不含任何个人数据、不改变任何产品行为。
- `?seed=`：敌人移动与开火由随机数决定；固定种子使同一操作序列得到同一局面，测试与缺陷复现可重复。
- 不新增任何写入型能力（不提供“直达第 N 关”“加命”“清场”等）：需要快速到达后面关卡的验证由开发者检查 IT-07 覆盖（只在开发服务器上的测试页，不进入产物），是否为测试环境另加入口见开放决策 OD-3。

### 造数与清理

- 本应用唯一的持久数据是浏览器本地的历史最高分。每个测试用自己的浏览器上下文（Playwright `browser.newContext()`），上下文之间存储隔离；测试结束丢弃上下文即清理。
- 允许测试直接改动的“库”：仅 `localStorage` 键 `steel-defense.highScore.v1`，且只在测试自己创建的浏览器上下文中（例如用 `context.addInitScript` 或在页面中 `localStorage.setItem` 预置一个十进制非负整数，用于验证开始画面显示历史最高分，或预置一个较小值后验证超过时被更新）。理由：通过游玩累积到指定分数耗时长且不确定。不得写入非法值（非法值的处理由单元测试覆盖）。
- 其余局面（关卡、敌人、道具）只能通过公开入口游玩产生：`?seed=` 固定随机性 + 键盘/触摸输入 + `page.clock` 推进时间。

### 时间与随机性的控制

- 时间：游戏的全部计时（主循环、模拟步、画面状态机时长、道具与护盾计时、提示消失）都来自 `requestAnimationFrame` 时间戳与 `performance.now()`，浮层切换也由主循环时钟驱动、不用 `setTimeout`（背景音乐调度器的 `setInterval` 只排音符，不影响游戏状态）；因此测试可在 `page.goto` 之前 `await page.clock.install()`，再 `await page.clock.pauseAt(...)`，之后用 `page.clock.runFor(ms)` 确定地推进（实验 E-2：暂停后 rAF 约每 16ms 触发一次，`performance.now` 精确前进）。注意：CSS 过渡的视觉部分按真实时间播放，不受时钟控制；判定“过渡正在进行”用快照 `transitioning` 或浮层的 `data-transition` 属性。`Date.now()` 不参与游戏逻辑。
- 帧率与延迟（AC-23）的测量不要安装伪时钟，按真实时间运行后读取快照 `perf` 与 `input.lastResponseMs`。
- 随机：`?seed=<整数>`；快照 `seed` 给出实际使用的种子。同一种子 + 同一输入序列 + 同一时钟推进 → 同一局面（模拟层只用种子化 PRNG，不调用 `Math.random`）。

### 手机与电脑的模拟

- 手机竖屏：Playwright 上下文 `{ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }`（360/430 宽同理），此时 `(pointer: coarse)` 匹配，虚拟按键显示（实验 E-3）。虚拟按键需按住：用 `locator.dispatchEvent('pointerdown', {pointerId: 1, pointerType: 'touch', isPrimary: true})`，松开用 `pointerup`；或 `page.touchscreen.tap()` 用于开火与开始按钮。
- 手机横屏：同上，视口宽高互换，显示 `alertdialog`“请旋转手机”。
- 电脑：普通上下文，视口宽 ≥ 1024，虚拟按键不显示。
- 音频：在无头 Chromium 中点击/触摸“开始游戏”后快照 `audio.state` 为 `running`（实验 E-1）；“能否听到”在真机上的验证不属于自动化范围，独立测试可按快照 `audio.state=running`、`masterGain=1`、`cues` 记录判定声音已在播放。

### 开发者检查（写在 `runtime/deployment.json`，独立测试可引用）

| 类别 | 命令 | 全量用时 | 验证什么 |
|---|---|---|---|
| `staticAnalysis` | `npm run lint`、`npm run typecheck` | 约 20 秒（估计） | ESLint 规则与 TS 严格类型检查 |
| `build` | `npm run build` | 约 15 秒（估计） | 产出 `dist/`；构建脚本同时检查产物中不含 `tests/` 下的测试页 |
| `developerTests` | `npm run test:unit`（Vitest，Node 环境） | 约 20 秒，约 150 个用例（估计） | 见下表 UT-* |
| `integrationTests` | `npm run test:integration`（Playwright + 预装 Chromium，自启 Vite 开发服务器） | 约 3 分钟，约 15 个用例，单个 5～15 秒，IT-05 约 25 秒（估计） | 见下表 IT-* |

仓库此前没有测试说明，以上用时均为估计。

| 检查 | 所在 | 验证什么（对应验收标准） |
|---|---|---|
| UT-terrain | `tests/unit/terrain.test.ts` | 子弹击中砖墙清除 2×4 单元、被清除处坦克可通过；钢墙不变；坦克不能入水、子弹飞过水面；边界（AC-6） |
| UT-enemies | `tests/unit/enemies.test.ts` | 快速型速度 ≥ 1.5×普通型；重甲型需 ≥2 次命中；分批出场、同时最多 4 辆（AC-7） |
| UT-base-lives | `tests/unit/rules.test.ts` | 玩家或敌方子弹击中指挥所即 `gameOver`；被击中减命、在出生点朝上重生、生命 0 失败；护盾期间不减命；护盾期间指挥所被击中仍失败（AC-8、AC-9、AC-12） |
| UT-flow | `tests/unit/flow.test.ts` | 全灭 → `levelClear` → 下一关；第 5 关 → `victory`；新一局重置；分数与生命带入下一关（AC-10、AC-13） |
| UT-levels | `tests/unit/levels.test.ts` | 5 关；总数递增；快速、重甲各自不减；第 5 关强敌多于第 1 关；布局两两不同；每关含砖/钢/水；指挥所三面砖墙；出生点到指挥所有通路（AC-11） |
| UT-powerups | `tests/unit/powerups.test.ts` | 携带者掉落、种类交替、拾取生效、护盾 10 秒后失效、火力升级速度与并发、失去生命后火力升级失效（AC-12） |
| UT-highscore | `tests/unit/high-score.test.ts` | 超过即保存；非法值视为 0；存储抛异常时不影响游戏（AC-14） |
| UT-art | `tests/unit/art.test.ts` | 所有精灵配方只引用调色板；玩家与三种敌人的主色两两不同、轮廓配方两两不同；投影偏移与描边宽度全局一致（AC-15） |
| UT-input | `tests/unit/input.test.ts` | 方向按住栈“最后按下优先”与松开回退；非 `playing` 状态忽略输入（A-4、A-9） |
| IT-01 音效互异 | `tests/integration/audio-cues.spec.ts` | 在真实 Chromium 中用 `OfflineAudioContext` 渲染 6 种 cue，两两比较时长、能量包络与频谱质心，均有显著差异（AC-19） |
| IT-02 解锁与静音 | `tests/integration/audio-mute.spec.ts` | 点击开始后 `audio.state=running`、音乐在播放；点静音后主增益为 0 且分析节点输出静默；再点恢复（AC-20、AC-21 的自动化部分） |
| IT-03 布局 | `tests/integration/layout.spec.ts` | 1024×768、1280×800、360×640、390×844、430×932 下无横向滚动、画布完整在视口内；手机竖屏虚拟按键与画布、HUD 的矩形不相交；横屏显示旋转提示（AC-5、AC-22） |
| IT-04 输入响应 | `tests/integration/input-latency.spec.ts` | 键盘与触摸按下到响应 ≤100ms、松开后下一个模拟步停止（AC-23） |
| IT-05 帧间隔 | `tests/integration/frame-pacing.spec.ts` | 固定种子游玩第 1 关 20 秒，`perf.maxFrameGapMs < 100`、`fps ≥ 55`；无头环境只作回归信号（AC-23） |
| IT-06 最高分持久 | `tests/integration/high-score.spec.ts` | 同一上下文中得分超过后重新加载页面，开始画面显示该分数（AC-14） |
| IT-07 末关与全部通关 | `tests/integration/victory.spec.ts` | 用开发服务器测试页以第 5 关开局并由测试页消灭全部敌人，出现“全部通关”画面，显示本局分数、历史最高分与“返回开始画面”（AC-10、AC-18） |
| IT-08 过渡 | `tests/integration/transitions.spec.ts` | 开始→开场→游戏→失败→开始各切换都出现 `data-transition`，过渡结束前后两个浮层不会同时完全不可见（AC-18、AC-23 不闪烁） |

### 端到端用例

端到端用例放在 `tests/e2e/`，不进开发者命令。单独运行一个：`E2E_BASE_URL=<地址> npx playwright test -c playwright.e2e.config.ts tests/e2e/<文件> -g "<用例名>"`；不设 `E2E_BASE_URL` 时自启 `vite preview`（先 `npm run build`）。预计约 8 个用例（开始与说明、电脑一关流程、手机一关流程、失败与返回、道具拾取、静音、最高分、横屏提示），单个约 15～40 秒（估计）。

### 并行与隔离

- Vitest 默认多线程并行，单元测试是纯函数，无共享状态。
- Playwright 集成测试 `workers: 2`，所有用例共用一个由 `webServer` 启动的 Vite 开发服务器（无状态静态服务）；端口取环境变量 `IT_PORT`（缺省 5174，`strictPort`），同一 Pod 内同时运行两套测试时各设不同端口。每个用例使用新的浏览器上下文，`localStorage` 互不可见。
- 无外部依赖，不存在与 `dev` 实例共用的问题。

## 安全、隐私、身份与 Secret

- 无账号、无身份、无服务端数据；没有任何凭据、密钥或应用机密，`docs/dependencies.json` 的 `secrets` 为空。
- 浏览器端只保存一个整数（历史最高分），不收集、不上传任何个人信息；应用不发起任何网络请求（CSP `connect-src 'self'`，且代码中没有 `fetch`/`XMLHttpRequest` 调用）。
- 输入验证：URL `seed` 只接受 0～4294967295 的整数；`localStorage` 读值按 TD-013 校验；DOM 文本一律用 `textContent` 写入，不使用 `innerHTML` 拼接任何外部输入。
- 容器：非 root（UID 101），只提供静态文件，`server_tokens off`，安全响应头见 TD-011。
- 日志：nginx 访问日志只含请求行、状态码、UA 与客户端地址（网关转发地址），不含请求体；应用没有其他日志。

## 配置、可观测性与运维

- 运行时无配置项、无环境变量；构建时无机密。
- 日志：nginx 访问日志写 stdout（沿用镜像默认的 `main` 格式，即 `$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent ...`），错误日志写 stderr（镜像默认）；错误级别 `warn`。
- 错误日志识别规则（`docs/deployment.json` 的 `operations.errorLogRules`），按 nginx 实际错误日志写法 `YYYY/MM/DD HH:MM:SS [level] pid#tid: message`：
  - `nginx-error`：`kind: pattern`，正则 `\[(?:error|crit|alert|emerg)\] \d+#\d+: (?:\*\d+ )?(?<message>.*)`，严重度 `high`，出现一次即报告。因为 `log_not_found off`，扫描器请求不存在的文件不会产生 `[error]` 行，出现即表示配置或文件缺失等真实问题。
  - `nginx-server-5xx`：`kind: pattern`，访问日志中状态码为 5xx 的行，正则 `"\s(?<message>5\d\d)\s\d+\s"`（匹配默认 `combined` 格式请求行之后的状态码），严重度 `medium`，5 分钟内 3 次才报告。静态服务正常不会出现 5xx。
- 浏览器端没有遥测（不在需求内，也不允许对外发送请求）。

## SLO、限制、扩缩容、重试与恢复

- 性能目标来自 NFR-001/NFR-002：按下到响应 ≤100ms（设计值约 34ms），60 帧左右、无单次 >100ms 停顿；首屏 JS+CSS 目标 gzip 后 ≤ 150KB（无图片与音频文件）。
- 服务端为静态文件，单副本即可；无重试逻辑。
- 恢复：页面刷新即回到开始画面；音频上下文被系统中断（iOS 来电等）时在下一次用户手势恢复（TD-007）。

## 部署拓扑、迁移、Rollout 与 Rollback

- 拓扑：一个对外服务 `web`（`Dockerfile`，端口 8080，`/healthz`），无内部服务、无依赖。
- 迁移：无。`localStorage` 键带 `v1` 版本，将来改格式时换新键并在读取时兼容旧键。
- Rollout：平台按 `docs/deployment.json` 构建并部署；`index.html` `no-cache` 保证新版本下次打开即生效，旧哈希资源仍在旧镜像中，不存在新旧混用（单副本整体替换）。
- Rollback：重新部署上一个提交的镜像即可；没有数据或状态需要回退，玩家的最高分保留在其浏览器中不受影响。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| 静态检查、构建 | 编码（每批）与部署前验证 | Agent Pod / 同镜像 Runner | 无 | `npm run lint`、`typecheck`、`build` 通过 | 部署前验证记录 |
| 单元测试 | 编码（每批）与部署前验证 | 同上 | 无 | `npm run test:unit` 通过 | `developerChecks` 中的 `developerTests` |
| 集成测试（真实 Chromium） | 编码（每批）与部署前验证 | 同上，`localhost` Vite 开发服务器 | 无 | `npm run test:integration` 通过 | `developerChecks` 中的 `integrationTests` |
| 端到端（开发者自测） | 编码 | Agent Pod，`vite preview` | 无 | 新写用例单独运行通过 | — |
| 独立测试（验收） | 测试环境（G3） | `cand-*` 命名空间中的 `web` 服务 HTTPS 地址 | 无 | — | qa-run 结果 |
| 真机体验（手机声音、真机帧率、虚拟按键手感） | UAT（人） | 真实手机浏览器访问测试环境 | 无 | — | 人工确认；H-1 在此验证 |

## 快速验证指南（Quickstart）

### 本地运行（编码完成后）

```bash
npm ci
npm run dev                 # http://localhost:5173/?seed=1
npm run build && npx vite preview --port 4173
curl -s localhost:4173/     # 返回 index.html
```

容器（平台用 ACR Tasks 构建，本地不要求）：`Dockerfile` 第一阶段 `npm ci && npm run build`，第二阶段复制 `dist/` 与 `deploy/nginx.conf`；`GET /healthz` → `200 ok`。

### 实验复现（实验文件放在仓库外的临时目录，已删除）

**实验 E-1（U-1、U-2、U-3，约 6 分钟）**

1. `echo $PLAYWRIGHT_BROWSERS_PATH; ls /ms-playwright` → `/ms-playwright`，含 `chromium-1255`、`chromium_headless_shell-1255`、`firefox-1572`、`webkit-2388`。
2. 临时目录中 `npm i @playwright/test@1.65.1`，查看 `node_modules/playwright-core/browsers.json` 中 chromium 的 `revision` → `"1255"`，与预装一致，`chromium.launch()` 无需下载即可启动。
3. 脚本：`chromium.launch()`，上下文 `{viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true}`，用 CDP `Emulation.setCPUThrottlingRate {rate:4}`；页面为 832×832 Canvas，每帧 `drawImage` 169 个预渲染 64×64 渐变描边精灵、24 个带 `shadowOffset` 阴影并旋转的精灵、400 个半透明圆形粒子；运行 3 秒，丢弃前 30 帧，统计帧间隔 → `frames 149 median 16.7 p95 16.7 max 16.8`。
4. 同一页面 `page.tap('#b')`，按钮 `click` 处理函数中 `new AudioContext()` 并 `resume()` → `state` 两次读取均为 `running`。

**实验 E-2（U-4，约 2 分钟）**

```js
const p = await browser.newPage();
await p.clock.install({ time: 0 });
await p.goto('data:text/html,<p>x</p>');
await p.clock.pauseAt(1000);
await p.evaluate(() => { window.n = 0; window.t0 = performance.now(); (function l(){ n++; requestAnimationFrame(l); })(); });
await p.clock.runFor(1000);
await p.evaluate(() => [n, performance.now() - t0]);   // 观察：[64, 1000]
```

对照：只 `install()` 不 `pauseAt()` 时，`runFor(1000)` 后 `performance.now()` 前进 1811ms（时间继续自然流逝），所以确定性推进必须先 `pauseAt`。

**实验 E-3（U-6，约 2 分钟）**

分别以 `{viewport:1280×800}`、`{390×844, isMobile, hasTouch, dsf 3}`、`{844×390, isMobile, hasTouch, dsf 3}`、`{390×844, hasTouch}` 建上下文，读取 `matchMedia('(pointer: coarse)')`、`('(orientation: landscape)')` → 桌面 `coarse:false`；手机竖屏 `coarse:true, landscape:false`；手机横屏 `coarse:true, landscape:true`；只开 `hasTouch` `coarse:true`。

## 支持 Runbook

| 现象 | 排查 | 处理 |
|---|---|---|
| 健康检查失败 | 看容器 stderr 中 nginx `[emerg]` 行（通常是配置语法或端口） | 修正 `deploy/nginx.conf`；确认监听 8080 |
| 错误日志规则 `nginx-error` 报告 | 读 `message`，多为文件缺失（构建产物未复制） | 检查 Dockerfile 复制 `dist/` 的路径 |
| 手机上没有声音 | 确认系统未静音、已点击“开始游戏”；快照 `audio.state` | `suspended`/`interrupted` 时再触摸一次页面即恢复（TD-007） |
| 手机上帧率低 | 快照 `perf.quality` 是否已降级；`perf.fps` | 记录机型与浏览器版本，按 H-1 的验证步骤调整降级阈值 |
| 新版本未生效 | `index.html` 响应头应为 `no-cache` | 检查 nginx 缓存头配置 |
| 最高分丢失 | 是否清除了浏览器数据 / 隐私模式 | 属预期（规格 A-7、意图假设） |

## 开放决策

### 待验证假设

- **H-1 真机帧率**：假设 Canvas 2D 方案（TD-002、TD-003、TD-005）在主流中低端手机（近 3 年的安卓 Chrome、iOS Safari）上能维持约 60 帧、无单次 >100ms 停顿。
  - 已做的尝试：实验 E-1 在无头 Chromium、CPU 降速 4 倍、DPR 3 下，以高于本游戏峰值的绘制量测得帧间隔最大 16.8ms。
  - 还缺什么：真实移动 GPU、合成器与浏览器省电策略下的数据（本会话无真机）。
  - 验证步骤：测试环境部署后，在一台安卓手机 Chrome 与一台 iPhone Safari 上打开 `?seed=1` 连续游玩第 1 关与第 5 关，在浏览器远程调试控制台执行 `steelDefense.snapshot().perf`，确认 `fps ≥ 55` 且 `maxFrameGapMs < 100`，并记录 `quality`。
  - 失败时的后备：TD-005 的自适应画质已内置（降低 DPR 与粒子数量，不去掉任何规格要求的效果）；若降到 `low` 仍不达标，改为把静态地形与砖墙层合并为一张缓存位图、每帧只重绘动态层，仍不达标时再以 `decide` 提交技术负责人决定是否引入 WebGL 渲染。此假设不改变产品行为，不需要人在 G2 预先决定。

### 需要人决定的事项

无（本次没有改变已确认产品行为的技术取舍；`asks` 为空）。

### 建议，未纳入，待 G2 决定

- **OD-1**（建议，未纳入，待 G2 决定）：手机从竖屏转为横屏、显示旋转提示期间暂停游戏，转回竖屏后继续。规格只要求“显示旋转提示”，没有暂停；不暂停时玩家转屏期间可能失去生命。本方案按规格不暂停。
- **OD-2**（建议，未纳入，待 G2 决定）：标签页切到后台再回来时，自动停在开始前的一个“继续”提示。当前技术行为是后台时主循环随 rAF 停止、回来后从停下处继续（不快进），没有额外提示。
- **OD-3**（建议，未纳入，待 G2 决定）：为测试环境增加只读以外的可测性入口（例如 `?startLevel=N` 直接从第 N 关开局），让独立测试在测试环境公开入口上快速验证第 2～5 关与全部通关画面。不加时，这部分由开发者检查 IT-07、UT-flow、UT-levels 覆盖，独立测试也可按固定种子实际游玩到达。加入会成为玩家可用的“选关”能力，与“难度选择等不纳入”的边界接近，因此不自行加入。
