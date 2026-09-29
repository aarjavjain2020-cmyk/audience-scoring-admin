"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ResultChart, type Result } from "@/components/result-chart";

type Song = { id: number; number: number; performer: string };
type State = { open: Song | null; live: { total: number; votes: number }; nextNumber: number; results: Result[] };
const words = {
  en: { admin: "Admin", title: "Audience scoring", password: "Password", signIn: "Sign in", signOut: "Sign out", next: "Next song", performer: "Performer name", start: "Open voting", current: "Now voting", votes: "votes", points: "points", close: "Close voting", confirm: "Close voting for this song?", confirmDetail: "Audience scores for this performer will be final and shown in the public results.", cancel: "Cancel", yesClose: "Yes, close voting", results: "Results", noSong: "Enter the first performer to open voting.", loading: "Loading…" },
  hi: { admin: "संचालक", title: "दर्शक अंक", password: "पासवर्ड", signIn: "साइन इन", signOut: "साइन आउट", next: "अगला गीत", performer: "कलाकार का नाम", start: "मतदान शुरू करें", current: "अभी मतदान", votes: "मत", points: "अंक", close: "मतदान बंद करें", confirm: "इस गीत का मतदान बंद करें?", confirmDetail: "इस कलाकार के अंक अंतिम हो जाएँगे और सार्वजनिक नतीजों में दिखेंगे।", cancel: "रद्द करें", yesClose: "हाँ, मतदान बंद करें", results: "नतीजे", noSong: "मतदान शुरू करने के लिए पहले कलाकार का नाम डालें।", loading: "लोड हो रहा है…" },
};

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin", cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function Home() {
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [password, setPassword] = useState("");
  const [performer, setPerformer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = words[language];

  const refresh = useCallback(async () => {
    try { setState(await api<State>("admin/state")); setAuthenticated(true); }
    catch { setAuthenticated(false); }
  }, []);

  useEffect(() => { api<{ authenticated: boolean }>("admin/session").then((result) => { setAuthenticated(result.authenticated); if (result.authenticated) refresh(); }).catch(() => setAuthenticated(false)); }, [refresh]);
  useEffect(() => { if (!authenticated) return; const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, [authenticated, refresh]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api<{ ok: boolean }>("admin/login", { password }); setPassword(""); await refresh(); }
    catch (issue) { setError(String((issue as Error).message)); }
    finally { setBusy(false); }
  }

  async function start(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { setState(await api<State>("admin/start", { performer })); setPerformer(""); }
    catch (issue) { setError(String((issue as Error).message)); }
    finally { setBusy(false); }
  }

  async function close() {
    if (!state?.open) return;
    setBusy(true); setError("");
    try { setState(await api<State>("admin/close", { songId: state.open.id })); }
    catch (issue) { setError(String((issue as Error).message)); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="topline"><span className="brand">{t.title}</span><div className="top-actions"><button className="text-button" onClick={() => setLanguage(language === "en" ? "hi" : "en")}>{language === "en" ? "हिन्दी" : "English"}</button>{authenticated && <button className="text-button" onClick={async () => { await api<{ ok: boolean }>("admin/logout", {}); setAuthenticated(false); setState(null); }}>{t.signOut}</button>}</div></header>
    {authenticated === null ? <p className="loading">{t.loading}</p> : !authenticated ?
      <section className="login-panel"><p className="eyebrow">{t.admin}</p><h1>{t.signIn}</h1><form onSubmit={signIn}><label htmlFor="password">{t.password}</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="primary" disabled={busy}>{t.signIn}</button></form>{error && <p className="error" role="alert">{error}</p>}</section> :
      <div className="content"><section className="control-panel"><div className="section-heading"><p className="eyebrow">{state?.open ? t.current : t.next}</p><h1>{state?.open ? `${language === "hi" ? "गीत" : "Song"} ${state.open.number}` : `${language === "hi" ? "गीत" : "Song"} ${state?.nextNumber ?? 1}`}</h1></div>
        {state?.open ? <><p className="performer-name">{state.open.performer}</p><div className="live-count"><div><strong>{state.live.votes}</strong><span>{t.votes}</span></div><div><strong>{state.live.total}</strong><span>{t.points}</span></div></div><AlertDialog><AlertDialogTrigger asChild><button className="primary close-button" disabled={busy}>{t.close}</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t.confirm}</AlertDialogTitle><AlertDialogDescription>{t.confirmDetail}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel><AlertDialogAction onClick={close}>{t.yesClose}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></> : <><p className="hint">{t.noSong}</p><form onSubmit={start} className="start-form"><label htmlFor="performer">{t.performer}</label><input id="performer" value={performer} onChange={(event) => setPerformer(event.target.value)} maxLength={80} required /><button className="primary" disabled={busy}>{t.start}</button></form></>}{error && <p className="error" role="alert">{error}</p>}</section>
        <section className="results-panel"><div className="results-heading"><h2>{t.results}</h2><span>{state?.results.length ?? 0} / 30</span></div><ResultChart results={state?.results ?? []} language={language} /></section>
      </div>}
  </main>;
}
