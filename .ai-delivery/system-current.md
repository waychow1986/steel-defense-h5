# 系统现状：钢铁防线（steel-defense-h5）

本文只记录仓库代码中已有的事实，每条注明出处（仓库相对路径）。依据为交付 DLV-20261127-5E4384F51154 第 1 版发布时的分支代码。

## 1. 概述

- 项目是浏览器里运行的俯视角坦克射击小游戏“钢铁防线”，纯前端静态网页，没有后端服务和数据库（出处：`README.md`、`index.html`、`docs/deployment.json`）。
- 页面标题与游戏内标题为“钢铁防线”，页面语言 `zh-CN`（出处：`index.html`）。
- 游戏画面绘制在单个 `<canvas id="battlefield">` 上，界面（标题、状态栏、各画面对话框、虚拟按键）为 DOM 元素（出处：`index.html`、`src/render/renderer.ts`）。
- 包名 `steel-defense-h5`，版本 `0.1.0`；运行时代码中的版本常量 `VERSION = '0.1.0'`（出处：`package.json`、`src/app/boot.ts`）。

## 2. 技术栈与版本

- 语言：TypeScript（`strict`，`target`/`lib` 为 ES2022 + DOM，`moduleResolution: Bundler`，`noEmit`），ES Module（`"type": "module"`）（出处：`tsconfig.json`、`package.json`）。
- Node.js 要求 `>=22`；构建镜像使用 `node:22-alpine`（出处：`package.json` 的 `engines`、`Dockerfile`）。
- 构建工具：Vite，入口 `index.html`，产物目录 `dist`（出处：`vite.config.ts`）。
- 运行时没有任何第三方依赖：`package.json` 只有 `devDependencies`，没有 `dependencies`（出处：`package.json`）。
- 开发依赖（锁定版本取自 `package-lock.json`）：

  | 包 | 声明范围 | 锁定版本 |
  |---|---|---|
  | vite | ^8.4.0 | 8.4.0 |
  | vitest | ^4.1.12 | 4.1.12 |
  | typescript | ^5.9.3 | 5.9.3 |
  | eslint | ^9.39.5 | 9.39.5 |
  | @eslint/js | ^9.39.5 | — |
  | typescript-eslint | ^8.74.0 | 8.74.0 |
  | globals | ^17.14.0 | — |
  | @playwright/test | ^1.65.1 | 1.65.1 |
  | @types/node | ^22.20.7 | — |

  （出处：`package.json`、`package-lock.json`）
- 浏览器 API：Canvas 2D、Web Audio（`AudioContext`，回退 `webkitAudioContext`）、Pointer Events、`localStorage`、`ResizeObserver`（无时回退 `resize` 事件）、`matchMedia`、`crypto.getRandomValues`（出处：`src/render/renderer.ts`、`src/audio/audio-engine.ts`、`src/input/touch.ts`、`src/storage/high-score.ts`、`src/app/layout.ts`、`src/main.ts`）。
- 不使用任何图片、音频素材文件：精灵由 Canvas 代码绘制，音效与背景音乐由 Web Audio 实时合成（出处：`src/render/sprites/*.ts`、`src/audio/cues.ts`、`src/audio/music.ts`）。

## 3. 命令

`package.json` 的 `scripts`（出处：`package.json`）：

| 命令 | 内容 |
|---|---|
| `npm run dev` | `vite` 开发服务器，端口取环境变量 `IT_PORT`，缺省 5173，`strictPort`（出处：`vite.config.ts`） |
| `npm run build` | `tsc --noEmit && vite build && node scripts/check-dist.mjs` |
| `npm run preview` | `vite preview` |
| `npm run lint` | `eslint .` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | `vitest run`（`tests/unit/**/*.test.ts`，Node 环境） |
| `npm run test:integration` | `playwright test -c playwright.config.ts` |
| `npm run test:e2e` | `playwright test -c playwright.e2e.config.ts` |

- `scripts/check-dist.mjs`：构建后检查 `dist/index.html` 存在，且 `dist` 中没有名为 `tests` 的目录、文件名含 `harness` 的文件、或内容引用 `tests/integration/harness` 的 HTML；任一不满足则退出码 1（出处：`scripts/check-dist.mjs`）。
- ESLint 使用 `@eslint/js` 推荐规则 + `typescript-eslint` 推荐规则，全局变量为 browser + node，忽略 `dist/`、`node_modules/`、`test-results/`、`playwright-report/`、`.ai-delivery/`（出处：`eslint.config.js`）。
- 本交付的开发者验证命令：安装 `npm ci --no-audit --no-fund`；静态检查 `npm run lint`、`npm run typecheck`；构建 `npm run build`；开发者测试 `npm run test:unit`；集成测试 `npm run test:integration`（出处：`.ai-delivery/features/001-v1/runtime/deployment.json`）。

