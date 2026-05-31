# E-Note

一个在线笔记第一版，实现账号登录、云端保存、多端读取同一账号笔记。

## 功能

- 邮箱注册、登录、退出
- 密码使用 Node.js `crypto.scrypt` 加盐哈希保存
- 登录会话使用 HttpOnly Cookie
- 新建、编辑、删除、搜索笔记
- 编辑时自动保存
- 每个用户只能访问自己的笔记
- 数据保存到 `data/db.json`
- 可用 `DATA_DIR` 环境变量指定云端持久化目录

## 运行

```bash
node server.js
```

然后打开：

```txt
http://localhost:3000
```

也可以使用：

```bash
npm start
```

前提是本机安装了 `npm`。

## 腾讯云轻量服务器部署

推荐使用腾讯云轻量应用服务器，中国香港地域。详细步骤见：

[deploy/tencent-cloud.md](deploy/tencent-cloud.md)

第一版使用文件数据库，服务器部署时建议把数据放到：

```txt
/var/www/e-note-data
```

项目已包含 PM2 配置：

```txt
ecosystem.config.cjs
```

以及 Nginx 示例：

```txt
deploy/nginx-e-note.conf
```

## 其他云端部署

第一版使用文件数据库，因此部署平台必须支持持久化磁盘。部署时建议设置：

```txt
DATA_DIR=/data
```

然后把平台的持久化磁盘挂载到 `/data`。

不建议直接部署到纯 Serverless 平台，因为运行时文件系统通常不适合保存长期数据。

仓库已经包含 `render.yaml`，可以在 Render 里选择 Blueprint 部署。它会创建：

- Web Service: `e-note`
- Start Command: `node server.js`
- Persistent Disk: `/var/data`
- Environment Variable: `DATA_DIR=/var/data`

## API

```txt
GET    /api/me
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/notes
POST   /api/notes
GET    /api/notes/:id
PATCH  /api/notes/:id
DELETE /api/notes/:id
```

## 后续升级建议

- 把 `data/db.json` 替换为 PostgreSQL
- 增加邮箱验证和忘记密码
- 支持 Markdown 预览、标签、文件夹
- 支持图片上传和历史版本
- 部署到云服务器或 PaaS 平台
