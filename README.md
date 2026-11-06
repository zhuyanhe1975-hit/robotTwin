# RoboStudioX

工业机器人数字孪生体. Visualize an industrial robot from URDF, jog joints, and play Cartesian trajectories in the browser.

**Live site:** https://zhuyanhe1975-hit.github.io/robotTwin/

GitHub Actions builds this Vite app and deploys it to GitHub Pages on every push to `main`. The published site does not include a Gemini API key. The 3D twin, URDF loading, and local kinematics run without one. AI task planning is optional and only uses a key you keep in an untracked `.env.local` while developing locally.

View the app in AI Studio: https://ai.studio/apps/drive/1F0ucSWUZ_Ao_XxGTJ8yIv1wz8SO8XQu6

## Enable GitHub Pages

After the workflow is on `main`, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. Then re-run the **Deploy to GitHub Pages** workflow. That publishes https://zhuyanhe1975-hit.github.io/robotTwin/.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Optional: create `.env.local` and set `GEMINI_API_KEY` to your Gemini API key. Do not commit `.env`, `.env.local`, or any API key. Leave this unset to run without AI planning.
3. Run the app:
   `npm run dev`
