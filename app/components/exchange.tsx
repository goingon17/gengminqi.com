"use client";

import { useEffect, useState } from "react";
import { profile } from "../content";
import { copyText } from "./copy";

async function sha256(text: string) {
  if (!crypto?.subtle) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Status = "idle" | "sending" | "sealed" | "error";

export function Exchange() {
  const [form, setForm] = useState({ name: "", contact: "", message: "", website: "" });
  const [hash, setHash] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const plain = `${form.name}\n${form.contact}\n${form.message}`;
  useEffect(() => {
    let live = true;
    sha256(plain).then((h) => live && setHash(h));
    return () => {
      live = false;
    };
  }, [plain]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (status === "error") setStatus("idle");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, fingerprint: hash }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "发送失败，稍后再试。");
      setStatus("sealed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败，稍后再试。");
      setStatus("error");
    }
  };

  const copy = async () => {
    if (await copyText(profile.wechat)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const empty = !form.name && !form.contact && !form.message;
  const ready = form.name.trim() && form.contact.trim();

  return (
    <div className="exchange">
      <div className="ex-direct" data-reveal>
        <p className="ex-lede">最快的方式，永远是直接加微信。</p>
        <button type="button" className="wechat-big" onClick={copy}>
          <span className="k">WeChat</span>
          <span className="wechat-id">{profile.wechat}</span>
          <span className="wechat-cta">{copied ? "已复制到剪贴板 ✓" : "点击复制 →"}</span>
        </button>
        <div className="ex-links">
          <a href="/contact.vcf" download={`${profile.name}.vcf`}>
            存入通讯录 <span>.vcf</span>
          </a>
          {profile.email && (
            <a href={`mailto:${profile.email}`}>
              邮件 <span>{profile.email}</span>
            </a>
          )}
        </div>
      </div>

      <form className={`ex-form ${status}`} onSubmit={submit} data-reveal>
        <div className="ex-head">
          <span>交换名片 · Exchange</span>
          <span>{status === "sealed" ? "SEALED" : "DRAFT"}</span>
        </div>
        {status === "sealed" ? (
          <div className="sealed">
            <div className="stamp" aria-hidden="true">
              <span>已封存</span>
              <small>SEALED · e=65537</small>
            </div>
            <p>收到你的名片了，我会尽快联系你。</p>
            <code>{hash.slice(0, 32)}</code>
          </div>
        ) : (
          <>
            <label>
              <span>你的名字</span>
              <input value={form.name} onChange={set("name")} maxLength={60} autoComplete="name" placeholder="怎么称呼你" required />
            </label>
            <label>
              <span>怎么找到你</span>
              <input value={form.contact} onChange={set("contact")} maxLength={120} placeholder="微信 / 邮箱 / 手机" required />
            </label>
            <label>
              <span>想说的话</span>
              <textarea value={form.message} onChange={set("message")} maxLength={1000} rows={3} placeholder="可选。一句话也好。" />
            </label>
            <label className="hp" aria-hidden="true">
              <span>Website</span>
              <input value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" />
            </label>
            <div className="fingerprint" aria-live="off">
              <span className="k">SHA-256 指纹</span>
              <code className={empty ? "dim" : ""}>{hash ? hash.match(/.{1,8}/g)!.join(" ") : "—"}</code>
            </div>
            <div className="ex-submit">
              <button type="submit" disabled={!ready || status === "sending"}>
                {status === "sending" ? "封存中…" : "封存并发送"}
                <span aria-hidden="true">↗</span>
              </button>
              {status === "error" && <p className="ex-error" role="alert">{error}</p>}
            </div>
          </>
        )}
      </form>
    </div>
  );
}
