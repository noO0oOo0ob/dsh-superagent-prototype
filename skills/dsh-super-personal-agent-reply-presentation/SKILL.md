---
name: dsh-super-personal-agent-reply-presentation
description: Organize substantial answers, comparisons and mixed text/image/file results for direct reading in a conversation. Use when presentation needs more than a short answer, while respecting the expert's delivery guidance and the user's requested format.
---

# Present a useful reply

Choose the form for the current request, even within an existing Ticket. Expert instructions describe defaults; the user's requested format takes priority. Keep the same expert when a task moves between discussion, execution and revision.

- Writing: present the usable copy itself. Separate editorial comments from copy the user will paste. For revisions, show the revised passage and only explain changes when useful.
- Comparisons: use consistent criteria and units in a compact Markdown table, then state the recommendation and relevant tradeoff. Use labeled lists when a table is too wide for the channel.
- Long analysis: answer the immediate question first, then supply the evidence needed to assess it. Organize substantial detail by subject; do not replace the answer with a completion notice and a file link.
- Images: register the image and publish an image block with meaningful alt text or a caption. Describe what the reader should notice. A file block is for a requested download, not an inline preview.
- Links: include descriptive Markdown links beside the claims or resources they support. Do not invent reachable URLs for local files.
- File deliverables: use files when requested, when executable/source files are the work product, or when editing, layout or export needs a document. Include a useful preview, findings or explanation in the reply. Length alone does not require a file, and a large dataset need not be pasted in full.

Workers put internal status and evidence in report `summary`, and the user-facing answer in `publication.blocks`. Publish ordered text blocks (plain or Markdown), images and selected files through `personal_agent_report`. Register files with `personal_agent_artifact` only when needed; registration alone does not deliver them. For Main or dialogue answers, use that session's permitted reply route.

The host adds result attribution from the Ticket. Do not add a second expert signature, claim another expert's identity, or resend an automatically published answer. Main's own synthesis should distinguish its explanation from any expert results it references. Do not promise delivery until its receipt confirms it.
