"use client";

import type { User } from "firebase/auth";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };

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

    const nextMessages = [...messages, { role: "user" as const, content: question }].slice(-12);
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/enumerator/assistant", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const result = await response.json() as { answer?: string; messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Asisten AI gagal menjawab.");
      const answer = result.answer;
      if (!answer) throw new Error("Asisten tidak mengirim jawaban. Silakan coba lagi.");
      setMessages(Array.isArray(result.messages) ? result.messages : [...nextMessages, { role: "assistant" as const, content: answer }].slice(-12));
      setHasHistory(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Pesan gagal dikirim. Silakan coba lagi.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function endChat() {
    if (loading || historyLoading || !hasHistory) return;
    if (!window.confirm("Akhiri chat dan hapus seluruh riwayat percakapan yang tersimpan? Tindakan ini tidak dapat dibatalkan.")) return;

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
        {hasHistory && <button type="button" className="enumerator-assistant-end" onClick={() => void endChat()} disabled={loading || historyLoading}>Akhiri chat</button>}
        <button type="button" className="enumerator-assistant-close" onClick={() => setOpen(false)} aria-label="Tutup Asisten AI">×</button>
      </header>
      <div className="enumerator-assistant-transcript" ref={transcriptRef} aria-live="polite" aria-relevant="additions text">
        {messages.map((message, index) => <article key={`${index}-${message.role}`} className={`enumerator-assistant-message is-${message.role}`}>
          <span>{message.role === "assistant" ? "Asisten" : "Anda"}</span><p>{message.content}</p>
        </article>)}
        {historyLoading && <article className="enumerator-assistant-message is-assistant" role="status"><span>Asisten</span><p className="enumerator-assistant-typing">Memuat riwayat percakapan...</p></article>}
        {loading && <article className="enumerator-assistant-message is-assistant" role="status"><span>Asisten</span><p className="enumerator-assistant-typing">Sedang menyiapkan jawaban...</p></article>}
      </div>
      {messages.length === 1 && <div className="enumerator-assistant-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={loading || historyLoading || !historyLoaded} onClick={() => void sendMessage(suggestion)}>{suggestion}</button>)}</div>}
      {error && <div className="enumerator-assistant-error" role="alert"><span>{error}</span>{!historyLoaded && <button type="button" onClick={() => void reloadHistory()} disabled={historyLoading}>Coba muat ulang</button>}</div>}
      <form className="enumerator-assistant-form" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="enumerator-assistant-input">Tulis pertanyaan</label>
        <textarea id="enumerator-assistant-input" ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={1500} rows={2} placeholder="Tulis pertanyaan teknis..." disabled={loading || historyLoading || !historyLoaded} />
        <button type="submit" className="button button-primary" disabled={loading || historyLoading || !historyLoaded || !input.trim()} aria-label="Kirim pertanyaan">{loading ? "..." : "Kirim"}</button>
      </form>
      <p className="enumerator-assistant-disclaimer">Riwayat chat tersimpan di akun Anda. Jangan kirim kata sandi atau data pribadi sensitif.</p>
    </section>}
  </>;
}