## 4. 外部依赖和配置

- 没有外部服务依赖，也没有声明任何 secret：`dependencies` 与 `secrets` 均为空数组（出处：`docs/dependencies.json`）。
- 运行时不发起任何网络请求；内容安全策略 `connect-src 'self'`（出处：`deploy/nginx.conf`；代码中无 `fetch`/`XMLHttpRequest` 调用，见 `src/`）。
- 构建/测试用环境变量：
  - `IT_PORT`：Vite 开发服务器与集成测试的端口（缺省分别为 5173 与 5174）（出处：`vite.config.ts`、`playwright.config.ts`）。
  - `E2E_BASE_URL`：设置时端到端测试直接访问该地址、不启动本地服务；未设置时以 `vite preview` 在 `E2E_PORT`（缺省 4173）启动（出处：`playwright.e2e.config.ts`）。
- 游戏可调数值集中在 `CONFIG` 常量对象（出处：`src/game/config.ts`），主要项：
  - 地图 13×13 格，每格 4×4 个地形单元（`cols`、`rows`、`unitsPerTile`）；坦克边长 0.875 格（`tankSize`）；转向时横轴对齐到 0.5 格网格（`snapGrid`）。
  - 固定步长 `stepMs = 1000/60`，每帧最多 4 步（`maxStepsPerFrame`），帧间隔上限 250ms（`maxFrameGapMs`），性能统计窗口 5000ms（`perfWindowMs`）。
  - 速度（格/秒）：玩家 3.0；敌方普通 2.0、快速 3.5、重甲 1.6。敌方生命值：普通 1、快速 1、重甲 3。得分：普通 100、快速 200、重甲 300。
  - 子弹速度 9，火力升级后 13；子弹判定框边长 0.25 格；每步分 2 个子步（`bulletSubSteps`）；玩家同时在场子弹 1 发，升级后 2 发。
  - 子弹击中砖墙清除“横向 4 单元 × 纵深 2 单元”（`brickClearAcross`、`brickClearAlong`）。
  - 敌方开火间隔 800～2000ms 随机；场上敌方最多 4 辆；出现间隔 2500ms；出现列为第 0、6、12 列。
  - 护盾 10000ms；道具提示显示 1500ms。
  - 玩家出生点第 12 行第 4 列；指挥所第 12 行第 6 列；初始生命 3。
  - 后坐 120ms、炮管后退 0.08 格；履带每移动 0.125 格切换一相位，共 4 相位。
  - 画面时长：关卡开场 1800ms，最后一辆敌人被消灭后 1200ms 进入过关画面，过关画面 2000ms，失败判定后 1200ms 进入失败画面；对话框进入过渡 350ms、离开过渡 300ms；开场幕布 450ms。
  - 特效：粒子上限 300；砖屑 6～10 个、500～900ms；火花 8 个、180～320ms；子弹拖尾 6 点；烟雾 8～14 个、1200ms；爆炸火光 400ms；拾取动画 400ms；画面震动坦克 250ms/0.08 格、指挥所 500ms/0.15 格。
  - 音频：音效总线增益 1，音乐总线增益 0.3，静音渐变 0.02s，音乐 112 BPM，调度前瞻 0.12s、调度间隔 25ms，最近音效记录保留 50 条。
  - 画布设备像素比上限 2（`maxDpr`）；最高分存储键 `steel-defense.highScore.v1`（`highScoreKey`）。

## 5. 构建与部署

- 两阶段镜像：`node:22-alpine` 中 `npm ci` 后 `npm run build`；运行阶段为 `nginxinc/nginx-unprivileged:1.27-alpine`，复制 `deploy/nginx.conf` 与 `dist`，以 UID 101 运行，暴露 8080 端口（出处：`Dockerfile`）。
- 构建上下文排除 `node_modules`、`dist`、`test-results`、`playwright-report`、`.git`、`.ai-delivery`（出处：`.dockerignore`）。
- 部署声明：单个服务 `web`，端口 8080，健康检查路径 `/healthz`，对外暴露（`exposed: true`）；错误日志规则 `nginx-error`（nginx error/crit/alert/emerg 行，严重度 high）与 `nginx-server-5xx`（5 分钟内 3 次 5xx，严重度 medium）（出处：`docs/deployment.json`）。
- nginx（出处：`deploy/nginx.conf`）：
  - 监听 8080，根目录 `/usr/share/nginx/html`，`try_files $uri $uri/ =404`（没有回退到 `index.html`）。
  - `/healthz` 返回 200、正文 `ok`、不写访问日志。
  - `/assets/` 下资源 `Cache-Control: public, max-age=31536000, immutable`，其余 `no-cache`。
  - 响应头：`Content-Security-Policy`（`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Permissions-Policy: camera=(), microphone=(), geolocation=()`；`server_tokens off`；对文本、CSS、JS、JSON、SVG 开启 gzip。

