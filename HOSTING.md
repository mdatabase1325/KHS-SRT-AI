# Hosting & Deployment Guide 🚀

This project is a production-ready Node.js Express application that communicates with Microsoft Edge's Neural Speech WebSocket service. All configuration files (`Dockerfile`, `render.yaml`, `railway.json`, `Procfile`, `.dockerignore`, `.gitignore`) have already been generated and configured.

---

## 🌟 Option 1: Render.com (Recommended - 100% Free)

[Render.com](https://render.com) offers a free Web Service tier with automatic HTTPS and WebSocket support.

### Steps:
1. Upload your project folder to a repository on **GitHub** or **GitLab**.
2. Go to [dashboard.render.com](https://dashboard.render.com) and click **New +** -> **Web Service**.
3. Select your repository.
4. Render will auto-detect the configuration, or fill in:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Click **Create Web Service**.
6. Render will build and deploy your app in ~2 minutes with a free public URL: `https://khs-srt-ai.onrender.com`.

---

## 🚂 Option 2: Railway.app (Instant 1-Click Deploy)

[Railway.app](https://railway.app) is one of the easiest ways to host Node.js containers with zero configuration.

### Steps:
1. Push your code to GitHub.
2. Go to [railway.app](https://railway.app) -> **New Project** -> **Deploy from GitHub repo**.
3. Railway automatically detects `railway.json` and `package.json`.
4. Go to **Settings** -> **Generate Domain** to get a public HTTPS URL (`https://khs-srt-ai.up.railway.app`).

---

## 🐳 Option 3: Docker / Self-Hosted VPS / Cloud Run

If you run your own Linux VPS (Ubuntu/Debian, DigitalOcean, Hetzner, AWS EC2, or Google Cloud Run):

### 1. Build Docker Image
```bash
docker build -t khs-srt-ai .
```

### 2. Run Container
```bash
docker run -d -p 80:3000 --name khs-srt-ai --restart always khs-srt-ai
```
Your app is now live on port 80 with automatic restart!

### Optional: Run with Nginx & Let's Encrypt SSL
Point your domain DNS (`A record`) to your server IP, and configure Nginx reverse proxy:
```nginx
server {
    server_name khs-srt-ai.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## ⚡ Option 4: Instant Public URL without Deploying (Cloudflare Tunnel)

If you want an instant, public HTTPS link right now from your computer without uploading code:

### Using Cloudflare Quick Tunnel (Free, no account needed):
```bash
npx cloudflared tunnel --url http://localhost:3000
```
Or using **LocalTunnel**:
```bash
npx localtunnel --port 3000
```
This gives you an instant temporary public HTTPS link (e.g., `https://khs-srt-ai-preview.loca.lt`) to test and share immediately.

