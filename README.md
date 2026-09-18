# 公厕保洁巡查记录系统

面向城市公厕管养单位的巡查记录与整改闭环管理系统，覆盖 **公厕台账 → 保洁巡查 → 第三方暗访 → 问题上报 → 整改跟踪** 五条业务主线。后端为 FastAPI + SQLAlchemy，前端为 React + Vite，前后端均按模块拆分，可单独开发、单独部署。

## 功能模块

| 模块 | 页面/入口 | 主要能力 |
| --- | --- | --- |
| 总览看板 | `/` | 核心指标卡（内部巡查与第三方暗访分开）、巡查与问题趋势、问题来源/状态/分类/严重程度分布、区域运行情况（巡查/暗访双均分）、重点关注公厕、最新问题、巡查与暗访 |
| 公厕台账 | `/restrooms`、`/restrooms/:id` | 台账增删改查、区域与状态筛选、公厕详情（档案 + 巡查 + 暗访 + 问题四个页签）、关联数据删除保护 |
| 保洁巡查 | `/inspections` | 8 项检查项打分、自动折算百分制得分与等级、班次/日期/结论筛选、巡查详情、一键转问题上报 |
| 第三方暗访 | `/mystery` | 暗访任务按**区域与周期**下发与流转、暗访人按**统一评分表**打分、提交**现场影像与问题说明**、暗访结论与内部巡查**分开统计**、暗访问题一键转普通问题 |
| 问题上报 | `/issues`、`/issues/:id` | 问题上报（可关联巡查记录或暗访记录，标注来源）、分类/程度/期限、按来源筛选、整改流程流转、整改轨迹时间线、超期预警、追加跟进记录 |

其他页面不会互相混杂：台账、巡查、问题各自独立成页，详情页再做跨模块的关联展示。

## 技术栈

- 后端：FastAPI 0.115、SQLAlchemy 2.0、Pydantic v2、Uvicorn；数据库默认 SQLite，容器中可切换 PostgreSQL 16
- 前端：React 18、React Router 6、Vite 6；不使用 UI 组件库，样式集中在 `src/styles/global.css`
- 部署：Docker Compose 编排 PostgreSQL + 后端 + Nginx 前端（Nginx 同时反代 `/api`）

## 目录结构

```
.
├── backend
│   ├── app
│   │   ├── api/v1/endpoints      # 路由层：restrooms / inspections / mystery / issues / stats / meta
│   │   ├── core                 # 配置、数据库、业务常量、领域异常
│   │   ├── models               # ORM 模型：公厕、巡查、暗访、问题、整改流水
│   │   ├── schemas              # Pydantic 出入参模型
│   │   ├── services             # 业务规则层：台账、巡查、暗访、问题整改、评分、统计
│   │   ├── seed.py              # 演示数据生成
│   │   └── main.py              # 应用入口（含异常处理、CORS、健康检查）
│   ├── tests                    # pytest 接口测试
│   ├── Dockerfile
│   └── requirements.txt
├── frontend
│   ├── src
│   │   ├── api                  # 按资源拆分的接口封装 + 统一 fetch 客户端
│   │   ├── components           # 通用组件：表格、分页、弹窗、标签、图表、时间线等
│   │   ├── hooks                # useAsync / useListQuery / useDictionaries
│   │   ├── pages                # dashboard / restrooms / inspections / mystery / issues 五个模块
│   │   ├── utils                # 时间格式化、评分换算
│   │   └── styles/global.css
│   ├── nginx.conf
│   └── Dockerfile
└── docker-compose.yml
```

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
docker compose up -d --build
```

启动后：

- 前端界面：http://localhost:8080
- 后端接口文档：http://localhost:8000/docs （也可通过 http://localhost:8080/docs 访问）
- 健康检查：http://localhost:8000/health

三个服务均带健康检查，`backend` 等待 `db` 健康后启动，`frontend` 等待 `backend` 健康后启动。首次启动会自动建表并写入演示数据。

停止与清理：

```bash
docker compose down        # 停止容器
docker compose down -v     # 同时删除数据库卷（下次启动重新生成演示数据）
```

### 方式二：本地开发

后端（默认使用 SQLite，数据库文件为 `backend/data/app.db`）：

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

前端：

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173，/api 自动代理到 127.0.0.1:8000
```

若后端不在默认端口，可指定代理目标：

```bash
set VITE_PROXY_TARGET=http://127.0.0.1:8020   # macOS/Linux: export VITE_PROXY_TARGET=...
npm run dev
```

## 环境变量