## 6. 目录与模块

| 路径 | 职责（出处即该文件） |
|---|---|
| `index.html` | 唯一页面：头部标题与静音按钮、状态栏、画布、各画面对话框、侧栏、虚拟按键、横屏提示；加载 `/src/main.ts` |
| `src/main.ts` | 入口：引入样式，从 URL 参数 `seed` 取种子（无效或缺省时用 `crypto.getRandomValues` 随机），调用 `boot` |
| `src/app/boot.ts` | 装配与画面状态机：创建输入、渲染、特效、音频、画质、对话框管理；驱动固定步长循环；保存最高分；挂出 `window.steelDefense` |
| `src/app/loop.ts` | `FixedLoop`：按帧时间戳累加、以 `CONFIG.stepMs` 固定步长推进；统计最近 5 秒的 fps、最大帧间隔和总帧数 |
| `src/app/screens.ts` | `OverlayManager`：对话框进入/离开过渡（以游戏循环时钟计时，不用 `setTimeout`）；`curtainCover`：关卡开场幕布遮盖比例 |
| `src/app/hud.ts` | 把关卡、分数、生命、剩余敌人写入状态栏（值不变时不写 DOM） |
| `src/app/layout.ts` | `watchStage`：保持画布为舞台内最大正方形；`HowToPlacement`：宽屏（≥1024px）游戏中把“怎么玩”移到侧栏，其他情况放回开始画面 |
| `src/app/diagnostics.ts` | 只读诊断快照的类型与构造 `buildSnapshot` |
| `src/game/config.ts` | 全部可调数值 `CONFIG` |
| `src/game/types.ts` | 领域类型：方向、画面、坦克、子弹、道具、指挥所、事件、关卡定义、`GameState` |
| `src/game/levels.ts` | 5 个关卡的地图、敌人出场顺序与道具携带者；`levelDef`、`levelCounts` |
| `src/game/map.ts` | 地形网格的创建、读写、碰撞判断，`mapRows` 输出单元级字符串 |
| `src/game/sim.ts` | `createWorld`、`stepWorld`（单步模拟，无时钟、无 `Math.random`）、`advanceLevel`、过关判定、玩家重生 |
| `src/game/tanks.ts` | 坦克创建、移动（转向对齐、遇障滑到单元边界）、碰撞、履带相位 |
| `src/game/bullets.ts` | 开火、子弹飞行与命中（指挥所、坦克、砖墙、钢墙）、扣血、得分、失败判定 |
| `src/game/enemy-ai.ts` | 敌方移动与随机转向（向下 40%，左/右/上各 20%），随机间隔开火 |
| `src/game/spawner.ts` | 按关卡顺序在顶行轮换出生列分批出场 |
| `src/game/powerups.ts` | 道具掉落、拾取与生效 |
| `src/game/rng.ts` | mulberry32 伪随机数、`parseSeed` |
| `src/input/input-state.ts` | 方向按住栈（后按优先，松开回退到仍按住的方向）、开火锁存、响应时延记录；非 `playing` 画面忽略输入 |
| `src/input/keyboard.ts` | 键盘绑定（按 `event.code`） |
| `src/input/touch.ts` | 虚拟方向键与开火按钮的 Pointer Events 绑定（多指、滑动换向） |
| `src/audio/audio-engine.ts` | Web Audio 图：音效总线、音乐总线 → 主增益 → 输出；手势解锁、静音、音效记录 |
| `src/audio/cues.ts` | 六种合成音效配方与“事件 → 音效”映射 |
| `src/audio/music.ts` | 原创 8 小节循环背景音乐（前瞻调度） |
| `src/render/renderer.ts` | 画布绘制：地形层、指挥所、道具、坦克（车体/炮管/炮塔分层）、护盾、携带者光环、拖尾、子弹、炮口火光、特效、开场幕布 |
| `src/render/effects.ts` | 事件驱动的视觉特效状态（砖屑、火花、击中闪白、护盾波纹、爆炸火光与烟雾、震动、拾取动画、炮口火光、拖尾），自带独立伪随机数 |
| `src/render/particles.ts` | 粒子数据与更新，超上限丢弃最旧的 |
| `src/render/quality.ts` | `AdaptiveQuality`：2 秒平均帧间隔超过 18ms 时逐级降画质（high → medium → low） |
| `src/render/palette.ts` | 统一调色板 `PALETTE`，并写入页面 CSS 变量 |
| `src/render/terrain-layer.ts` | 离屏地形层，仅在地形变化或尺寸变化时重绘 |
| `src/render/sprites/art.ts` | 统一画法：光源左上、阴影投向右下（偏移 0.16 格）、统一描边（2 逻辑像素/48 像素每格）、亮暗边 |
| `src/render/sprites/tank.ts` | 四种坦克（玩家、普通、快速、重甲）的造型参数与绘制 |
| `src/render/sprites/items.ts` | 指挥所、道具、子弹、炮口火光（3 帧）的绘制 |
| `src/render/sprites/terrain.ts` | 地面、墙体阴影、砖墙、钢墙、分层水面的绘制 |
| `src/render/sprites/cache.ts` | `SpriteCache`：按当前格像素与画质把全部精灵预绘到离屏画布 |
| `src/render/sprites/index.ts` | 全部精灵配方清单 `allRecipes`（供单元测试检查画法） |
| `src/storage/high-score.ts` | 最高分读写 |
| `src/styles/main.css` | 页面布局与样式 |
| `tests/unit/`、`tests/integration/`、`tests/e2e/` | 单元、集成、端到端测试（见第 10 节） |

