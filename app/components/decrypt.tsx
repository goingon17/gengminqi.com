"use client";

import { useEffect, useRef } from "react";

const HEX = "0123456789abcdef";
const CJK = "密钥素数签名哈希椭圆曲线群环域模幂零知识证明随机谕言电路噪声同态门限承诺";
const isCjk = (c: string) => /[㐀-鿿]/.test(c);
const pick = (s: string) => s[(Math.random() * s.length) | 0];
const noise = (c: string) => (/\s|[，。、“”：；！？,.;:!?—·()（）]/.test(c) ? c : isCjk(c) ? pick(CJK) : pick(HEX));

// Text that "decrypts" from random glyphs into plaintext when scrolled into view.
export function Decrypt({ text, as: Tag = "span", className, speed = 1 }: { text: string; as?: "span" | "p" | "h2" | "h3"; className?: string; speed?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const chars = [...text];
    el.textContent = chars.map(noise).join("");
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const span = Math.min(1500, 300 + chars.length * 22) / speed;
      const at = chars.map((_, i) => (i / chars.length) * span * 0.75 + Math.random() * span * 0.25);
      let tick = 0;
      const frame = (now: number) => {
        const t = now - start;
        tick++;
        if (tick % 2 === 0) {
          el.textContent = chars.map((c, i) => (t >= at[i] ? c : noise(c))).join("");
        }
        if (t < span) raf = requestAnimationFrame(frame);
        else el.textContent = text;
      };
      raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = text;
    };
  }, [text, speed]);

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
    </Tag>
  );
}
