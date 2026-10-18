# EstudiaIA 2 — Release Checklist

## Build
- [ ] `npm run test:all` passes (unit + UI + voice tests, no skipped tests)
- [ ] `npm run dist` exits 0 and produces `dist/EstudiaIA-2.0.0-Setup.exe`
- [ ] `node scripts/check-artifact.cjs` passes (PE non-empty, helper present, SHA-256 recorded)
- [ ] Installer SHA-256 recorded for delivery

## Install
- [ ] Installer runs silently with `/S /D=<ruta nueva>` and installs under `%LOCALAPPDATA%/Programs/EstudiaIA 2`
- [ ] Installed `EstudiaIA 2.exe` exists and is non-empty
- [ ] Voice helper `resources/voice/tts-helper.exe` exists next to the app
- [ ] ASAR does not include `tests/`, `fixtures`, or `.env*`
- [ ] Previous EstudiaIA installation is untouched

## Runtime (installed app, isolated profile)
- [ ] All main views load: Inicio, Materias, Aprender, Prácticas, Vídeos, Progreso, Ajustes
- [ ] Gemini key can be entered and saved via Ajustes (local storage only)
- [ ] Tutor responds to a real question
- [ ] Five-question practice completes and progress is recorded
- [ ] Progress view shows course-scoped totals and history
- [ ] Plan generation works with a valid future date
- [ ] Lesson creation works (4–6 slides, A/B final question)
- [ ] Video search returns results; "Abrir en YouTube" fallback works
- [ ] Pomodoro runs and pauses without losing time
- [ ] Notes are saved and visible after reopening the view

## Voice (Dalia, es-MX)
- [ ] Dalia voice is the default in Ajustes
- [ ] Voice preview plays from the distributed tts-helper.exe
- [ ] Read-aloud start/pause/stop works
- [ ] No Python/Node from the host is required in the test PATH

## Acceptance
- [ ] User has tested Dalia, made a query, and completed a practice
- [ ] User's real feedback recorded
- [ ] Blocker cases (no keys / no quota / no network) documented if applicable

## Delivery
- [ ] `node scripts/verify-release.cjs` passes on the installed app
- [ ] Installer hash and version recorded
- [ ] Commit `build: package and verify EstudiaIA 2 Windows installer` created