## 7. 接口

### 7.1 HTTP

- 静态文件由 nginx 提供，另有 `GET /healthz` → 200 `ok`；没有其他 HTTP 接口（出处：`deploy/nginx.conf`）。

### 7.2 URL 参数

- `seed`：1～10 位十进制数字且不大于 0xFFFFFFFF 时作为随机种子，否则忽略并随机生成（出处：`src/main.ts`、`src/game/rng.ts` 的 `parseSeed`）。
- 生产入口不接受其他参数；`startLevel` 只由集成测试页 `tests/integration/harness/` 传入（出处：`src/main.ts`、`src/app/boot.ts` 的 `BootOptions`、`tests/integration/harness/harness.ts`）。

### 7.3 输入

- 键盘（按 `event.code`）：`ArrowUp`/`KeyW` 上、`ArrowDown`/`KeyS` 下、`ArrowLeft`/`KeyA` 左、`ArrowRight`/`KeyD` 右、`Space` 开火；仅在 `playing` 画面生效并 `preventDefault`；忽略按键自动重复；窗口失焦或页面隐藏时清空按键（出处：`src/input/keyboard.ts`）。
- 触摸：`.dpad` 内带 `data-dir` 的按钮按下即移动、松开即停，按住后滑到相邻方向键会换向；`#fire-btn` 按下开火；`pointerup`/`pointercancel`/失焦/页面隐藏时释放；屏蔽长按菜单（出处：`src/input/touch.ts`）。
- 开火：按下时锁存，短于一步的点按也会开火一次；按住时每步尝试开火，受同时在场子弹数限制（出处：`src/input/input-state.ts`、`src/game/sim.ts`、`src/game/bullets.ts`）。

### 7.4 页面元素

- 头部：`h1.app-title` “钢铁防线”；静音按钮 `#mute-btn`（`aria-pressed` 表示静音状态）（出处：`index.html`、`src/app/boot.ts`）。
- 状态栏 `#hud`（`role="group"`，名称“战况”）：`#hud-level`、`#hud-score`、`#hud-lives`、`#hud-enemies`，均为 `role="status"` 的 `<output>`，可见名称分别为“关卡”“分数”“生命”“剩余敌人”（出处：`index.html`）。
- 对话框（`role="dialog"`）：`#overlay-start`“开始画面”（含“怎么玩”`#how-to`、开始按钮 `#start-btn`“开始游戏”、历史最高分 `#start-high`）、`#overlay-intro`“关卡开场”（`#intro-level`“第 N 关”、`#intro-enemies`“敌人 N 辆”）、`#overlay-clear`“过关”（`#clear-text`“第 N 关 过关”）、`#overlay-gameover`“失败”与 `#overlay-victory`“全部通关”（各含本局分数、历史最高分和 `data-action="to-start"` 的“返回开始画面”按钮）（出处：`index.html`）。
- 道具提示 `#powerup-hint`（`role="status"`，名称“道具提示”），拾取后显示“护盾”或“火力升级”1500ms（出处：`index.html`、`src/app/boot.ts`）。
- 虚拟按键 `.controls`：`.dpad`（名称“方向键”，四个按钮“向上/向左/向右/向下”）与 `#fire-btn`“开火”（出处：`index.html`）。
- 横屏提示 `.rotate-hint`（`role="alertdialog"`，名称“请旋转手机”，文字“请将手机竖过来玩”）（出处：`index.html`）。
- “怎么玩”说明列出：电脑方向键或 W/A/S/D 移动、空格开火；手机按住屏幕下方方向键移动、松开即停，按开火按钮发射子弹；目标；地形规则；静音按钮位置及“手机处于静音模式等系统原因时，可能听不到音效。”（出处：`index.html`）。

