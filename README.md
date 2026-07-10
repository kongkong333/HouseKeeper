# HouseKeeper

HouseKeeper 是一个轻量级、手机优先的家庭 PWA，用来管理家庭用品、厨房食材、药品库存、每日提醒，并支持 Supabase 云同步和 AI 点菜推荐。

## 功能

- 家庭成员登录和切换。
- 家庭用品库存、低库存提醒和购物清单。
- 厨房食材库存，支持冷藏、冷冻、常温位置，按过期时间排序，支持数量调整和用完标记。
- AI 菜单推荐：只使用未过期的厨房食材，通过 Supabase Edge Function 调用 Ark API。
- 药品库存、过期提醒和低库存提醒。
- 每日提醒，支持负责人、重复周期和完成状态。

## 新电脑准备环境

以下命令建议在普通 PowerShell 中执行。

### 1. 安装 Scoop

如果新电脑还没有 Scoop：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
```

关闭并重新打开 PowerShell，确认可用：

```powershell
scoop --version
```

### 2. 安装 Git、Node.js、Supabase CLI

```powershell
scoop install git nodejs-lts
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

确认安装成功：

```powershell
git --version
node --version
supabase --version
```

如果需要在本机运行完整 Supabase 本地开发栈，还需要安装 Docker Desktop；只连接云端 Supabase 项目时不需要本地 Docker。

## 在新电脑启用项目

### 1. 克隆代码

```powershell
git clone https://github.com/<your-name>/<repo-name>.git
cd <repo-name>
```

本项目没有 `package.json` 依赖，直接用 Node.js 运行内置开发服务器即可。

### 2. 检查 Supabase 配置

`supabase-config.js` 保存浏览器可公开使用的 Supabase Project URL 和 publishable/anon key：

```js
window.HOUSEKEEPER_SUPABASE = {
  url: "https://your-project.supabase.co",
  anonKey: "your_publishable_or_anon_key",
};
```

如果继续使用当前 Supabase 项目，通常不用修改这个文件。若换成新 Supabase 项目，请在 Supabase 控制台找到 Project URL 和 publishable/anon key 后替换。

### 3. 初始化云端数据库

如果是新的 Supabase 项目，打开 Supabase Dashboard -> SQL Editor，把 `supabase-schema.sql` 的完整内容粘贴进去执行。

这个 schema 会创建 HouseKeeper 需要的表和 RPC 函数。The app uses a custom username/password login implemented with Supabase Postgres RPC functions. Different member accounts share the same household state in `public.housekeeper_states`; accounts identify who is operating, while the household data is shared by the family.

如果是已有项目且已经执行过 `supabase-schema.sql`，不需要重复执行，除非 schema 文件有更新。

### 4. 配置 AI 点菜

本地开发时，在项目根目录新建 `.env.local`：

```env
ARK_API_KEY=your_ark_api_key
```

部署到 Supabase Edge Function 时，先登录并关联项目：

```powershell
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set ARK_API_KEY=your_ark_api_key
supabase functions deploy recommend-menu
```

`<your-project-ref>` 是 Supabase 项目的 ref，例如项目 URL `https://abcxyz.supabase.co` 中的 `abcxyz`。Edge Function 文件位于 `supabase/functions/recommend-menu/index.ts`。

### 5. 本地运行

```powershell
node dev-server.js
```

电脑浏览器打开：

```text
http://127.0.0.1:5174
```

手机和电脑连接同一个 Wi-Fi 后，可以打开终端里打印的 LAN URL，例如：

```text
http://192.168.1.10:5174
```

## 数据说明

- 未登录或无法连接 Supabase 时，数据保存在当前浏览器的 `localStorage`。
- 配置 Supabase 并登录后，同一家庭状态会同步到云端。
- 不同成员账号共享同一份家庭数据，但会记录当前操作成员。
- 清除浏览器数据会删除本地缓存；云端数据不会因此删除。

## 测试

项目测试使用 Node.js 内置测试能力和普通脚本断言，不需要额外安装依赖。

```powershell
node --test app-core.test.js app-cloud-auth.test.js app-event-wiring.test.js dev-server.test.js supabase-schema.test.js
node readme.test.js
```

## 常见问题

- `scoop` 命令不存在：关闭 PowerShell 后重新打开；仍不行时检查 Scoop 是否安装成功。
- `node` 命令不存在：运行 `scoop install nodejs-lts`，然后重新打开 PowerShell。
- AI 点菜提示 `ARK_API_KEY is not configured`：检查 `.env.local` 是否在项目根目录，变量名是否为 `ARK_API_KEY`。
- 云同步失败：检查 `supabase-config.js` 的 URL/key 是否正确，并确认 `supabase-schema.sql` 已在 Supabase SQL Editor 执行。
- Supabase CLI 部署失败：先运行 `supabase login`，再运行 `supabase link --project-ref <your-project-ref>`。
