---
name: render-deployment
description: Context and instructions for deploying the Jira Dashboard to Render.
---

# Render Deployment Skill

## Context
The Jira Dashboard is hosted on a free Render web service (`srv-d6oeb33h46gs73ait5r0`). The project is a monorepo containing an Express.js backend and a Vite+React frontend.

## Deployment Quirk
Because the Render instance is on a free tier, its **Build Command** is configured to only install production dependencies (`npm install --production`). It **does not** run `npm run build`.

To successfully deploy, the frontend must be **pre-built locally** and the `dist/` folder must be committed to the GitHub repository.

## Steps to Deploy
When asked to deploy to render, you must execute the `/deploy-to-render` workflow:
1. Run `npm run build` locally.
2. Commit the changes (including the `dist/` folder).
3. Push to `origin main`.
4. Render's auto-deploy webhook is configured on push. However, if a `--force` push is used, or the webhook fails, you may need to manually trigger the deployment via the Render Dashboard UI using the `browser_subagent`.