后端（均可用环境变量覆盖，见 `backend/app/core/config.py`）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./data/app.db` | 数据库连接串；容器中为 `postgresql+psycopg://restroom:restroom_pass@db:5432/restroom` |
| `SEED_ON_STARTUP` | `true` | 启动时若库为空则写入演示数据 |
| `CORS_ORIGINS` | `*` | 允许跨域来源，逗号分隔 |
| `SQL_ECHO` | `false` | 是否打印 SQL |

前端：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | `/api/v1` | 接口前缀，构建时注入 |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:8000` | 仅开发模式下 Vite 代理目标 |

## 接口一览

所有接口前缀为 `/api/v1`，完整文档见 `/docs`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/restrooms` | 台账分页查询（keyword/district/status/grade/排序/分页） |
| POST | `/restrooms` | 新增公厕，编号留空自动生成 `WC-0001` |
| GET | `/restrooms/{id}` | 详情，含巡查次数、均分、未闭环问题数 |
| PATCH | `/restrooms/{id}` | 局部更新 |
| DELETE | `/restrooms/{id}?force=` | 删除；有巡查或问题记录时返回 409，`force=true` 才级联删除 |
| GET | `/restrooms/meta/districts` | 区域列表（筛选下拉用） |
| GET | `/inspections` | 巡查记录查询（restroom_id/district/inspector/shift/result/日期区间/关键字） |
| POST | `/inspections` | 新增巡查，服务端按检查项自动算分、定级、判定结论 |
| GET/PATCH/DELETE | `/inspections/{id}` | 详情 / 更新 / 删除 |
| GET | `/mystery-tasks` | 暗访任务查询（district/status/period/inspector/关键字） |
| POST | `/mystery-tasks` | 按区域与周期下发暗访任务，自动生成编号 `AF-YYYYMM-001`，周期留空按开始时间所在 ISO 周生成 |
| GET | `/mystery-tasks/periods` | 已下发任务涉及的周期列表（筛选下拉用） |
| GET/PATCH/DELETE | `/mystery-tasks/{id}` | 任务详情（含任务下全部暗访记录）/ 更新 / 删除 |
| GET | `/mystery-tasks/{id}/transitions` | 当前任务状态可执行的流转动作 |
| POST | `/mystery-tasks/{id}/transitions` | 推进任务状态（待执行 → 进行中 → 已完成 / 已取消） |
| GET | `/mystery-visits` | 暗访记录查询（task_id/restroom_id/district/result/inspector/日期区间/关键字） |
| POST | `/mystery-visits` | 提交暗访：统一评分表算分定级，须与任务区域一致；首次提交自动把任务置为「进行中」；结论为「发现问题」时强制提交现场影像与问题说明 |
| GET/DELETE | `/mystery-visits/{id}` | 暗访详情（含影像、问题说明、关联问题数）/ 删除 |
| GET | `/issues` | 问题查询（status/source/category/severity/district/overdue/open_only/日期区间/关键字） |
| POST | `/issues` | 上报问题，自动生成编号 `WT-YYYYMMDD-001` 并写入首条整改流水；传 `mystery_visit_id` 自动标记为第三方暗访来源 |
| GET/PATCH/DELETE | `/issues/{id}` | 详情（含完整整改轨迹）/ 更新 / 删除 |
| GET | `/issues/{id}/transitions` | 当前状态可执行的流转动作 |
| POST | `/issues/{id}/transitions` | 推进整改状态（越级流转返回 400） |
| POST | `/issues/{id}/records` | 追加跟进记录（不改变状态） |
| GET | `/stats/overview` | 核心指标 |
| GET | `/stats/dashboard` | 看板聚合数据（趋势、分布、区域、排行、最新记录） |
| GET | `/meta/dictionaries` | 枚举字典（状态、分类、程度、检查项、流转规则） |
| GET | `/meta/restroom-options` | 公厕下拉选项 |
| GET | `/health` | 健康检查 |

## 业务规则

