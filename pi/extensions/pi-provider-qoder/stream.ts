import crypto from "node:crypto";
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  TextContent,
  ThinkingContent,
  ToolCall,
} from "@earendil-works/pi-ai";
import * as PiAi from "@earendil-works/pi-ai";
import {
  buildAuthHeaders,
  getMachineId,
  getQoderChatURL,
  getQoderCNDirectModel,
  getQoderMode,
  getQoderUserEmailFallback,
  isQoderCNMode,
} from "./cosy.ts";
import { getCachedModelConfig } from "./models.ts";
import { getCachedCredentials } from "./oauth.ts";
import { qoderEncodeBody } from "./qoder-encoding.ts";
import { resolveQoderReasoningEffort, type QoderStreamOptions } from "./reasoning.ts";
import { ThinkingTagParser } from "./thinking-parser.ts";
import { createQoderUsageUpdater } from "./token-usage.ts";
import { transformMessagesForQoder, transformTools } from "./transform.ts";

interface ToolCallState {
  arguments: string;
  id: string;
  name: string;
  emittedStart?: boolean;
  emittedEnd?: boolean;
  contentIndex: number;
}

// Malformed JSON is tolerated, but business errors must reach the terminal error handler.
function parseSseEnvelope(data: string): Record<string, any> | "[DONE]" | undefined {
  if (data === "[DONE]") return data;
  let envelope;
  try {
    envelope = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!envelope || typeof envelope !== "object") return undefined;
  const status = envelope.statusCodeValue;
  if (status !== undefined && status !== null && status !== 200 && status !== "200") {
    const detail = envelope.body || envelope.message || envelope.error || "No error details";
    throw new Error(`Upstream status ${String(status)}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  if (envelope.body === "[DONE]") return "[DONE]";
  let inner;
  try {
    inner = typeof envelope.body === "string" ? JSON.parse(envelope.body) : envelope.body;
  } catch {
    return undefined;
  }
  return inner && typeof inner === "object" ? inner : undefined;
}

function mapFinishReason(reason: unknown): "stop" | "length" | "toolUse" | undefined {
  switch (reason) {
    case undefined:
    case null:
    case "":
      return undefined;
    case "stop":
    case "end":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "toolUse";
    default:
      // Includes content_filter/network_error. Never turn an unrecognized
      // provider termination into a successful completion or an illegal enum.
      throw new Error(`Qoder finish_reason: ${String(reason)}`);
  }
}

function redactError(message: string, secrets: string[]): string {
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const form of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]) {
      message = message.split(form).join("[REDACTED]");
    }
  }
  return message
    .replace(/\bBearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(
      /((?:["']?)(?:authorization|access[_-]?token|refresh[_-]?token|security_oauth_token|api[_-]?key|cosy-key|cosy-machinetoken)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'[^']*'|[^\s,;}]+)/gi,
      "$1\"[REDACTED]\"",
    );
}

function stableHash(prefix: string, ...inputs: string[]): string {
  const hash = crypto.createHash("sha256");
  hash.update(prefix);
  for (const input of inputs) {
    hash.update("\0");
    hash.update(input);
  }
  return hash.digest("hex").slice(0, 16);
}

function stableChatRecordID(
  model: string,
  messages: Array<{ role?: string; content?: unknown }>,
  tools: unknown,
  maxTokens: number,
): string {
  const hash = crypto.createHash("sha256");
  hash.update("qoder-record");
  hash.update("\0");
  hash.update(model);
  for (const msg of messages) {
    if (msg?.role) {
      hash.update("\0");
      hash.update(msg.role);
    }
    if (msg?.content) {
      hash.update("\0");
      hash.update(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    }
  }
  if (tools) {
    hash.update("\0");
    hash.update(JSON.stringify(tools));
  }
  hash.update("\0");
  hash.update(`mt=${maxTokens}`);
  return hash.digest("hex").slice(0, 16);
}

export function streamQoder(
  model: Model<Api>,
  context: Context,
  options?: QoderStreamOptions,
): AssistantMessageEventStream {
  const StreamCtor = (PiAi as unknown as { AssistantMessageEventStream: new () => AssistantMessageEventStream })
    .AssistantMessageEventStream;
  const stream = new StreamCtor();

  const output: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };

  const updateUsage = createQoderUsageUpdater(output.usage);

  (async () => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const secrets = [options?.apiKey || ""];
    try {
      options?.signal?.throwIfAborted();
      const providerMode = model.provider === "qoder-cn" ? "cn" : getQoderMode();
      const accessToken = options?.apiKey;
      if (!accessToken) {
        throw new Error(
          isQoderCNMode(providerMode)
            ? "Qoder CN credentials not set. Run /login qoder-cn or set QODERCN_PERSONAL_ACCESS_TOKEN."
            : "Qoder credentials not set. Run /login qoder or set QODER_PERSONAL_ACCESS_TOKEN.",
        );
      }

      // Resolve user details from cached credentials
      const cachedCreds = getCachedCredentials(accessToken, model.provider);
      secrets.push(cachedCreds?.access || "", cachedCreds?.refresh || "");
      const userID = cachedCreds?.userID || "qoder-user";
      const name = cachedCreds?.name || (isQoderCNMode(providerMode) ? "Qoder CN User" : "Qoder User");
      const email = cachedCreds?.email || getQoderUserEmailFallback(providerMode);
      const machineID = cachedCreds?.machineID || getMachineId();

      const qoderModel = isQoderCNMode(providerMode) ? getQoderCNDirectModel(model.id) : model.id;
      const modelConfig = getCachedModelConfig(qoderModel, providerMode) || {
        key: qoderModel,
        is_reasoning:
          qoderModel === "ultimate" ||
          qoderModel === "performance" ||
          qoderModel.includes("dmodel") ||
          qoderModel.includes("dfmodel"),
        max_output_tokens: 32768,
        source: "system",
      };
      modelConfig.key = qoderModel;

      const reasoningEffort = resolveQoderReasoningEffort(modelConfig, options?.reasoning);
      const isReasoning = !!modelConfig.is_reasoning;
      const maxOutputTokens = modelConfig.max_output_tokens || 32768;

      const normalizedMessages = transformMessagesForQoder(context.messages);
      const systemText = context.systemPrompt || "";

      // Qoder's agent_chat_generation endpoint runs its own server-side agent and
      // does not surface the top-level `system` field to the underlying model, so
      // pi's system prompt (which advertises available skills) never reaches it.
      // Deliver it through the messages transcript, which the agent forwards.
      if (systemText) {
        normalizedMessages.unshift({ role: "system", content: systemText });
      }

      let lastUserText = "";
      for (let i = normalizedMessages.length - 1; i >= 0; i--) {
        if (normalizedMessages[i].role === "user") {
          const content = normalizedMessages[i].content;
          lastUserText =
            typeof content === "string"
              ? content
              : Array.isArray(content)
                ? content.map((c) => ("text" in c ? c.text : "")).join("")
                : "";
          break;
        }
      }

      const sessionID = stableHash("qoder-session", userID, qoderModel);

      let maxTokens = 32768;
      if (maxOutputTokens > 0) {
        maxTokens = maxOutputTokens;
      }
      if (options?.maxTokens && options.maxTokens < maxTokens) {
        maxTokens = options.maxTokens;
      }

      const toolsRaw = context.tools && context.tools.length > 0 ? transformTools(context.tools) : undefined;
      const recordID = stableChatRecordID(qoderModel, normalizedMessages, toolsRaw, maxTokens);

      const reqBody: Record<string, unknown> = {
        request_id: crypto.randomUUID(),
        request_set_id: recordID,
        chat_record_id: recordID,
        session_id: sessionID,
        stream: true,
        chat_task: "FREE_INPUT",
        is_reply: true,
        is_retry: false,
        source: 1,
        version: "3",
        session_type: "qodercli",
        agent_id: "agent_common",
        task_id: "common",
        code_language: "",
        chat_prompt: "",
        image_urls: null,
        aliyun_user_type: "",
        system: "",
        messages: normalizedMessages,
        tools: toolsRaw || [],
        parameters: {
          max_tokens: maxTokens,
          ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
        },
        chat_context: {
          chatPrompt: "",
          imageUrls: null,
          extra: {
            context: [],
            modelConfig: {
              key: qoderModel,
              is_reasoning: isReasoning,
            },
            originalContent: lastUserText,
          },
          features: [],
          text: lastUserText,
        },
        model_config: modelConfig,
        business: {
          product: "cli",
          version: "1.0.0",
          type: "agent",
          stage: "start",
          id: crypto.randomUUID(),
          name: lastUserText.substring(0, 30),
          begin_at: Date.now(),
        },
      };

      const bodyBytes = Buffer.from(JSON.stringify(reqBody));
      const encodedBytes = await qoderEncodeBody(bodyBytes);

      const chatURL = getQoderChatURL(providerMode);

      const headers = buildAuthHeaders(encodedBytes, chatURL, {
        userID,
        authToken: accessToken,
        name,
        email,
        machineID,
      });

      secrets.push(headers.Authorization, headers["Cosy-Key"], headers["Cosy-Machinetoken"]);
      const modelSource = modelConfig.source || "system";

      const response = await fetch(chatURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          "Accept-Encoding": "identity",
          "X-Model-Key": qoderModel,
          "X-Model-Source": modelSource,
          ...headers,
        },
        body: encodedBytes,
        signal: options?.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Qoder API request failed: ${response.status} ${response.statusText}. Response: ${errText}`);
      }

      reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";

      let contentBlockIndex = -1;
      let thinkingBlockIndex = -1;
      const toolCallsState: ToolCallState[] = [];

      const thinkingParser = options?.parseThinkingTags !== false ? new ThinkingTagParser(output, stream) : null;

      stream.push({ type: "start", partial: output });

      readLoop: while (true) {
        options?.signal?.throwIfAborted();
        const { done, value } = await reader.read();
        options?.signal?.throwIfAborted();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const lineEnd = buffer.indexOf("\n");
          if (lineEnd === -1) break;

          const line = buffer.substring(0, lineEnd).trim();
          buffer = buffer.substring(lineEnd + 1);

          if (!line.startsWith("data:")) continue;

          const dataStr = line.substring(5).trim();
          const inner = parseSseEnvelope(dataStr);
          if (inner === "[DONE]") break readLoop;
          if (inner) {
            // Final usage often arrives on a separate frame with no choices.
            updateUsage(inner.usage);
            if (inner.choices && inner.choices.length > 0) {
              const choice = inner.choices[0];
              const delta = choice.delta;

              if (delta) {
                // 1. Process reasoning/thinking content (API reasoning)
                if (delta.reasoning_content) {
                  if (thinkingBlockIndex === -1) {
                    thinkingBlockIndex = output.content.length;
                    output.content.push({ type: "thinking", thinking: "" });
                    stream.push({ type: "thinking_start", contentIndex: thinkingBlockIndex, partial: output });
                  }
                  const block = output.content[thinkingBlockIndex] as ThinkingContent;
                  block.thinking += delta.reasoning_content;
                  stream.push({
                    type: "thinking_delta",
                    contentIndex: thinkingBlockIndex,
                    delta: delta.reasoning_content,
                    partial: output,
                  });
                }

                // 2. Process text content
                if (delta.content) {
                  // End API thinking block if active
                  if (thinkingBlockIndex !== -1) {
                    const block = output.content[thinkingBlockIndex] as ThinkingContent;
                    stream.push({
                      type: "thinking_end",
                      contentIndex: thinkingBlockIndex,
                      content: block.thinking,
                      partial: output,
                    });
                    thinkingBlockIndex = -1;
                  }

                  if (thinkingParser) {
                    thinkingParser.processChunk(delta.content);
                  } else {
                    if (contentBlockIndex === -1) {
                      contentBlockIndex = output.content.length;
                      output.content.push({ type: "text", text: "" });
                      stream.push({ type: "text_start", contentIndex: contentBlockIndex, partial: output });
                    }
                    const block = output.content[contentBlockIndex] as TextContent;
                    block.text += delta.content;
                    stream.push({
                      type: "text_delta",
                      contentIndex: contentBlockIndex,
                      delta: delta.content,
                      partial: output,
                    });
                  }
                }

                // 3. Process tool calls
                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCallsState[idx]) {
                      toolCallsState[idx] = { arguments: "", id: "", name: "", contentIndex: 0 };
                    }
                    const state = toolCallsState[idx];
                    if (tc.id) state.id = tc.id;
                    if (tc.function?.name) state.name = tc.function.name;
                    if (tc.function?.arguments) {
                      const argDelta = tc.function.arguments;
                      state.arguments += argDelta;

                      if (state.emittedStart === undefined) {
                        state.emittedStart = true;
                        state.contentIndex = output.content.length;
                        const block: ToolCall = { type: "toolCall", id: state.id, name: state.name, arguments: {} };
                        output.content.push(block);
                        stream.push({ type: "toolcall_start", contentIndex: state.contentIndex, partial: output });
                      }
                      stream.push({
                        type: "toolcall_delta",
                        contentIndex: state.contentIndex,
                        delta: argDelta,
                        partial: output,
                      });
                    }
                  }
                }
              }

              const finishReason = mapFinishReason(choice.finish_reason);
              if (finishReason && output.stopReason !== "length") {
                // Truncation must survive later stop/tool markers: Pi refuses
                // to execute tools from length-limited assistant messages.
                output.stopReason = finishReason;
              }
            }
          }
        }
      }

      options?.signal?.throwIfAborted();
      if (thinkingParser) {
        thinkingParser.finalize();
      }

      if (thinkingBlockIndex !== -1) {
        const block = output.content[thinkingBlockIndex] as ThinkingContent;
        stream.push({
          type: "thinking_end",
          contentIndex: thinkingBlockIndex,
          content: block.thinking,
          partial: output,
        });
      }

      for (const state of toolCallsState) {
        if (state?.emittedStart && !state.emittedEnd) {
          state.emittedEnd = true;
          let args = {};
          try {
            args = JSON.parse(state.arguments || "{}");
          } catch {}
          const block = output.content[state.contentIndex] as ToolCall;
          block.arguments = args;
          stream.push({
            type: "toolcall_end",
            contentIndex: state.contentIndex,
            toolCall: {
              type: "toolCall",
              id: state.id,
              name: state.name,
              arguments: args,
            },
            partial: output,
          });
        }
      }

      const reason = output.stopReason === "length"
        ? "length"
        : output.stopReason === "toolUse" || output.content.some((block) => block.type === "toolCall")
          ? "toolUse"
          : "stop";
      output.stopReason = reason;
      stream.push({ type: "done", reason, message: output });
      stream.end();
    } catch (e: unknown) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = redactError(e instanceof Error ? e.message : String(e), secrets);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      try {
        stream.end();
      } catch {}
    } finally {
      if (reader) {
        // DONE and business errors can arrive before the server closes the connection.
        try {
          await reader.cancel();
        } catch {
          // Cleanup must not replace the original error (including cancellation).
        }
        reader.releaseLock();
      }
    }
  })();

  return stream;
}
