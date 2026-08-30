import { FheLab } from "./fhe-lab";

const concepts = [
  { number: "01", title: "在密文上运算", text: "数据在整个计算过程中都保持加密。计算者拿到的是密文，返回的也是密文。", glyph: "Enc(x) ⊕ Enc(y)" },
  { number: "02", title: "结果仍然正确", text: "把密文计算的结果解密，会得到与明文计算相同的答案——但中间过程不暴露输入。", glyph: "Dec(ƒ̂(c)) = ƒ(x)" },
  { number: "03", title: "噪声可以刷新", text: "同态运算会积累噪声。Bootstrapping 像一次密文内的自我清洁，让计算继续进行。", glyph: "c noisy → c fresh" },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="gengminqi.com 首页"><span className="wordmark-dot" />gengminqi.com</a>
        <nav aria-label="主导航"><a href="#intuition">直觉</a><a href="#lab">实验</a><a href="#mechanism">原理</a><a href="#reading">延伸</a></nav>
        <a className="header-index" href="#reading">CS / 001</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-wash" aria-hidden="true" />
        <div className="eyebrow"><span>密码学手记 · Cryptography field notes</span><span>阅读约 8 分钟</span></div>
        <div className="hero-copy">
          <p className="hero-chapter">Fully Homomorphic Encryption</p>
          <h1>隐私，<br />仍可<span>计算</span>。</h1>
          <div className="hero-bottom">
            <p>全同态加密让机器在<span className="marker">看不见数据</span>的情况下完成计算。这不只是把保险箱锁好，而是让保险箱自己工作。</p>
            <a className="primary-link" href="#intuition">从一个直觉开始 <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className="cipher-orbit" aria-hidden="true">
          <div className="orbit orbit-a" /><div className="orbit orbit-b" />
          <div className="cipher-core"><span>?</span><small>ciphertext</small></div>
          <span className="orbit-label label-a">compute</span><span className="orbit-label label-b">never reveal</span><span className="orbit-label label-c">decrypt</span>
        </div>
      </section>

      <div className="signal-strip" aria-hidden="true"><span>ENCRYPT</span><i>→</i><span>COMPUTE</span><i>→</i><span>DECRYPT</span><i>→</i><span>ENCRYPT</span><i>→</i><span>COMPUTE</span><i>→</i><span>DECRYPT</span></div>

      <section className="editorial-section intuition" id="intuition">
        <div className="section-label"><span>01</span> 一个反常识的能力</div>
        <div className="statement-grid">
          <h2>传统加密保护的是“静止”的数据。</h2>
          <div className="statement-copy"><p>文件存进硬盘时可以加密，经过网络时也可以加密。但一旦服务器要搜索、统计或运行模型，通常必须先把它解开。那一刻，秘密变回了明文。</p><p className="pull-quote">FHE 改变的是计算时刻的信任边界。</p></div>
        </div>
        <div className="comparison" role="img" aria-label="传统计算与全同态加密计算流程对比">
          <div className="comparison-row muted-row"><span className="comparison-name">传统方式</span><span className="state-pill">加密</span><b>→</b><span className="state-pill danger">解密并暴露</span><b>→</b><span className="state-pill">计算</span></div>
          <div className="comparison-row active-row"><span className="comparison-name">FHE</span><span className="state-pill green">加密</span><b>→</b><span className="state-pill green wide">直接计算密文</span><b>→</b><span className="state-pill green">仅结果解密</span></div>
        </div>
      </section>

      <section className="lab-section" id="lab">
        <div className="section-heading inverse">
          <div className="section-label"><span>02</span> 动手试一次</div>
          <div><h2>把数字锁起来，<br />再让它参与运算。</h2><p>这是一个帮助理解流程的可视化模拟，并未在浏览器中执行真正的 FHE。</p></div>
        </div>
        <FheLab />
      </section>

      <section className="editorial-section" id="mechanism">
        <div className="section-label"><span>03</span> 机制，而非魔法</div>
        <div className="mechanism-intro"><h2>它为什么<br />真的能工作？</h2><p>粗略地说，FHE 把一个消息藏进带有可控噪声的数学结构中。密文保留了某些代数关系，因此加法与乘法能够在不知道明文的前提下被映射过去。</p></div>
        <div className="concept-grid">
          {concepts.map((concept) => <article className="concept-card" key={concept.number}><span className="card-number">{concept.number}</span><div className="math-glyph">{concept.glyph}</div><h3>{concept.title}</h3><p>{concept.text}</p></article>)}
        </div>
        <div className="equation-panel"><div><span className="mini-label">正确性 / Correctness</span><p className="equation">Dec<sub>sk</sub>(Eval<sub>pk</sub>(ƒ, Enc<sub>pk</sub>(x))) = ƒ(x)</p></div><p><strong>读法：</strong>先加密 x，再让不可信的计算者执行函数 ƒ，最后由持钥者解密；得到的结果，等同于直接对明文 x 运行 ƒ。</p></div>
      </section>

      <section className="reality-section">
        <div className="section-label"><span>04</span> 工程现实</div>
        <div className="reality-grid"><div className="reality-title"><p className="kicker">Powerful ≠ universal</p><h2>什么时候<br />值得用 FHE？</h2></div><div className="use-columns">
          <div><span className="use-icon yes">✓</span><h3>它尤其适合</h3><ul><li>云端处理高度敏感的数据</li><li>跨机构联合统计与风险分析</li><li>隐私机器学习推理</li><li>无法信任计算环境的场景</li></ul></div>
          <div><span className="use-icon no">×</span><h3>它不是默认答案</h3><ul><li>速度和延迟通常比明文计算更差</li><li>算法要改写成受支持的电路</li><li>参数选择影响安全与性能</li><li>简单的访问控制可能已经足够</li></ul></div>
        </div></div>
      </section>

      <section className="reading-section" id="reading">
        <div className="reading-lead"><span className="section-label"><span>05</span> 下一步</span><h2>密码学不是<br />一堵墙，<br />而是一套选择。</h2></div>
        <div className="reading-list">
          <a href="https://www.zama.org/introduction-to-homomorphic-encryption" target="_blank" rel="noreferrer"><span>外部阅读</span><strong>Zama · FHE Introduction</strong><i>↗</i></a>
          <a href="https://homomorphicencryption.org/" target="_blank" rel="noreferrer"><span>标准与资料</span><strong>Homomorphic Encryption Standard</strong><i>↗</i></a>
          <div className="coming-soon"><span>下一篇</span><strong>MPC：秘密如何被共同计算</strong><i>soon</i></div>
        </div>
      </section>

      <footer><div className="footer-mark"><span className="wordmark-dot" /> gengminqi.com</div><p>写给好奇者的计算机科学手记。</p><p>© 2026 · Beijing / Everywhere</p></footer>
    </main>
  );
}