- **巡查评分**：8 个检查项各 0-10 分，得分 = 总得分 / 满分 × 100；≥90 优秀、≥80 良好、≥70 合格，其余不合格。任一检查项低于 6 分或等级为不合格时，巡查结论自动置为「发现问题」。
- **第三方暗访**：暗访任务按「区域 + 周期」下发，周期编号形如 `2026-W38`（ISO 周），留空时按开始时间自动生成，任务编号形如 `AF-202609-001`。暗访人使用与内部巡查**完全一致的 8 项统一评分表**，得分/等级/结论口径相同。提交暗访时公厕必须在任务所属区域内，否则拒绝；任务首次收到暗访记录后自动从「待执行」转为「进行中」。当结论为「发现问题」时，强制填写问题说明并至少提交一条现场影像。
- **结论分开统计**：内部巡查与第三方暗访的得分、均分、次数、趋势分别统计、互不混入；公厕详情、区域运行、重点排行均同时展示巡查均分与暗访均分两列。
- **暗访问题走普通整改**：暗访发现的问题通过 `mystery_visit_id` 关联暗访记录，`source` 自动置为「第三方暗访」（与关联内部巡查互斥），但工单本身与普通问题完全一致——同样生成 `WT-` 编号、进入 `待整改 → … → 已关闭` 流程、适用同样的超期预警与流转规则。问题列表支持按来源（内部巡查 / 第三方暗访 / 群众反馈）筛选。
- **问题编号**：`WT-` + 上报日期 + 当日三位流水号。
- **整改闭环**：`待整改 → 整改中 → 待验收 → 已完成 → 已关闭`；`待验证` 阶段可被驳回退回 `整改中`，`待整改/整改中` 可直接作废关闭。每次流转都会写入一条整改流水（动作、原状态、新状态、操作人、说明），详情页以时间线呈现。
- **超期预警**：整改期限早于当前时间且状态仍处于未闭环（待整改/整改中/待验收）时，列表与详情页显示「已超期」，看板统计超期数量。
- **删除保护**：删除公厕时若已存在巡查、暗访或问题记录，接口返回 409 并提示各自数量，需要显式 `force=true` 才会级联删除；前端会二次确认。删除暗访任务会级联删除任务下的暗访记录（已转出的问题工单保留，关联置空）。

## 演示数据

`SEED_ON_STARTUP=true`（默认）且数据库为空时，会自动写入：10 座公厕（4 个区域、三类等级、含维修/停用状态）、近 14 天约 90 条巡查记录、13 条不同整改阶段的问题及其完整整改轨迹；另有近两周覆盖 4 个区域的 **8 个暗访任务、约 14 条暗访记录及若干第三方暗访来源问题**（上周任务已完成、本周任务进行中）。数据由固定随机种子生成，结果可复现；暗访数据使用独立随机序列，不影响既有巡查/问题演示数据。如需重置，删除 `backend/data/app.db`（或 `docker compose down -v`）后重启即可。

## 测试与验证

```bash
cd backend && pytest -q          # 接口测试（台账、巡查、暗访任务/记录、问题流转、来源分离、统计）
cd frontend && npm run build     # 生产构建
```

本次第三方暗访功能完成时已实际运行验证：

- 后端 `pytest`：14 个用例全部通过（原 6 个 + 暗访相关 8 个）。暗访用例覆盖：字典含暗访枚举、任务按区域/周期下发与周期自动生成、统一评分表算分定级、缺影像/问题说明被拒、跨区域公厕提交被拒、任务自动进行中与完成后拒录、暗访问题以「第三方暗访」来源进入普通整改并正常流转、来源与公厕归属校验、内部巡查与暗访得分在公厕详情/看板中分开统计、删除保护计入暗访记录。
- 前端 `npm run build`：构建成功（75 个模块）。
- 接口冒烟（基于全新 SQLite + 种子数据启动 uvicorn 实测）：`/stats/overview` 与 `/stats/dashboard` 返回独立的巡查/暗访指标与来源分布；完整走通「下发任务 → 提交暗访（缺影像 400 / 补齐 201、自动定级与任务转进行中）→ 一键转问题（来源=第三方暗访、状态=待整改）→ 普通整改流转到整改中」，并验证跨区域提交返回 400、公厕详情两套均分互不混入。
- 种子数据：全新库写入 8 个暗访任务、14 条暗访记录，所有「发现问题」的暗访记录均带问题说明与影像，内部巡查（94 条）与内部问题（13 条）数量保持不变。
- Docker Compose：沿用既有编排（Nginx → FastAPI → PostgreSQL），新增表随 `create_all` 自动建表，无额外迁移步骤。

## 常见问题

- **端口被占用**：若 8000/8080 已被占用，可用覆盖文件改端口，例如 `docker compose -f docker-compose.yml -f override.yml up -d`，其中 `override.yml` 写 `services: { backend: { ports: ["8010:8000"] } }`。
- **想看 SQLite 而不是 PostgreSQL**：把 `backend` 服务的 `DATABASE_URL` 改为 `sqlite:///./data/app.db` 即可，无需 `db` 服务。
- **接口 422**：后端把参数校验错误统一转成中文可读文案，前端会直接弹出提示，例如「参数校验失败 - name: String should have at least 1 character」。
- **越级流转报错**：属于预期行为，接口会返回当前状态允许流转的目标状态列表，前端也只会展示合法动作。
- **提交暗访提示「不在暗访任务区域」**：暗访任务按区域下发，只能对任务所属区域内的公厕提交暗访记录；如需覆盖其他区域，请另行为该区域下发任务。
- **提交暗访提示必须提交现场影像**：当统一评分表判定结论为「发现问题」时，问题说明与至少一条现场影像为必填；结论为「正常」时可留空。
