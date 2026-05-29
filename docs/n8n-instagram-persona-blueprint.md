# n8n Instagram Persona Workflow Blueprint

This version matches the goal you clarified: building an Instagram-style creator system that can produce a profile package, a starter grid, and reusable content prompts.

Use it for either:

- an original fictional creator persona, or
- a real creator who has consented to the workflow and content generation.

Do not use it to imitate a real person without consent or to pass a synthetic persona off as a real individual deceptively.

## Better workflow shape for this goal

The earlier `Sales / Marketing / Product` fanout is the wrong abstraction for this use case.

For an Instagram-style creator, the useful branches are:

1. `Profile Strategy`
2. `Visual Direction`
3. `Editorial / Caption Planning`

Then:

4. Merge the three branches.
5. Build a starter content package.
6. Prepare image generation requests.
7. Run a compliance gate.
8. Optionally queue for posting.

## What this workflow produces

- creator name ideas
- bio copy
- highlight titles
- tone and persona rules
- visual style rules
- a 9-post starter grid prompt pack
- caption drafts
- hashtag clusters
- final structured package for review or publishing

## Recommended n8n flow

| Goal | n8n node(s) in scaffold | Purpose |
| --- | --- | --- |
| Start workflow | `Manual Trigger` | Replace later with `Webhook`, `Form Trigger`, or `Schedule Trigger`. |
| Define creator brief | `Set` | Shared input for all branches. |
| Profile Strategy | `AI Agent` + `Azure OpenAI Chat Model` + `Basic LLM Chain` + `Structured Output Parser` | Defines name, bio, highlights, tone, disclosure. |
| Visual Direction | `AI Agent` + `Azure OpenAI Chat Model` + `Basic LLM Chain` + `Structured Output Parser` | Defines styling rules and prompt pack for the starter grid. |
| Editorial Planning | `AI Agent` + `Azure OpenAI Chat Model` + `Basic LLM Chain` + `Structured Output Parser` | Defines captions, hashtags, and cadence. |
| Bundle creator package | `Merge` + `Code` | Combines all outputs into one structured package. |
| Prepare image generation | `Code` | Placeholder node that builds the image provider request payload. |
| Compliance gate | `Code` | Enforces disclosure and blocks mimic/impersonation flags. |
| Publish queue | `Code` | Placeholder for Meta Graph API or a queue system. |

## Important implementation notes

- Keep the persona original. Do not ask the model to replicate a specific real person.
- If the account is synthetic, add disclosure in bio, captions, or account metadata based on your platform/legal requirements.
- For visual consistency across many posts, use an image provider that supports reference images, consistent seeds, or a fine-tuned style model trained only on licensed/generated material.
- If you want direct posting to Instagram, use a business/creator account and Meta Graph API where permitted.

## Creator brief inputs

The scaffold expects these top-level fields:

- `concept`
- `audience`
- `platform`
- `aesthetic`
- `tone`
- `disclosure_policy`
- `identity_mode`

Recommended values:

- `platform`: `instagram`
- `disclosure_policy`: `clear`
- `identity_mode`: `original_fictional`

## Branch prompts

### Profile Strategy system prompt

```text
You are building the strategy for an Instagram creator profile.
Create a coherent persona, profile voice, and profile structure from the provided brief.
Keep the output platform-ready, concise, and brand-consistent.
Do not imitate a real public figure or private person.
If the persona is synthetic, preserve clear disclosure language.
```

### Visual Direction system prompt

```text
You are the visual director for an Instagram creator account.
Create a repeatable visual identity that can produce a cohesive grid.
Focus on styling, color palette, framing, lighting, wardrobe, hair, locations, and prompt consistency.
Do not reference or mimic a real individual.
```

### Editorial Planning system prompt

```text
You are the editorial strategist for an Instagram creator account.
Create captions, posting angles, and hashtag clusters that fit the persona and visual identity.
Keep the writing natural, concise, and platform-native.
Avoid deceptive claims or undisclosed synthetic identity framing.
```

## Structured output schemas

### Profile schema

```json
{
  "type": "object",
  "properties": {
    "profile_name": { "type": "string" },
    "profile_category": { "type": "string" },
    "bio": { "type": "string" },
    "tone_rules": {
      "type": "array",
      "items": { "type": "string" }
    },
    "highlight_titles": {
      "type": "array",
      "items": { "type": "string" }
    },
    "disclosure_line": { "type": "string" }
  },
  "required": ["profile_name", "profile_category", "bio", "tone_rules", "highlight_titles", "disclosure_line"]
}
```

### Visual schema

```json
{
  "type": "object",
  "properties": {
    "visual_style": { "type": "string" },
    "palette": {
      "type": "array",
      "items": { "type": "string" }
    },
    "style_rules": {
      "type": "array",
      "items": { "type": "string" }
    },
    "avatar_prompt": { "type": "string" },
    "starter_grid_prompts": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["visual_style", "palette", "style_rules", "avatar_prompt", "starter_grid_prompts"]
}
```

### Editorial schema

```json
{
  "type": "object",
  "properties": {
    "voice": { "type": "string" },
    "posting_cadence": { "type": "string" },
    "caption_templates": {
      "type": "array",
      "items": { "type": "string" }
    },
    "hashtag_clusters": {
      "type": "array",
      "items": { "type": "string" }
    },
    "cta_style": { "type": "string" }
  },
  "required": ["voice", "posting_cadence", "caption_templates", "hashtag_clusters", "cta_style"]
}
```

## The most important real-world replacement

The single most important node you will replace is `Prepare Image Generation Request`.

That node should eventually become:

- `HTTP Request` to an image API
- or a custom internal image service
- or a queue node that hands prompts to a renderer

Typical request payload fields:

- reference bundle or style seed
- prompt
- negative prompt
- aspect ratio
- batch size
- consistency seed
- safety mode

## Compliance gate rules

The scaffold includes a simple code gate. In production, add stronger checks:

- block `identity_mode` values that imply a real person clone
- require disclosure when persona is synthetic
- run text moderation on captions and bio
- run image moderation on generated images
- require manual review before posting

## Import and next steps

1. Import [n8n-instagram-persona-workflow.json](/Users/gugumax/Documents/New project/docs/n8n-instagram-persona-workflow.json) into n8n.
2. Attach Azure OpenAI credentials to all Azure chat model nodes.
3. Test the three branches with your persona brief.
4. Replace `Prepare Image Generation Request` with your actual image generation step.
5. Replace `Queue For Publish` with your actual scheduler or Meta Graph API step.

## Recommended next iteration

After this starter workflow, the next useful workflow is a recurring content engine:

- take analytics from the last 7-30 days
- generate 3-10 new post concepts
- generate prompts and captions
- send to approval
- publish on schedule

## References

- [AI Agent docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/)
- [Basic LLM Chain docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainllm/)
- [Structured Output Parser docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.outputparserstructured/)
- [Azure OpenAI Chat Model docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatazureopenai/)
- [Merge docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/)
