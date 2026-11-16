# SchoolTime

SchoolTime is a lightweight, open-source Windows desktop timetable viewer for South Korean schools, inspired by 컴시간알리미. It searches schools and displays a selected grade/class timetable with teacher names through a self-contained Comcigan client.

## Development

Requires Node.js 20+.

```bash
npm install
npm start
```

Create a clean Windows installer with `npm run build:clean`. The script removes previous local build output, packages the app, and leaves only `release/SchoolTime-<version>-Setup.exe`. The GitHub Actions workflow runs the same clean build on every push to `main`; tagged builds are also attached to the matching GitHub Release.

## Architecture and security

- The renderer has `nodeIntegration: false`, `contextIsolation: true`, sandboxing, and a restrictive Content Security Policy.
- The preload exposes only two typed, narrow IPC operations; renderer input is length-limited and the provider normalizes output.
- No school selection, credentials, or personal data are persisted externally.
- Network/API behavior is isolated in `src/services/comcigan-provider.js`, including dynamic route discovery, page-issued request tokens, response authentication, AES-CBC decryption, and packed timetable decoding.

The Comcigan service is unofficial and can change or become unavailable. SchoolTime does not bypass authentication or collect user data. Use it only where permitted by the service and applicable law.

## Project structure

```text
src/
  main.js                  Electron main process and security policy
  preload.js               Minimal context-bridge API
  services/
    comcigan-provider.js   API adapter and normalized timetable model
  renderer/
    index.html             UI markup
    styles.css             UI styles
    app.js                 UI behavior
.github/workflows/build.yml  Release build workflow
```

Released under the MIT License.
