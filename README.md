# figma-ds-cli

<p align="center">
  <a href="https://intodesignsystems.com"><img src="https://img.shields.io/badge/Into_Design_Systems-intodesignsystems.com-ff6b35" alt="Into Design Systems"></a>
  <img src="https://img.shields.io/badge/Figma-Desktop-purple" alt="Figma Desktop">
  <img src="https://img.shields.io/badge/No_API_Key-Required-green" alt="No API Key">
  <img src="https://img.shields.io/badge/Talk_to-Claude-blue" alt="Talk to Claude">
</p>

<p align="center">
  <b>Talk in plain English. Watch Figma build.</b><br>
  You describe what you want, an AI assistant builds it live in your Figma Desktop.<br>
  No API key. No copy-paste. No plugin to babysit. No code to write.
</p>

---

## What is this?

figma-ds-cli lets an **AI assistant build directly in your Figma Desktop**, while you talk to it in normal language.

You don't run commands or write code. You open **Claude** in this project and say things like:

> "Create three pricing cards."
> "Use my brand's design system."
> "Make those buttons look like Stripe."
> "Check the contrast on this screen."

Claude does the rest. Figma updates in real time, in front of you.

It works with real, editable Figma , actual frames, components, variants and variables , not a flat image. And it runs **locally**: no API key, nothing sent to a cloud service.

---

## Setup , let Claude do it for you

You don't install this by hand. You get **Claude Code**, point it at this project, and ask it to set everything up. Here's the whole thing:

### 1. Have these ready
- **Figma Desktop** , installed and open ([download](https://www.figma.com/downloads/)).
- **Claude Code** , Anthropic's AI assistant for your computer. [Install it here](https://docs.claude.com/en/docs/claude-code) (one command, takes a minute).

### 2. Get this project onto your computer
Don't know git? No problem. Open Claude Code anywhere and paste:

> "Download the figma-cli project from https://github.com/silships/figma-cli into a folder in my home directory, then go into it."

(Or, if you prefer: click the green **Code** button on the GitHub page → **Download ZIP** → unzip it.)

### 3. Let Claude install and connect it
Open Claude Code **inside the project folder** and say:

> "Set up figma-cli and connect it to my Figma."

Claude reads the project's instructions, installs what's needed, and connects to your open Figma Desktop. You watch , you don't type commands.

When it says it's connected, you're done. ✅

### 4. Start designing , just talk
Now describe what you want:

> "Add my brand colors, then create a primary button and a secondary button."

Claude builds it in Figma instantly.

---

## What you can ask for

Just say it in plain language. A few examples:

**Build things**
- "Create 5 pricing cards in a row."
- "Make a login form."
- "Build a dashboard layout."
- "Add a dialog / a calendar / a sidebar." *(40+ shadcn/ui components available)*

**Use a design system**
- "Add shadcn colors" or "add Tailwind colors."
- "Make these in Stripe's style" / "use the Linear design system."
- "Use my brand's variables on these cards."

**Bring your own brand**
- "Import this design system" *(point it at a `DESIGN.md` file , see below)*
- "Switch this design from Stripe to Apple." *(swap a whole layout between brands)*

**Polish & hand off**
- "Check the color contrast / touch targets / text sizes."
- "Export this as PNG / SVG."
- "Turn this into a reusable component with Small / Medium / Large variants."

You never memorize commands. Claude knows them , you just describe the outcome.

---

## Bring your own design system

Have a brand or a design system? Put it in a single `DESIGN.md` file (colors, type, spacing) and tell Claude:

> "Import ~/Downloads/my-DESIGN.md into Figma."

It creates real Figma variables (`primary`, `canvas`, `ink`, `accent`, …) you can use everywhere , and you can switch a design between systems on demand ("now make it look like Vercel"). Ready-made `DESIGN.md` files for popular brands work too.

---

## Works offline / with local AI

Prefer to keep everything on your machine? figma-ds-cli also works with **local LLMs** (via LM Studio or Ollama) , fully offline, no cloud, no key. Ask Claude to "set up the local LLM agent" and it'll walk you through it.

---

## For developers

Everything above is powered by a CLI that the AI calls for you. If you want to use it directly, script it, or see every command:

- **[REFERENCE.md](REFERENCE.md)** , full command reference (tokens, render/JSX, components, gradients, a11y, export, the offline Figma API spec, and more).
- Two connection modes: **Yolo** (direct, recommended) and **Safe** (plugin-based, no patching). Claude picks the right one during setup.

You don't need any of this to use the tool , it's here for tinkerers.

---

## Why this exists

Figma plugins are slow to build and tied to one UI. AI assistants are great at *describing intent* but need a clean way to act on Figma. figma-ds-cli is the bridge: it talks to Figma Desktop directly, so you can design by conversation , locally, with no API key and no cloud roundtrip.

**You design. The AI builds. Figma updates.**

---

## License

MIT. Built by [Sil Bormüller](https://intodesignsystems.com).
