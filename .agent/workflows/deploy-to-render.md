---
description: Build the frontend and push to GitHub to trigger Render deployment
---

# Deploy to Render Workflow

This workflow ensures the Jira Dashboard is properly built and deployed to the free Render instance. Because the Render instance is configured with `npm install --production` as the build command, the `dist/` folder must be compiled locally and committed to the repository.

1. **Verify Git Status**
   Check for any uncommitted changes.
   `git status`

2. **Build the Frontend**
   Compile the Vite React application.
   // turbo
   `npm run build`

3. **Stage and Commit the Build**
   Add the locally compiled `dist/` directory and any other changes, then commit with a deployment message.
   `git add -A`
   `git commit -m "deploy: update build for Render"`

4. **Push to Remote**
   Push the changes to the `main` branch. This standard push should trigger the Render auto-deploy webhook.
   `git push origin main`

5. **Verify the Deployment (Optional but Recommended)**
   If the webhook fails to trigger, or if you need to confirm the deploy started, use the `browser_subagent` tool to navigate to the Render dashboard (`https://dashboard.render.com/web/srv-d6oeb33h46gs73ait5r0`).
   - Navigate to the "Events" tab.
   - If the new deploy hasn't started automatically, click "Manual Deploy" -> "Deploy latest commit".