### 7.5 只读诊断接口 `window.steelDefense`

- 冻结对象，含 `version` 与 `snapshot()`；生产页面同样挂出（出处：`src/app/boot.ts`）。
- `snapshot()` 返回 `SteelDefenseSnapshot`：`screen`、`transitioning`、`seed`、`level`、`score`、`lives`、`enemiesRemaining`、`highScore`、`levelInfo`（本关总数与按类型计数）、`levels`（5 关的总数、按类型计数与 13 行地图字符串）、`player`（位置、朝向、是否移动、`shieldMs`、`firepower`、`maxBullets`、`speed`、`recoilMs`、`treadPhase`，无玩家时为 `null`）、`enemies`（含 `type`、`hp`、`maxHp`、`speed`、`carrier`）、`bullets`（含 `owner`、`speed`）、`powerUps`、`base`、`map`（`cols: 13`、`rows: 13`、`unitsPerTile: 4`、52 行单元级字符串 `.`/`B`/`S`/`W`）、`effects`（粒子数、`shakeMs`、炮口火光、火花、爆炸、拾取动画、拖尾计数）、`audio`（`state`、`muted`、`masterGain`、`musicPlaying`、最近音效 `cues`）、`perf`（`fps`、`maxFrameGapMs`、`frames`、`quality`）、`input`（`direction`、`fire`、`lastResponseMs`）（出处：`src/app/diagnostics.ts`）。
- `transitioning` 为真的条件：有对话框处于进入/离开过渡中，或处于关卡开场且未超过幕布时长 450ms（出处：`src/app/boot.ts`）。

## 8. 数据模型

### 8.1 模拟状态（内存）

- `GameState`：`screen`、`level`、`score`、`lives`、`enemiesRemaining`、`enemiesSpawned`、`spawnEnabled`、`spawnTimerMs`、`spawnSlot`、`lost`、`cleared`、`powerUpsDropped`、`timeMs`、`rngSeed`、`rngState`、`nextId`、`map`、`base`、`player`、`enemies`、`bullets`、`powerUps`（出处：`src/game/types.ts`）。
- 画面 `Screen`：`start`、`levelIntro`、`playing`、`levelClear`、`gameOver`、`victory`（出处：`src/game/types.ts`）。
- 地形 `MapGrid`：13×13 格、52×52 单元的 `Uint8Array`，单元值 0 空地、1 砖墙、2 钢墙、3 水面；越界视为钢墙（出处：`src/game/types.ts`、`src/game/map.ts`）。
- 坦克 `Tank`：左上角坐标（格）、朝向、`hp`/`maxHp`、`carrier`/`carrierSeq`、速度、开火冷却、后坐、履带相位；`PlayerTank` 另有 `shieldMs`、`firepower`（0/1）、`maxBullets`（出处：`src/game/types.ts`）。
- 子弹 `Bullet`：中心坐标、方向、速度、`owner`（`player`/`enemy`）与 `ownerId`（出处：`src/game/types.ts`）。
- 事件 `GameEvent`：`fire`、`brickHit`、`steelHit`、`tankHit`（含 `shielded`）、`explode`（`target` 为 `tank` 或 `base`）、`pickup`、`lifeLost`、`scoreChanged`、`enemySpawned`、`levelClear`、`gameOver`、`victory`（出处：`src/game/types.ts`）。

### 8.2 关卡数据

