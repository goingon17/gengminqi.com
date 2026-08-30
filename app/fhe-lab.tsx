"use client";

import { useMemo, useState } from "react";

type Stage = "plain" | "encrypted" | "computed" | "revealed";
const stages: Stage[] = ["plain", "encrypted", "computed", "revealed"];

export function FheLab() {
  const [value, setValue] = useState(7);
  const [stage, setStage] = useState<Stage>("plain");
  const result = value * 2 + 3;
  const cipher = useMemo(() => {
    const seed = (value * 2654435761).toString(16).padStart(8, "0");
    return `0x${seed}…${(value * 97 + 41).toString(16).padStart(4, "0")}`;
  }, [value]);
  const stageIndex = stages.indexOf(stage);

  const next = () => setStage((current) => stages[(stages.indexOf(current) + 1) % stages.length]);
  const labels: Record<Stage, string> = { plain: "01 · 加密输入", encrypted: "02 · 在密文上计算", computed: "03 · 解密结果", revealed: "重新开始" };

  return (
    <div className="lab-shell">
      <div className="lab-progress" aria-label="实验进度">{stages.map((item, index) => <span key={item} className={index <= stageIndex ? "on" : ""} />)}</div>
      <div className="lab-workbench">
        <div className="lab-controls">
          <span className="mini-label">私密输入 / Your secret</span>
          <div className="number-display">{value}</div>
          <input aria-label="选择私密数字" type="range" min="1" max="20" value={value} disabled={stage !== "plain"} onChange={(event) => setValue(Number(event.target.value))} />
          <div className="range-labels"><span>1</span><span>20</span></div>
          <div className="function-chip">ƒ(x) = 2x + 3</div>
          <p>服务器会执行这个函数，但不应该知道 x 是多少。</p>
        </div>
        <div className={`cipher-machine stage-${stage}`}>
          <div className="machine-topline"><span>UNTRUSTED COMPUTE</span><span>● LIVE</span></div>
          <div className="machine-display">
            {stage === "plain" && <><small>等待加密</small><strong>{value}</strong></>}
            {stage === "encrypted" && <><small>服务器只看见</small><strong className="cipher-text">{cipher}</strong></>}
            {stage === "computed" && <><small>密文结果</small><strong className="cipher-text">Eval({cipher.slice(0, 10)}…)</strong></>}
            {stage === "revealed" && <><small>持钥者解密得到</small><strong>{result}</strong></>}
          </div>
          <div className="machine-log"><span className={stageIndex >= 1 ? "done" : ""}>encrypt(x)</span><span className={stageIndex >= 2 ? "done" : ""}>evaluate(2x+3)</span><span className={stageIndex >= 3 ? "done" : ""}>decrypt(result)</span></div>
        </div>
      </div>
      <button className="lab-button" type="button" onClick={next}>{labels[stage]} <span aria-hidden="true">→</span></button>
      <p className="lab-note"><span>注意</span> 这里使用确定性占位字符串表现密文，仅用于解释协议流程。</p>
    </div>
  );
}
