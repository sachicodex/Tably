# Tably

<p align="center">
  <img src="assets/img/logo/tably.png" alt="Tably Logo" width="140" />
</p>

<p align="center">
  macOS-inspired new tab extension with search, quick links, dock shortcuts, personalization, and privacy lock.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-1f6feb" alt="Manifest Badge" />
  <img src="https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Firefox-2ea44f" alt="Platform Badge" />
  <img src="https://img.shields.io/badge/Type-New%20Tab%20Extension-111827" alt="Type Badge" />
  <img src="https://img.shields.io/badge/Version-3.17.6-blue" alt="Version Badge" />
</p>

## About

Tably replaces your browser new tab with a clean, productivity-first dashboard:
- Fast Google web search with keyboard-friendly suggestions.
- Voice typing from the search bar mic button.
- Quick links cards and dock shortcuts with custom URLs/icons.
- Background image personalization and layout toggles.
- Optional browser privacy lock with startup unlock flow.

## Features

| Icon | Feature | What you get |
|---|---|---|
| &#128269; | Smart search | Type anywhere to focus search, get suggestions, and open results instantly. |
| &#127908; | Voice input | Speak through the mic button to fill search text quickly. |
| &#128279; | Quick links cards | Edit URLs + images for top shortcuts and save to local storage. |
| &#128187; | Dock shortcuts | macOS-style dock with editable items and add/remove support. |
| &#127912; | Personalization | Apply your own background image and adjust dashboard sections. |
| &#128274; | Privacy lock | Password-protect browser session with optional `Alt+Enter` bypass. |
| &#9881; | Settings sidebar | Manage layout, personalization, lock setup, and dark-page helper in one place. |

## Layout Controls

Toggle each section from `Settings -> Layout Controls`:
- Week Day
- Time
- Search Bar
- Quick Links Tab
- Dock Tab

## Privacy Lock

`Settings -> Privacy Lock` lets you:
- Enable/disable browser lock.
- Set or update lock password.
- Allow optional `Alt+Enter` bypass on lock screen.

When enabled, Tably opens a lock window on browser startup and requires unlock before normal browsing resumes.

## How to Use

1. Open a new tab after installing Tably.
2. Search from the center bar (or click mic for voice input).
3. Open `Settings` from the side toggle button.
4. Use `Layout Controls` to show/hide dashboard sections.
5. Use `Personalization` to:
   - Upload custom background
   - Edit/save quick links
   - Edit/save dock links
6. (Optional) Configure `Privacy Lock` and save.

## Keyboard & Interaction

| Key / Action | Result |
|---|---|
| Type on page | Focuses search input automatically |
| `Enter` in search | Opens Google search |
| `Arrow Up` / `Arrow Down` | Navigate search suggestion list |
| `Escape` | Close suggestions / close sidebar |
| Click dock icon | Open dock URL in current tab |
| `Alt+Enter` on lock page | Bypass unlock if enabled in lock settings |

## Tech Stack

| Area | Tech |
|---|---|
| Extension standard | Chrome Extensions Manifest V3 |
| UI | HTML, CSS, Vanilla JavaScript |
| Storage | `chrome.storage.local` / `browser.storage.local` |
| Runtime APIs | Tabs, Windows, Runtime Messaging |
| Search target | Google Search |

## Version

Current version: **3.17.6**

## Support

- Developer: **Sachintha Lakshan**
