# AI Document Summarization

This document describes the Stage 3 document-summary flow implemented by the API and web client.

## Request and authorization

The web client sends an authenticated `POST` request to:

```text
/api/v1/workspaces/:workspaceId/documents/:documentId/summarize
```

The API requires a valid session and loads the document through `DocumentsService`, which enforces workspace membership before opening the stream. The endpoint is rate-limited to three requests per minute per throttler key. The Groq API key remains in the API service; it is never sent to the browser.

## Server-Sent Events contract

The endpoint responds with `Content-Type: text/event-stream`. Events are JSON objects in SSE `data:` frames, separated by a blank line.

| Event | Payload | Meaning |
| --- | --- | --- |
| `started` | `{ "type": "started" }` | The API has opened the stream and begun processing. |
| `progress` | `{ "type": "progress", "receivedCharacters": number, "partialSummary": string }` | More model output has arrived. `receivedCharacters` counts generated JSON characters; `partialSummary` contains the currently extractable summary text. |
| `complete` | `{ "type": "complete", "result": DocumentSummary }` | Generation ended and the complete JSON response passed server-side parsing and schema validation. |
| `error` | `{ "type": "error", "message": string, "status": number }` | Processing failed. The API sends a safe client-facing message and then closes the stream. |

The model is instructed to return a JSON object containing `summary`, `keyPoints`, and `actionItems`. Because the JSON is streamed before it is complete, the API extracts the `summary` string incrementally for the progress preview. The preview is provisional: it is not the validated final result and should not be treated as complete until a `complete` event arrives.

## Web client behavior

The frontend consumes the response body with Fetch's readable stream and a `TextDecoder`; it parses complete SSE frames as they arrive. It does not wait for the entire response before processing progress events.

While generation is active, the UI displays the received-character count and the partial summary preview. On `complete`, it replaces the preview with the validated summary and renders key points, action items, model, latency, and usage/cost metadata. On `error` or a transport failure, the client reports an error rather than presenting a partial preview as a successful summary.

If the client disconnects before the response ends, the API aborts the provider request where possible.

## Validation and operational limits

- Document content must be non-empty and no longer than 20,000 characters.
- The final model response must be valid JSON with a non-empty summary, 1–8 key points, and 0–8 action items; field lengths are bounded in the API schema validation.
- The API applies a conservative per-request estimated-cost ceiling before calling the provider. This is a per-request guard, not a cumulative daily or monthly budget.
- Provider timeout, rate-limit, availability, invalid-output, and request-budget errors are mapped to controlled API responses.
- Successful and failed requests are logged with model, latency, token usage when available, estimated cost when available, and outcome. Document content and generated summary text are not included in those structured usage logs.

## Manual verification

1. Open a document in a workspace where the signed-in user is a member.
2. Start AI summarization.
3. In browser DevTools, inspect the summarize request's **EventStream** view. Expect `started`, one or more `progress` events, and then `complete` on success.
4. Confirm the partial summary preview changes while generation is in progress, then confirm the final summary, key points, and action items appear after completion.
5. Confirm model, latency, token usage, and estimated cost are shown when provider usage data is available.

Seeing SSE events in DevTools verifies network-level event delivery. Seeing the preview update before `complete` verifies that the UI is also rendering the stream incrementally.
