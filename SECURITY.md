# FigmaLint — Security & Privacy Brief

This document is written for security, IT, and AI-enablement teams evaluating FigmaLint for use on managed/work machines. It describes exactly what the plugin does, what data leaves the machine, where it goes, and how to constrain it to an approved provider (e.g. Azure OpenAI / Azure AI Foundry).

FigmaLint is **open source** (ISC license). Everything below can be verified in the source.

## What FigmaLint is

A Figma plugin that audits components for design-system compliance, accessibility, and developer readiness, and generates handoff documentation. Analysis is performed by an AI model that **you** supply an API key for. FigmaLint is a client-side tool — there is **no FigmaLint-operated backend that receives your design data**.

## Execution & sandbox

- Runs entirely inside Figma's plugin sandbox: a sandboxed main thread plus a sandboxed iframe UI. It has no filesystem, OS, or network access beyond what Figma grants.
- **Network access is allowlisted in the plugin manifest and enforced by Figma.** Any request to a domain not on the list is blocked by the Figma runtime. The complete allowlist is:

  | Domain | Purpose | When contacted |
  |---|---|---|
  | `api.anthropic.com` | Anthropic (Claude) API | Only if you select Anthropic |
  | `api.openai.com` | OpenAI API | Only if you select OpenAI **without** a custom endpoint |
  | `generativelanguage.googleapis.com` | Google (Gemini) API | Only if you select Google |
  | `*.openai.azure.com`, `*.ai.azure.com`, `*.cognitiveservices.azure.com` | Azure OpenAI / Azure AI Foundry | Only if you configure a custom Azure endpoint |
  | `openrouter.ai` | OpenRouter (multi-vendor gateway) | Only if you select OpenRouter |
  | `design-systems-mcp.southleft-llc.workers.dev` | FigmaLint design-systems knowledge service | Best-practice lookups during analysis and the chat feature |

  There is **no analytics, telemetry, crash-reporting, or tracking endpoint** — the list above is exhaustive.

## Where API keys are stored

- Keys are stored **locally** in Figma's per-user `clientStorage`, one entry per provider. They are never uploaded to any FigmaLint-controlled server.
- A key is only ever transmitted to that provider's own API, in the request auth header (`Authorization: Bearer …`, or `api-key: …` for Azure).
- Keys can be cleared at any time from the plugin UI.

## What data leaves the machine, and to whom

1. **To your selected AI provider** (your key, your account): when you run an analysis or chat, FigmaLint sends a prompt containing the selected component's structure — layer names, variant/property definitions, detected tokens and hard-coded values, and accessibility-relevant attributes. This is the design context needed to audit the component. It goes **only** to the provider you chose, authenticated with **your** key. With the Azure option below, this goes only to your Azure tenant.
2. **To the design-systems knowledge service** (`design-systems-mcp.southleft-llc.workers.dev`): best-practice lookups during analysis and any questions you type into the chat. The payload is the query text plus high-level component context (component family and names). It does **not** include your API keys.
3. **Local only**: your most recent analysis result is cached in Figma's plugin storage so it can be restored when you reopen the plugin. It is not transmitted.

No fixes are written to your file without an explicit confirmation step in the UI.

## Billing / budget separation

API usage is billed to the account that **issues the key**, entirely separate from any Claude/ChatGPT/Gemini consumer or team subscription. If you use the Azure option, usage is billed to your **Azure subscription**, under your organization's existing cloud agreement — not to any external OpenAI or Anthropic account.

## Recommended configuration for approved-provider-only environments (Azure)

If your organization's process only approves models hosted in your own Azure tenant, configure FigmaLint's OpenAI provider to use a **custom Azure endpoint**:

1. Provider: **OpenAI (GPT)**.
2. Expand **Custom endpoint (Azure / OpenAI-compatible)**.
3. **Endpoint URL** — your Azure deployment's chat-completions URL. The recommended form is Azure's OpenAI-compatible v1 API:
   `https://YOUR-RESOURCE.openai.azure.com/openai/v1/chat/completions`
   (Azure AI Foundry endpoints under `*.services.ai.azure.com` also work.)
4. **Deployment / model name** — the name of your Azure deployment.
5. **API key** — your Azure resource key.

With this set:
- All model traffic goes to `*.azure.com` (your tenant). **Nothing routes through `api.openai.com`.**
- The Azure key is sent via the `api-key` header (handled automatically).
- The key is not required to be an `sk-…` OpenAI key; Azure/gateway key formats are accepted.

This lets an AI-enablement team deploy an approved model into Azure AI Foundry and point the plugin at it, keeping both the data path and billing inside the organization's Azure boundary.

## OpenRouter (consolidated model access)

[OpenRouter](https://openrouter.ai) is a gateway that fronts many model vendors behind one key and one bill. It is selectable as its own provider:

1. **AI Provider** — OpenRouter.
2. **API key** — your OpenRouter key (`sk-or-v1-…`).
3. **Model** — pick from the shortlist, or paste any slug from openrouter.ai/models into **Other model slug**.

Notes for reviewers:
- Requests go to `openrouter.ai` only, authenticated with `Authorization: Bearer`. OpenRouter then routes to the upstream model provider you selected in the slug, under **its** data policy — review OpenRouter's model-routing and data-retention settings if that matters to your organization.
- FigmaLint sends two optional attribution headers (`HTTP-Referer`, `X-Title`) identifying the plugin in your OpenRouter activity log. They carry no user or document data.
- Billing goes to your OpenRouter account.

## Permissions requested

From `manifest.json`: `currentuser` (identify the current user), `teamlibrary` (read published library variables so tokens can live in a separate file), and `documentAccess: dynamic-page`. No access to other files, accounts, or org resources beyond the open file.

## Summary for reviewers

- Open source, client-side only, no vendor backend receiving design data.
- Egress is manifest-allowlisted and Figma-enforced; the full list is above; no telemetry.
- Keys are local, sent only to the chosen provider.
- Can be constrained to your own Azure tenant for both data path and billing.

Questions or a deeper review: https://github.com/southleft/figmalint/issues
