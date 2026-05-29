# n8n Marketing Creative Two-Workflow Blueprint

This is the best structure for your use case:

- keep the original `Sales / Marketing / Product` fanout
- use that first workflow for strategy only
- send its output into a second workflow for creative production

That keeps the business logic close to the original diagram while making the result actually useful for Instagram-style image generation and broader marketing execution.

## Recommended architecture

### Workflow 1: Strategy Fanout

Purpose:

- turn one campaign brief into a structured strategy package
- keep `Sales`, `Marketing`, and `Product / Creative` reasoning separate
- produce one reusable campaign package

### Workflow 2: Creative Production

Purpose:

- take the strategy package from Workflow 1
- build creative packs
- build image-model requests
- build caption assets
- run compliance checks
- send to manual review
- prepare render or publishing payloads

This split is better than one large workflow because:

- strategy can be reused across multiple asset runs
- production can be swapped to a different image model later
- approvals and publishing stay isolated from planning
- failures in rendering or publishing do not force strategy to rerun

## Files

Use these files together:

- [n8n-ai-fanout-workflow.json](/Users/gugumax/Documents/New project/docs/n8n-ai-fanout-workflow.json)
- [n8n-creative-production-workflow.json](/Users/gugumax/Documents/New project/docs/n8n-creative-production-workflow.json)

## Workflow 1: Strategy Fanout

### Branch roles

#### Sales

Purpose:

- define the offer
- define the CTA
- identify objections
- surface proof points
- shape the conversion goal

Typical recall sources:

- CRM
- offer-performance history
- landing page metrics
- testimonials or proof assets

#### Marketing

Purpose:

- define target segments
- define hooks and messaging angles
- define caption directions
- define channel notes for Instagram and adjacent channels

Typical recall sources:

- analytics
- paid social insights
- organic content performance
- audience research

#### Product / Creative

Purpose:

- turn product and brand context into visual direction
- define prompt ingredients for image models
- define scene concepts and creative rules
- define reusable prompt templates

Typical recall sources:

- product catalog
- brand guidelines
- moodboards
- approved visual references

### Workflow 1 output contract

Workflow 1 returns one structured object with:

- `campaign_meta`
- `sales`
- `marketing`
- `product`
- `creative_targets`
- `strategy_status`

This object is the input to Workflow 2.

## Workflow 2: Creative Production

### Stages

1. Normalize incoming strategy package.
2. Build the creative pack.
3. Build image-model requests.
4. Build caption assets.
5. Merge image and caption outputs.
6. Run compliance and brand checks.
7. Send to manual approval.
8. Prepare render queue or publishing payloads.
9. Return a production package.

### Production output contract

Workflow 2 returns:

- `campaign_meta`
- `creative_pack`
- `image_model_requests`
- `caption_assets`
- `render_queue_payload`
- `compliance_status`
- `approval_status`
- `status`

## Why this is the best fit

This keeps the original fanout almost unchanged, which matches what the workflow author described:

- the fanout generates the thinking
- the final output becomes Instagram-style model-ready creative inputs
- the same output also supports general marketing work, not just Instagram

In practice:

- `Sales` tells the system what should convert
- `Marketing` tells the system what should attract attention
- `Product / Creative` tells the system what the generated visuals should look like

## Import order

1. Import [n8n-ai-fanout-workflow.json](/Users/gugumax/Documents/New project/docs/n8n-ai-fanout-workflow.json).
2. Import [n8n-creative-production-workflow.json](/Users/gugumax/Documents/New project/docs/n8n-creative-production-workflow.json).
3. Attach Azure OpenAI credentials to the Azure chat model nodes in Workflow 1.
4. Replace the three `Data Recall` placeholder nodes in Workflow 1 with your real sources.
5. Open Workflow 2 and test it with the built-in `Manual Trigger` sample path.
6. After both workflows work independently, add an `Execute Sub-workflow` node in Workflow 1 after `Create Strategy Package` and point it to Workflow 2.

## Why the parent-child link is manual

This is intentional for portability.

The current n8n docs say the parent can call the child by database ID, local file, JSON parameter, or URL. In practice, hardcoding a workflow ID inside an exported scaffold is brittle because the child workflow ID is instance-specific after import.

So this scaffold gives you:

- a parent workflow that already emits the correct handoff package
- a child workflow that already starts with `Execute Sub-workflow Trigger`

Then you do the final link inside your n8n instance after import.

That recommendation is an inference from the docs and export behavior, not a direct requirement in the docs.

## Guardrails

- Keep image outputs original or licensed.
- Do not use the workflow to imitate a real individual.
- Use manual review before rendering at scale or publishing externally.
- If synthetic people appear in marketing content, apply the disclosure, approval, and legal review your platform and jurisdiction require.

## References

- [Execute Sub-workflow](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/)
- [Execute Sub-workflow Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger/)
- [Sub-workflows](https://docs.n8n.io/flow-logic/subworkflows/)
- [AI Agent docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/)
- [Basic LLM Chain docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.chainllm/)
- [Structured Output Parser docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.outputparserstructured/)
- [Azure OpenAI Chat Model docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatazureopenai/)
- [Merge docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/)
