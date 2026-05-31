# 腾讯云轻量应用服务器部署

推荐配置：

```txt
地域：中国香港
系统：Ubuntu 22.04 LTS
配置：1核 1G 起步
端口：开放 22、80、443
```

## 1. 登录服务器

```bash
ssh ubuntu@你的服务器公网IP
```

如果腾讯云镜像使用 `root` 用户：

```bash
ssh root@你的服务器公网IP
```

## 2. 安装基础软件

```bash
sudo apt update
sudo apt install -y git curl nginx
```

安装 Node.js 20：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3. 部署应用

```bash
git clone https://github.com/erqitao/e-note.git /var/www/e-note
sudo mkdir -p /var/www/e-note-data
sudo chown -R $USER:$USER /var/www/e-note /var/www/e-note-data
cd /var/www/e-note
npm install --omit=dev
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` 会输出一条 `sudo env ...` 命令，复制执行它，让应用开机自启。

## 4. 配置 Nginx

```bash
sudo cp /var/www/e-note/deploy/nginx-e-note.conf /etc/nginx/sites-available/e-note
sudo ln -sf /etc/nginx/sites-available/e-note /etc/nginx/sites-enabled/e-note
sudo nginx -t
sudo systemctl reload nginx
```

然后访问：

```txt
http://你的服务器公网IP
```

## 5. 更新应用

```bash
cd /var/www/e-note
git pull --ff-only
npm install --omit=dev
pm2 startOrReload ecosystem.config.cjs
```

## 6. 备份数据

笔记数据保存在：

```txt
/var/www/e-note-data/db.json
```

手动备份：

```bash
bash /var/www/e-note/deploy/backup-data.sh
```

## 7. 绑定域名和 HTTPS

如果使用中国香港服务器，可以先直接用 IP 访问。后续要绑定域名：

1. 在域名 DNS 增加 A 记录，指向服务器公网 IP
2. 把 `deploy/nginx-e-note.conf` 里的 `server_name _;` 改成你的域名
3. 安装 HTTPS 证书，例如使用 Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```