- 共 5 关，每关 13 行×13 字符的地图（`.` 空地、`B` 砖墙、`S` 钢墙、`W` 水面、`H` 指挥所位置，`H` 按空地建图），地图逐关不同（出处：`src/game/levels.ts`、`src/game/map.ts`）。
- 每关敌人出场顺序与道具携带者（按出场序号，从 1 开始）：

  | 关 | 总数 | 普通 | 快速 | 重甲 | 携带者 |
  |---|---|---|---|---|---|
  | 1 | 10 | 7 | 2 | 1 | 4、8 |
  | 2 | 12 | 7 | 3 | 2 | 4、9 |
  | 3 | 14 | 7 | 4 | 3 | 3、8、12 |
  | 4 | 16 | 7 | 5 | 4 | 3、8、13 |
  | 5 | 18 | 7 | 6 | 5 | 3、7、11、15 |

  （出处：`src/game/levels.ts` 的 `order`、`carriers`）

### 8.3 持久化

- 只有历史最高分保存在浏览器 `localStorage`，键 `steel-defense.highScore.v1`，值为十进制整数字符串（出处：`src/game/config.ts`、`src/storage/high-score.ts`）。
- 读取时缺失、非纯数字、超过 9,999,999 或存储不可用一律视为 0；写入只在分数高于已存值时进行，写入失败时保留内存中的值（出处：`src/storage/high-score.ts`）。
- 每个模拟步后分数一旦超过最高分即保存（游戏进行中也保存），过关后、进入失败画面时也会检查保存（出处：`src/app/boot.ts` 的 `recordScore`）。
- 静音状态不持久化，每次打开为有声（出处：`src/app/boot.ts` 中 `muted` 初值为 `false`）。

## 9. 运行时行为

### 9.1 画面流程

- 开始画面（无过渡直接显示）→ 点击“开始游戏”：解锁音频、新建第 1 关世界、开始画面离开、显示关卡开场（出处：`src/app/boot.ts` 的 `startGame`）。
- 关卡开场持续 1800ms，期间画布上先合后开的上下幕布（450ms）；随后进入 `playing`（出处：`src/app/boot.ts`、`src/app/screens.ts` 的 `curtainCover`、`src/render/renderer.ts` 的 `drawCurtain`）。
- 本关敌人全部消灭（待出场为 0 且场上为 0）→ 继续播放 1200ms → 过关画面 2000ms → 未到第 5 关时进入下一关开场；第 5 关后显示“全部通关”画面（出处：`src/game/sim.ts` 的 `checkLevelClear`、`src/app/boot.ts` 的 `showClear`、`afterClear`）。
- 指挥所被任意一方子弹击中，或生命降为 0 → 停止输入、继续播放 1200ms → 失败画面（出处：`src/game/bullets.ts`、`src/app/boot.ts` 的 `showGameOver`）。
- 失败或全部通关画面点击“返回开始画面”回到开始画面；再次开始时分数清零、生命 3、从第 1 关开始（出处：`src/app/boot.ts` 的 `toStart`、`src/game/sim.ts` 的 `createWorld`）。
- 对话框切换：显示时先去掉 `hidden` 并设 `data-transition="entering"`，下一帧强制样式刷新后加 `is-visible` 类，进入过渡 350ms；隐藏时去掉 `is-visible`、`data-transition="leaving"`，300ms 后设 `hidden`。CSS 中 `.overlay` 透明度过渡 300ms，`.overlay-card` 位移过渡 350ms；`prefers-reduced-motion: reduce` 时取消过渡（出处：`src/app/screens.ts`、`src/styles/main.css`）。
- 页面根元素 `#app` 的 `data-screen` 属性随画面更新（出处：`src/app/boot.ts` 的 `setScreen`）。

### 9.2 主循环

- `requestAnimationFrame` 每帧：固定步长推进模拟（每步 1000/60 ms，每帧最多 4 步，帧间隔超过 250ms 截断）→ 画质检查 → 对话框过渡更新 → 状态栏更新 → 画布绘制（出处：`src/app/boot.ts`、`src/app/loop.ts`）。
- 页面重新可见时重置循环时钟与画质时钟，并尝试恢复音频（出处：`src/app/boot.ts`）。
- 输入在每个模拟步读取：`stepWorld` 收到当前方向与开火锁存；玩家坦克转向、移动或开火时记录按下到响应的时延 `lastResponseMs`（出处：`src/app/boot.ts`、`src/game/sim.ts`、`src/input/input-state.ts`）。

### 9.3 规则

