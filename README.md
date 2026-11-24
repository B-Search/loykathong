# Moonlit River — Loy Krathong

A responsive Loy Krathong site with an optional shared online River. It uses plain HTML, CSS, and JavaScript with a small Node.js/MongoDB Atlas backend; no front-end framework is used.

## Run locally

Install Node.js 20.19 or newer, then in this folder run:

```sh
npm install
npm run dev
```

Open the local URL printed by the server (usually `http://127.0.0.1:4173`). Press **Ctrl+C** to stop it. If port 4173 is busy, run `PORT=4174 npm run dev` and open `http://127.0.0.1:4174`.

Without `MONGODB_URI`, this local preview stores wishes only in the current browser. To test shared storage, use your Atlas connection URI:

```sh
MONGODB_URI="mongodb+srv://DB_USER:DB_PASSWORD@YOUR_CLUSTER/..." MONGODB_DB="loykrathong" PORT=4174 npm run dev
```

Replace the placeholders with your Atlas values. URL-encode special characters in the database password. In Atlas, create a database user and allow the server's outbound IP in Network Access. For deployment, allow the hosting service's outbound IPs (not just your computer); avoid allowing every IP unless you understand the risk. Do not paste the connection URI into chat or commit it to source control.

## Share the River online

Deploy this Node app to a host and connect it to your Atlas cluster. Render is one beginner-friendly option; check current hosting and database costs before creating resources. Set these environment variables in the host's secret/configuration settings:

- `MONGODB_URI` — your Atlas connection URI.
- `MONGODB_DB=loykrathong` — the database name.
- `NODE_ENV=production`
- `PORT` — supplied by most application hosts.
- `APP_ORIGIN` — optionally set to the exact deployed HTTPS origin.
- `TRUST_PROXY=true` only when the host uses a trusted proxy that sets `X-Forwarded-For`.

Use `npm start` as the service start command. The backend creates the `shared_wishes` collection and its date index automatically. Both visitors use the same River; new wishes sync automatically about every 10 seconds. **Anyone with the deployed link can view and add wishes**, so only share it with people you trust. There is no sign-in, and the online River cannot be cleared with the local reset button. I have prepared the code but have not deployed it; an online link requires a hosting account and Atlas access configuration.

The local-only mode and the online shared mode use separate storage; existing browser wishes are not automatically uploaded.

## Deploy on Vercel with MongoDB Atlas

The root `server.ts` lets Vercel detect and run the Node server; it serves both the website and API. To deploy:

1. Push the project to a GitHub repository, then import it from **Vercel → Add New → Project**.
2. Before deploying, add `MONGODB_URI` (your Atlas connection string) and `MONGODB_DB` (`loykrathong`) under **Project Settings → Environment Variables** for Production. Add them for Preview too if you want preview deployments to use the shared River.
3. Deploy the project. Vercel should detect the Node server automatically; if asked, choose **Other** as the framework. No build command is needed.
4. Open the generated `.vercel.app` URL and share it with your girlfriend.

Atlas must allow connections from the Vercel deployment. Vercel's [Static IPs](https://vercel.com/docs/networking/static-ips) are available on Pro and Enterprise plans; on other plans, check your available egress options before opening Atlas access broadly. Keep the Atlas URI secret.

## Background music and effects

Place a local music file at `assets/audio/loy-krathong.mp3`. The site works without it. The krathong, moon, water, lanterns, fireworks, and effects are drawn or generated locally; no external image or font requests are made.
# loykathong
