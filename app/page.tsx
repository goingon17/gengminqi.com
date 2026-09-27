import QRCode from "qrcode";
import { about, profile, works } from "./content";
import { Decrypt } from "./components/decrypt";
import { Exchange } from "./components/exchange";
import { Field } from "./components/field";
import { KeyCard } from "./components/key-card";
import { Clock, Reveals } from "./components/live";
import { Works } from "./components/works";

const bits = (65537).toString(2).split("");

export default async function Home() {
  const qr = await QRCode.toString(profile.wechatQr, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "Q",
    color: { dark: "#0b0b0d", light: "#0000" },
  });
  const [first, ...rest] = profile.name.split(" ");

  return (
    <>
      <Field />
      <div className="grain" aria-hidden="true" />

      <div className="nav-fade" aria-hidden="true" />
      <header className="nav">
        <a href="#top" className="brand" aria-label="回到顶部">
          <span className="brand-dot" />
          {profile.initials}
        </a>
        <nav aria-label="主导航">
          <a href="#plaintext">明文</a>
          <a href="#works">此刻</a>
          <a href="#e">65537</a>
          <a href="#contact">联系</a>
        </nav>
        <span className="nav-time">
          UTC+8 · <Clock timeZone={profile.timezone} />
        </span>
      </header>

      <main>
        <section className="hero" id="top">
          <div className="hero-name" aria-hidden="true">
            <span>{first}</span>
            <span>
              <em>{rest.join(" ")}</em>
            </span>
          </div>
          <KeyCard qr={qr} />
          <div className="hero-foot">
            <p>
              一张可以翻面的名片，<br />
              也是一把公开的钥匙。
            </p>
            <a href="#plaintext" className="scroll-cue">
              <span>向下解密</span>
              <i aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className="section about" id="plaintext">
          <div className="label" data-reveal>
            <span>01</span> 明文 · Plaintext
          </div>
          <Decrypt as="p" className="statement" text={about.statement} />
          <dl className="facts">
            {about.facts.map((f, i) => (
              <div key={f.label} data-reveal style={{ "--i": i } as React.CSSProperties}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="section" id="works">
          <div className="label" data-reveal>
            <span>02</span> 此刻 · Now building
          </div>
          <h2 className="section-title" data-reveal>
            正在做的<em>事</em>
          </h2>
          <Works works={works} />
        </section>

        <section className="section prime" id="e">
          <div className="label" data-reveal>
            <span>03</span> 为什么是 65537
          </div>
          <div className="prime-num" aria-label="65537">
            <Decrypt text="65537" speed={0.6} />
          </div>
          <ol className="bits" aria-label="65537 的二进制：1 后面跟 15 个 0，再以 1 结尾" data-reveal>
            {bits.map((b, i) => (
              <li key={i} className={b === "1" ? "one" : ""} style={{ "--i": i } as React.CSSProperties}>
                {b}
              </li>
            ))}
          </ol>
          <div className="prime-grid">
            <div data-reveal style={{ "--i": 0 } as React.CSSProperties}>
              <span className="k">
                2<sup>16</sup> + 1
              </span>
              <p>二进制里只有首尾两个 1。做模幂运算时只需要 16 次平方和 1 次乘法——又快又安全。</p>
            </div>
            <div data-reveal style={{ "--i": 1 } as React.CSSProperties}>
              <span className="k">
                F<sub>4</sub>
              </span>
              <p>第五个费马数，也是人类目前已知最大的费马素数。</p>
            </div>
            <div data-reveal style={{ "--i": 2 } as React.CSSProperties}>
              <span className="k">e = 0x10001</span>
              <p>世界上绝大多数 RSA 公钥使用的指数。它被设计成可以公开的那一半。</p>
            </div>
          </div>
          <p className="prime-coda" data-reveal>
            它藏在我的微信号 <b>{profile.wechat}</b> 里。<br />
            所以这张名片，就是我的<em>公钥</em>——拿去，加密一些话给我。
          </p>
        </section>

        <section className="section contact" id="contact">
          <div className="label" data-reveal>
            <span>04</span> 加密给我 · Encrypt to me
          </div>
          <h2 className="section-title big" data-reveal>
            交换<em>名片</em>
          </h2>
          <Exchange />
        </section>
      </main>

      <footer className="footer">
        <div className="marquee" aria-hidden="true">
          <div>
            {Array.from({ length: 2 }, (_, k) => (
              <span key={k}>
                e = 65537 <i>✳</i> 公钥 <i>✳</i> Public Key <i>✳</i> {profile.wechat} <i>✳</i> {profile.name} <i>✳</i>{" "}
              </span>
            ))}
          </div>
        </div>
        <div className="foot-row">
          <span>© {new Date().getFullYear()} {profile.name}</span>
          <span>
            {profile.site} · 此刻 <Clock timeZone={profile.timezone} />
          </span>
          <a href="#top">回到顶部 ↑</a>
        </div>
      </footer>
      <Reveals />
    </>
  );
}
