"use client";

import { FormEvent, useEffect, useState } from "react";

type Helpful = "yes" | "no" | null;
type Stage = "view" | "helpful" | "contact" | "complete";

type FeedbackResponse = {
  views: number;
  helpful: { yes: number; no: number };
  reader: { viewed: boolean; helpful: Helpful; completed: boolean } | null;
  available: boolean;
};

const emptyResponse: FeedbackResponse = {
  views: 0,
  helpful: { yes: 0, no: 0 },
  reader: null,
  available: false,
};

function stageFor(reader: FeedbackResponse["reader"]): Stage {
  if (!reader?.viewed) return "view";
  if (!reader.helpful) return "helpful";
  if (!reader.completed) return "contact";
  return "complete";
}

export function ReaderFeedback() {
  const [data, setData] = useState<FeedbackResponse>(emptyResponse);
  const [stage, setStage] = useState<Stage>("view");
  const [choice, setChoice] = useState<Helpful>(null);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("正在读取…");

  useEffect(() => {
    let active = true;
    fetch("/api/feedback", { cache: "no-store" })
      .then((response) => response.json())
      .then((next: FeedbackResponse) => {
        if (!active) return;
        setData(next);
        setStage(stageFor(next.reader));
        setChoice(next.reader?.helpful ?? null);
        setMessage(next.available ? "匿名记录" : "计数服务暂未连接");
      })
      .catch(() => active && setMessage("计数服务暂未连接"));
    return () => { active = false; };
  }, []);

  const send = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const next = await response.json();
    if (!response.ok) throw new Error(next.error || "feedback unavailable");
    setData(next);
    return next as FeedbackResponse;
  };

  const markViewed = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await send({ action: "view" });
      setStage(stageFor(next.reader));
      setMessage("");
    } catch {
      setMessage("还差一步：请先连接数据库");
    } finally {
      setBusy(false);
    }
  };

  const answerHelpful = async (value: Exclude<Helpful, null>) => {
    if (busy) return;
    setChoice(value);
    setBusy(true);
    try {
      const next = await send({ action: "helpful", value: value === "yes" });
      setStage(stageFor(next.reader));
      setMessage("");
    } catch {
      setChoice(null);
      setMessage("投票未送达，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (event?: FormEvent, skip = false) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const next = await send({ action: "finish", contact: skip ? "" : contact });
      setStage(stageFor(next.reader));
      setMessage(contact.trim() && !skip ? "联系方式已安全收下" : "谢谢你读到这里");
    } catch {
      setMessage("暂时没有送达，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`reader-feedback stage-${stage}`} aria-live="polite">
      {stage === "view" && (
        <button className="feedback-view" type="button" onClick={() => void markViewed()} disabled={busy || !data.available}>
          <span>读者计数</span>
          <strong><b>{data.views.toLocaleString("zh-CN")}</b> 人看过（点击）</strong>
          <i>{busy ? "…" : "+1"}</i>
        </button>
      )}

      {stage === "helpful" && (
        <div className="feedback-step feedback-helpful">
          <span>问个问题</span>
          <strong>你觉得鸽子知道自己会飞吗？</strong>
          <div className={`feedback-slider${choice ? ` is-${choice}` : ""}`} role="group" aria-label="这篇内容是否有帮助">
            <span className="slider-thumb" aria-hidden="true" />
            <button type="button" aria-pressed={choice === "no"} disabled={busy} onClick={() => void answerHelpful("no")}>否</button>
            <button type="button" aria-pressed={choice === "yes"} disabled={busy} onClick={() => void answerHelpful("yes")}>是</button>
          </div>
        </div>
      )}

      {stage === "contact" && (
        <form className="feedback-step feedback-contact" onSubmit={(event) => void finish(event)}>
          <span>👉</span>
          <label>
            <strong>加个微信？</strong>
            <input value={contact} onChange={(event) => setContact(event.target.value)} maxLength={180} placeholder="邮箱 / 微信 / 其他方式" aria-label="联系方式，可选" />
            <small>我的微信号：o65537。</small>
          </label>
          <div className="contact-actions">
            <button type="button" onClick={() => void finish(undefined, true)} disabled={busy}>跳过</button>
            <button type="submit" disabled={busy || !contact.trim()}>{busy ? "…" : "留下 →"}</button>
          </div>
        </form>
      )}

      {stage === "complete" && (
        <div className="feedback-step feedback-complete">
          <span>已完成</span>
          <strong>谢谢，你是第 {data.views.toLocaleString("zh-CN")} 位读者。</strong>
          <i>✓</i>
        </div>
      )}

      {message && <small className="feedback-message">{message}</small>}
    </div>
  );
}
