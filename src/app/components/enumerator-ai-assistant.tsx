"use client";

import type { User } from "firebase/auth";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

type Message = { role: "user" | "assistant"; content: string };

function renderInlineFormatting(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderAssistantContent(content: string): ReactNode {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);

    if (orderedMatch) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(\d+)\.\s+(.+)$/);
        if (!match) break;
        items.push(<li key={index}>{renderInlineFormatting(match[2])}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ordered-${index}`}>{items}</ol>);
      continue;
    }

    if (bulletMatch) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*[-*]\s+(.+)$/);
        if (!match) break;
        items.push(<li key={index}>{renderInlineFormatting(match[1])}</li>);
        index += 1;
      }
      blocks.push(<ul key={`bullet-${index}`}>{items}</ul>);
      continue;
    }

    index += 1;
    const paragraph = line.replace(/^\s{0,3}#{1,6}\s+/, "").trim();
    if (!paragraph || /^([-*_]\s*){3,}$/.test(paragraph)) continue;
    blocks.push(<p key={`paragraph-${index}`}>{renderInlineFormatting(paragraph)}</p>);
  }

  return <div className="enumerator-assistant-formatted-content">{blocks}</div>;
}

const suggestions = [
  "Bagaimana cara mengisi koordinat GPS?",
  "Bagaimana cara merevisi data?",
  "Apa saja foto yang perlu diunggah?",
];

const welcomeMessage: Message = { role: "assistant", content: "Halo! Saya bisa membantu menjelaskan cara memakai dashboard dan mengisi form Enumerator. Apa yang ingin Anda tanyakan?" };

export function EnumeratorAiAssistant({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/enumerator/assistant", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json() as { messages?: Message[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Riwayat percakapan gagal dimuat.");
        if (!active) return;
        const savedMessages = Array.isArray(result.messages) ? result.messages : [];
        setMessages(savedMessages.length ? savedMessages : [welcomeMessage]);
        setHasHistory(savedMessages.length > 1);
        setHistoryLoaded(true);
        setError("");
      } catch (historyError) {
        if (active) setError(historyError instanceof Error ? historyError.message : "Riwayat percakapan gagal dimuat.");
      } finally {
        if (active) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => { active = false; };
  }, [user]);

  async function reloadHistory() {
    setHistoryLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/enumerator/assistant", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Riwayat percakapan gagal dimuat.");
      const savedMessages = Array.isArray(result.messages) ? result.messages : [];
      setMessages(savedMessages.length ? savedMessages : [welcomeMessage]);
      setHasHistory(savedMessages.length > 1);
      setHistoryLoaded(true);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Riwayat percakapan gagal dimuat.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function sendMessage(content: string) {
    const question = content.trim();
    if (!question || loading || historyLoading || !historyLoaded) return;

    const nextMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/enumerator/assistant", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const result = await response.json() as { answer?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Asisten AI gagal menjawab.");
      const answer = result.answer;
      if (!answer) throw new Error("Asisten tidak mengirim jawaban. Silakan coba lagi.");
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
      setHasHistory(true);
    } catch (sendError) {
      setMessages((current) => current.length > 1 ? current.slice(0, -1) : current);
      setInput(question);
      setError(sendError instanceof Error ? sendError.message : "Pesan gagal dikirim. Silakan coba lagi.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function endChat() {
    if (loading || historyLoading || !hasHistory) return;

    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/enumerator/assistant", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Riwayat percakapan gagal dihapus.");
      setMessages([welcomeMessage]);
      setHasHistory(false);
      setConfirmingEnd(false);
      setInput("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Riwayat percakapan gagal dihapus.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return <>
    <button type="button" className="enumerator-assistant-launcher" aria-label={open ? "Tutup Asisten AI" : "Buka Asisten AI"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">{open ? "×" : "✦"}</span><span className="enumerator-assistant-launcher-label">Asisten AI</span>
    </button>
    {open && <section className="enumerator-assistant-panel" role="dialog" aria-modal="false" aria-labelledby="enumerator-assistant-title">
      <header className="enumerator-assistant-header">
        <span className="enumerator-assistant-avatar" aria-hidden="true">✦</span>
        <div><h2 id="enumerator-assistant-title">Asisten Enumerator</h2><p>Panduan teknis dan pengisian form</p></div>
        {hasHistory && <button type="button" className="enumerator-assistant-end" onClick={() => setConfirmingEnd(true)} disabled={loading || historyLoading}>Hapus riwayat</button>}
        <button type="button" className="enumerator-assistant-close" onClick={() => setOpen(false)} aria-label="Tutup Asisten AI">×</button>
      </header>
      {confirmingEnd && <div className="enumerator-assistant-confirm" role="group" aria-labelledby="enumerator-assistant-confirm-title">
        <div><strong id="enumerator-assistant-confirm-title">Hapus seluruh riwayat chat?</strong><p>Riwayat yang dihapus tidak dapat dipulihkan.</p></div>
        <div className="enumerator-assistant-confirm-actions">
          <button type="button" onClick={() => setConfirmingEnd(false)} disabled={loading}>Batal</button>
          <button type="button" className="is-destructive" onClick={() => void endChat()} disabled={loading}>{loading ? "Menghapus..." : "Hapus"}</button>
        </div>
      </div>}
      <div className="enumerator-assistant-transcript" ref={transcriptRef} aria-live="polite" aria-relevant="additions text">
        {messages.map((message, index) => <article key={`${index}-${message.role}`} className={`enumerator-assistant-message is-${message.role}`}>
          <span>{message.role === "assistant" ? "Asisten" : "Anda"}</span>{message.role === "assistant" ? renderAssistantContent(message.content) : <p>{message.content}</p>}
        </article>)}
        {historyLoading && <article className="enumerator-assistant-message is-assistant" role="status"><span>Asisten</span><p className="enumerator-assistant-typing">Memuat riwayat percakapan...</p></article>}
        {loading && <article className="enumerator-assistant-message is-assistant" role="status"><span>Asisten</span><p className="enumerator-assistant-typing">Sedang menyiapkan jawaban...</p></article>}
      </div>
      {messages.length === 1 && <div className="enumerator-assistant-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={loading || historyLoading || !historyLoaded} onClick={() => void sendMessage(suggestion)}>{suggestion}</button>)}</div>}
      {error && <div className="enumerator-assistant-error" role="alert"><span>{error}</span>{!historyLoaded && <button type="button" onClick={() => void reloadHistory()} disabled={historyLoading}>Coba muat ulang</button>}</div>}
      <form className="enumerator-assistant-form" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="enumerator-assistant-input">Tulis pertanyaan</label>
        <textarea id="enumerator-assistant-input" ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} placeholder="Tulis pertanyaan teknis..." disabled={loading || historyLoading || !historyLoaded || confirmingEnd} />
        <button type="submit" className="button button-primary" disabled={loading || historyLoading || !historyLoaded || confirmingEnd || !input.trim()} aria-label="Kirim pertanyaan">{loading ? "..." : "Kirim"}</button>
      </form>
      <p className="enumerator-assistant-disclaimer">Riwayat chat tersimpan di akun Anda. Jangan kirim kata sandi atau data pribadi sensitif.</p>
    </section>}
  </>;
}
