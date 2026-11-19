import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, MessageSquare, Send, Sparkles, Trash2 } from "lucide-react";
import { backend, data } from "../lib/api";
import type { ChatMessage, Claim, DocumentRecord } from "../lib/types";
import { useToast } from "../context/ToastContext";
import { Spinner } from "./Icons";

interface ReportChatProps {
  documentId: string;
  doc: DocumentRecord;
  claims: Claim[];
}

export default function ReportChat({ documentId, doc: _doc, claims }: ReportChatProps) {
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history on mount
  useEffect(() => {
    let alive = true;
    setLoadingHistory(true);
    data
      .listChatMessages(documentId)
      .then((history) => {
        if (alive) setMessages(history);
      })
      .catch((err) => {
        console.warn("Could not load chat messages:", err);
      })
      .finally(() => {
        if (alive) setLoadingHistory(false);
      });

    return () => {
      alive = false;
    };
  }, [documentId]);

  // Auto-scroll messages list to bottom
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest" });
    }
  };

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isOpen, sending]);

  // Suggested question chips based on this report's evaluated claims
  const suggestedQuestions = useMemo(() => {
    const list: string[] = [];

    // 1. First non-supported claim question
    const firstIssue = claims.find((c) => {
      const v = c.user_override_verdict || c.verdict;
      return v !== "supported";
    });
    if (firstIssue) {
      const idx = claims.indexOf(firstIssue) + 1;
      const vName = (firstIssue.user_override_verdict || firstIssue.verdict).replace("_", " ");
      list.push(`Why is Claim ${idx} ${vName}?`);
    }

    // 2. Suggested correction question
    const correctable = claims.find((c) => Boolean(c.suggested_fix));
    if (correctable) {
      const idx = claims.indexOf(correctable) + 1;
      list.push(`What is the preferred correction for Claim ${idx}?`);
    }

    // 3. Priority questions
    list.push("Which claims should I fix first?");
    list.push("What does the trust score mean?");

    return list.slice(0, 4);
  }, [claims]);

  // Scroll to claim card on the page
  const scrollToClaim = (claimId: string) => {
    const el = document.getElementById(`claim-${claimId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "transition-all");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary");
      }, 2000);
    }
  };

  // Parse text for "Claim N" links and basic bold formatting
  const renderMessageContent = (content: string) => {
    const lines = content.split("\n");

    return lines.map((line, lineIdx) => {
      // Tokenize by "Claim N" and "**bold**"
      const parts = line.split(/(Claim\s+\d+|\*\*[^*]+\*\*)/gi);

      return (
        <span key={lineIdx} className="block min-h-[1.25em]">
          {parts.map((part, pIdx): ReactNode => {
            const claimMatch = part.match(/^Claim\s+(\d+)$/i);
            if (claimMatch) {
              const num = parseInt(claimMatch[1], 10);
              const targetClaim = claims[num - 1];
              if (targetClaim) {
                return (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => scrollToClaim(targetClaim.id)}
                    className="inline-flex items-center font-semibold text-primary underline underline-offset-2 hover:opacity-80 transition-opacity mx-0.5"
                    title={`Scroll to Claim ${num}`}
                  >
                    {part}
                  </button>
                );
              }
              return <span key={pIdx} className="font-semibold">{part}</span>;
            }

            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={pIdx} className="font-semibold text-primary">
                  {part.slice(2, -2)}
                </strong>
              );
            }

            return <span key={pIdx}>{part}</span>;
          })}
        </span>
      );
    });
  };

  const handleSend = async (customMessage?: string) => {
    const text = (customMessage ?? input).trim();
    if (!text || sending) return;

    if (!customMessage) setInput("");

    const userMsg: ChatMessage = {
      id: "usr-" + Date.now(),
      document_id: documentId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await backend.reportChat(documentId, text);
      const assistantMsg: ChatMessage = {
        id: "ast-" + Date.now(),
        document_id: documentId,
        role: "assistant",
        content: res.reply,
        created_at: res.created_at,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const error = err as Error;
      let msg = error.message || "Failed to get reply";
      if (msg.includes("401") || msg.toLowerCase().includes("session expired")) {
        msg = "Your session expired. Please log in again to chat.";
      } else if (msg.includes("429") || msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("hour")) {
        msg = "You have reached the limit of 30 questions per hour. Please try again later.";
      }
      toast(msg, "error");
      // Remove failed user turn
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleClearChat = async () => {
    try {
      await data.clearChat(documentId);
      setMessages([]);
      toast("Chat history cleared.", "success");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div className="no-print mt-6 mb-2">
      <div className="card shadow-soft overflow-hidden transition-all border border-hairline">
        {/* Header toggle */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen((o) => !o);
            }
          }}
          className="w-full px-6 py-4.5 flex items-center justify-between text-left hover:bg-neutral-50/50 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0 shadow-xs">
              <MessageSquare size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-primary">Ask about this report</h3>
                <span className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-hairline">
                  <Sparkles size={10} className="text-amber-500" /> AI Assistant
                </span>
              </div>
              <p className="text-[12px] text-neutral-500 mt-0.5">
                Ground-truth Q&A about claim verdicts, source conflicts, and suggested corrections.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-neutral-400">
            {messages.length > 0 && (
              <span className="text-[11px] font-mono text-neutral-400 mr-1">
                {messages.length} {messages.length === 1 ? "message" : "messages"}
              </span>
            )}
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {/* Collapsible chat body */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="border-t border-hairline bg-neutral-50/30"
            >
              {/* Messages container */}
              <div className="px-6 py-4 max-h-[380px] overflow-y-auto space-y-3.5">
                {loadingHistory ? (
                  <div className="py-8 text-center text-neutral-400 flex items-center justify-center gap-2 text-[13px]">
                    <Spinner size={14} /> Loading conversation history…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[13px] text-neutral-500">
                      No messages yet. Ask anything about this report or select a suggested question below:
                    </p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isUser = m.role === "user";
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                            isUser
                              ? "bg-primary text-white rounded-br-xs shadow-xs"
                              : "bg-white text-primary border border-hairline rounded-bl-xs shadow-soft"
                          }`}
                        >
                          {isUser ? m.content : renderMessageContent(m.content)}
                        </div>
                      </motion.div>
                    );
                  })
                )}

                {sending && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white text-neutral-500 border border-hairline rounded-2xl rounded-bl-xs px-4 py-3 shadow-soft flex items-center gap-2 text-[12px]">
                      <Spinner size={13} /> Analyzing verification data…
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Suggested question chips */}
              <div className="px-6 pb-3 pt-1 flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mr-1">
                  Suggestions:
                </span>
                {suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={sending}
                    onClick={() => handleSend(q)}
                    className="text-[11px] font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-hairline rounded-full px-3 py-1 transition-colors disabled:opacity-50 text-left shadow-2xs"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Input area */}
              <div className="px-6 py-3.5 border-t border-hairline bg-white flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Ask a question about this report… (Enter to send, Shift+Enter for new line)"
                    disabled={sending}
                    className="input resize-none py-2 text-[13px] min-h-[42px] max-h-[120px] leading-normal"
                  />
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={sending || !input.trim()}
                    className="btn-primary h-10 w-10 p-0 shrink-0 inline-flex items-center justify-center rounded-xl disabled:opacity-40"
                    title="Send message"
                  >
                    <Send size={15} />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
                  <span>Questions are answered using only this document's verified evidence.</span>
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearChat}
                      className="inline-flex items-center gap-1 text-neutral-400 hover:text-red-600 transition-colors underline underline-offset-2"
                    >
                      <Trash2 size={11} /> Clear chat
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
