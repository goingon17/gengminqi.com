"use client";

import { useEffect, useState } from "react";

export function Clock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timeZone]);
  return <span className="clock" suppressHydrationWarning>{now ?? "--:--:--"}</span>;
}

// Adds `.in` to every [data-reveal] element once it scrolls into view.
export function Reveals() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    console.log(
      "%c e = 65537 %c 你找到了控制台。既然来了，加个微信吧：o65537",
      "background:#f1efe8;color:#08080a;font:italic 16px serif;padding:4px 8px",
      "color:#8b8980;font:12px monospace;padding:4px",
    );
    return () => io.disconnect();
  }, []);
  return null;
}
