"use client";

import { useEffect, useMemo, useState } from "react";

type ChoiceId = "mpc" | "zkp" | "e2ee";
type Counts = Record<ChoiceId, number>;

const choices: Array<{ id: ChoiceId; index: string; title: string; eyebrow: string; description: string }> = [
  { id: "mpc", index: "01", eyebrow: "共同计算", title: "MPC", description: "几个人怎样一起算出答案，却不交出各自的秘密？" },
  { id: "zkp", index: "02", eyebrow: "只证明，不透露", title: "零知识证明", description: "怎样证明自己知道答案，却不让任何人看见答案？" },
  { id: "e2ee", index: "03", eyebrow: "只让对话者看见", title: "端到端加密", description: "一条消息经过服务器时，谁有能力真正读懂它？" },
];

const emptyCounts: Counts = { mpc: 0, zkp: 0, e2ee: 0 };
const localKey = "gengminqi:next-topic-vote";

function isChoice(value: unknown): value is ChoiceId {
  return value === "mpc" || value === "zkp" || value === "e2ee";
}

export function TopicVote() {
  const [counts, setCounts] = useState<Counts>(emptyCounts);
  const [selected, setSelected] = useState<ChoiceId | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState<ChoiceId | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const localVote = window.localStorage.getItem(localKey);
      if (isChoice(localVote)) setSelected(localVote);

      try {
        const response = await fetch("/api/votes", { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        if (data.counts) setCounts({ ...emptyCounts, ...data.counts });
        if (isChoice(data.selected)) setSelected(data.selected);
        setAvailable(Boolean(data.available));
      } catch {
        if (active) setAvailable(false);
      }
    };

    void load();
    return () => { active = false; };
  }, []);

  const total = useMemo(() => Object.values(counts).reduce((sum, count) => sum + count, 0), [counts]);

  const vote = async (choice: ChoiceId) => {
    if (submitting || choice === selected) return;
    const previous = selected;
    setSelected(choice);
    setSubmitting(choice);
    window.localStorage.setItem(localKey, choice);

    setCounts((current) => ({
      ...current,
      ...(previous ? { [previous]: Math.max(0, current[previous] - 1) } : {}),
      [choice]: current[choice] + 1,
    }));

    try {
      const response = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error("vote unavailable");
      setCounts({ ...emptyCounts, ...data.counts });
      setAvailable(true);
    } catch {
      setAvailable(false);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="topic-vote">
      <div className="vote-question">
        <div>
          <span className="mini-label">下一篇 / You decide</span>
          <h3>你想先看见<br />哪一个秘密？</h3>
        </div>
        <p>选择一个方向。无需登录，不收集姓名或联系方式；选择之后仍可更改。</p>
      </div>

      <div className="vote-options" role="group" aria-label="选择下一篇密码学主题">
        {choices.map((choice) => {
          const isSelected = selected === choice.id;
          const percentage = total > 0 ? Math.round((counts[choice.id] / total) * 100) : 0;
          return (
            <button
              className={`vote-option${isSelected ? " selected" : ""}`}
              type="button"
              key={choice.id}
              aria-pressed={isSelected}
              disabled={Boolean(submitting)}
              onClick={() => void vote(choice.id)}
            >
              <span className="vote-index">{choice.index}</span>
              <span className="vote-copy"><small>{choice.eyebrow}</small><strong>{choice.title}</strong><span>{choice.description}</span></span>
              <span className="vote-result"><b>{percentage}%</b><i>{isSelected ? "已选择" : "选择"}</i></span>
              <span className="vote-bar" aria-hidden="true"><i style={{ width: `${percentage}%` }} /></span>
            </button>
          );
        })}
      </div>

      <div className="vote-status" aria-live="polite">
        <span>{submitting ? "正在放入票箱…" : selected ? "你的选择已经记下。" : "投下你的一票。"}</span>
        <span>{available === true ? `${total} 人参与` : available === false ? "选择已保存在本机" : "正在连接票箱…"}</span>
      </div>
    </div>
  );
}