- 坦克只沿上下左右移动；转向到垂直方向时横轴对齐到 0.5 格；被砖墙、钢墙、水面、指挥所、地图边缘或其他坦克阻挡（出处：`src/game/tanks.ts`、`src/game/map.ts`）。
- 子弹被砖墙和钢墙阻挡，可飞越水面；击中砖墙清除一条 4×2 单元区域，钢墙不变（出处：`src/game/map.ts` 的 `blocksBullet`、`src/game/bullets.ts` 的 `hitTerrain`）。
- 玩家子弹只伤敌方坦克，敌方子弹只伤玩家坦克；任意子弹都会击毁指挥所（出处：`src/game/bullets.ts` 的 `hitTank`、`stepBullets`）。
- 玩家被击中：护盾期间不掉生命（产生 `tankHit` 且 `shielded: true`）；否则爆炸、生命减 1，仍有生命时在出生点重生（朝上、基础火力；出生点被占时等待）（出处：`src/game/bullets.ts` 的 `damagePlayer`、`src/game/sim.ts` 的 `respawnPlayer`）。
- 敌方每 2500ms 在第 0、6、12 列轮换出场一辆，场上最多 4 辆，出生点被占时换下一个；第一辆在开始游玩 2500ms 后出现（出处：`src/game/spawner.ts`、`src/game/sim.ts`）。
- 道具：携带者被消灭时在其中心所在格掉落；本关第奇数个携带者掉护盾、偶数个掉火力升级；只有玩家拾取，车身与道具格重叠即生效。护盾持续 10000ms；火力升级使子弹速度 13、同时在场 2 发（出处：`src/game/powerups.ts`、`src/game/config.ts`）。
- 过关后分数、生命和火力升级带入下一关；护盾、道具和子弹不带入；随机数状态延续（出处：`src/game/sim.ts` 的 `advanceLevel`）。
- 模拟的随机性只来自种子化的 mulberry32；特效使用独立的伪随机数，不影响模拟（出处：`src/game/rng.ts`、`src/render/effects.ts`）。

### 9.4 音频

- 音频上下文在第一次用户手势（开始按钮、静音按钮、任意按键）中创建并播放一个单采样静音缓冲；之后的 `pointerdown`/`pointerup`/`touchend`/`click` 在上下文被系统挂起时恢复它（出处：`src/app/boot.ts`、`src/audio/audio-engine.ts`）。
- 事件到音效映射：`fire` → fire；`brickHit`/`steelHit`/`tankHit` → hit；`explode` → explosion；`pickup` → pickup；`levelClear` → levelClear；`gameOver` → gameOver；其他事件无音效（出处：`src/audio/cues.ts` 的 `cueForEvent`）。
- 六种音效均为合成配方（噪声、方波、三角波、正弦波、锯齿波与滤波器组合），时长 0.12～1.4s（出处：`src/audio/cues.ts` 的 `CUE_RECIPES`）。
- 背景音乐在 `levelIntro`、`playing`、`levelClear` 画面播放，其他画面停止；音乐总线增益 0.3（出处：`src/app/boot.ts` 的 `setScreen`、`src/audio/music.ts`、`src/game/config.ts`）。
- 静音按钮切换主增益 0/1（20ms 渐变），同时关闭音效与音乐（出处：`src/audio/audio-engine.ts` 的 `setMuted`）。

### 9.5 绘制与画面效果

- 画布按舞台内最大正方形缩放，后备尺寸 = CSS 尺寸 × min(设备像素比, 2, 画质上限)（出处：`src/app/layout.ts`、`src/render/renderer.ts`）。
- 绘制顺序：地形层（离屏缓存）→ 指挥所 → 道具 → 玩家坦克与护盾圈 → 敌方坦克与携带者旋转虚线金色光环 → 子弹拖尾 → 子弹 → 炮口火光 → 粒子、爆炸火光、击中闪光、护盾波纹、拾取动画 → 开场幕布；画面震动时整体偏移（出处：`src/render/renderer.ts`）。
- 坦克分车体（含履带相位）、炮管（后坐时后退）、炮塔三层精灵；被击中 100ms 内使用浅色“击中”变体（出处：`src/render/renderer.ts`、`src/render/sprites/tank.ts`）。
- 四种坦克主色：玩家金黄、普通灰绿、快速青蓝、重甲暗红；造型参数（车宽、履带宽与长、炮管、顶部特征 chevron/none/fins/plates）各不相同（出处：`src/render/palette.ts`、`src/render/sprites/tank.ts` 的 `TANK_STYLES`）。
- 统一画法：坦克、指挥所、道具、子弹与砖墙/钢墙的阴影都经 `castShadow` 向右下偏移 0.16 格；描边统一经 `strokeOutline`；炮口火光、炮管、炮塔不投阴影（出处：`src/render/sprites/art.ts`、`src/render/sprites/index.ts`、`src/render/sprites/terrain.ts`）。
- 水面每个单元画三层：主体色、暗色波谷、亮色波峰，按行错开（出处：`src/render/sprites/terrain.ts`）。
- 特效与事件对应：`fire` 炮口火光；`brickHit` 砖屑；`steelHit` 火花与闪光；`tankHit` 火花、闪白，护盾时加波纹；`explode` 烟雾、火光与震动（指挥所震动更强）；`pickup` 拾取动画（出处：`src/render/effects.ts` 的 `handle`）。
- 自适应画质：high（DPR 上限 2、粒子 300、阴影柔边）→ medium（1.5、150、无柔边）→ low（1、150、无柔边），只降不升（出处：`src/render/quality.ts`）。
- 页面颜色经 `applyCssPalette` 写入 `--c-page`、`--c-panel`、`--c-accent` 等 CSS 变量，与画布共用 `PALETTE`（出处：`src/render/palette.ts`、`src/app/boot.ts`）。

### 9.6 布局

- `body` 设 `overflow-x: hidden`；`#app` 为网格布局（头部 44px、状态栏 40px、舞台），宽 100%、`max-width: 100vw`、高 `100dvh`（回退 `100vh`）、`overflow: hidden`（出处：`src/styles/main.css`）。
- 宽度 ≥1024px 且不在开始画面时，右侧增加 300px 侧栏放“怎么玩”（出处：`src/styles/main.css`、`src/app/layout.ts`）。
- `pointer: coarse` 时在舞台下方增加至少 150px 的虚拟按键行（含底部安全区），方向键 3×3 网格（48×44px），开火按钮 88px 圆形；开始、失败、全部通关画面时虚拟按键隐藏（`visibility: hidden`）（出处：`src/styles/main.css`）。
- `pointer: coarse` 且横屏时，全屏显示横屏提示（出处：`src/styles/main.css`）。

## 10. 测试

- 单元测试（Vitest，Node 环境）：`tests/unit/` 下 art、cues、effects、enemies、flow、high-score、input、levels、loop、powerups、quality、rules、screens、terrain 共 14 个文件（出处：`vitest.config.ts`、`tests/unit/`）。
- 集成测试（Playwright，Desktop Chrome、1280×800、2 个 worker、单测 60s）：由 Vite 开发服务器在 `IT_PORT`（缺省 5174）启动，测试页 `tests/integration/harness/index.html` 读取 `seed` 与 `startLevel` 参数启动游戏，并在 `window.harness.destroyAllEnemies()` 提供“按正常得分消灭本关全部敌人”的测试捷径（出处：`playwright.config.ts`、`tests/integration/harness/harness.ts`）。
- 集成测试文件：art-shading、audio-cues、audio-mute、base-explosion-fire、basics、controls、effects、frame-pacing、high-score、input-latency、layout、rules、shadow-beside-walls、tank-fx、transitions、victory（出处：`tests/integration/`）。
- 端到端测试（Playwright，1 个 worker、单测 120s）：desktop-level-flow、fail-and-return、landscape-hint、mobile-level-flow、mute、start-and-howto；目标为 `E2E_BASE_URL` 或本地 `vite preview`（出处：`playwright.e2e.config.ts`、`tests/e2e/`）。
- 测试页不进入生产产物，由 `scripts/check-dist.mjs` 在构建时检查（出处：`scripts/check-dist.mjs`）。

## 11. 约定

- 可调数值只放在 `src/game/config.ts` 的 `CONFIG`；颜色只取自 `src/render/palette.ts` 的 `PALETTE`（出处：两文件头部注释及各模块对它们的引用）。
- 模拟层（`src/game/`）不访问 DOM、时钟和 `Math.random`，只由 `stepWorld` 按固定步长推进，以事件数组向外报告（出处：`src/game/sim.ts` 注释、`src/game/` 各文件的导入）。
- 音频、特效、界面都由模拟事件驱动（出处：`src/app/boot.ts` 的 `step`）。
- 对话框过渡以游戏循环时钟计时，不使用 `setTimeout`（出处：`src/app/screens.ts`）。
- 精灵在尺寸或画质变化时一次性预绘到离屏画布，游戏中只 `drawImage`（出处：`src/render/sprites/cache.ts`）。
- 测试专用入口参数（`startLevel`、`onTestAccess`）只由集成测试页使用，生产入口不传（出处：`src/app/boot.ts` 的 `BootOptions` 注释、`src/main.ts`）。
