import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import {SOA, SHOTS, Code} from '@site/src/components/home/content';
import styles from './index.module.css';

const PRODUCTS = [
  {tag: 'r65c', title: 'The compiler', body: 'Type checking, automatic REP/SEP, register allocation and 10+ optimization passes, emitting plain WLA-DX assembly.', to: '/docs/platform/compiler', tone: 'red'},
  {tag: 'stdlib', title: 'Standard library', body: 'sneslib, math with the hardware multiplier, strings, console text, U32/I32/F32 and fixed-point types.', to: '/docs/platform/math', tone: 'ink'},
  {tag: 'mesen-gdb', title: 'Debugger & tests', body: 'Source-level symbols in Mesen, plus a headless runner that asserts on registers and memory.', to: '/docs/platform/compiler', tone: 'ink'},
  {tag: 'playground', title: 'Try it in the browser', body: 'Compile R65 to assembly without installing anything, then run the examples in an emulator.', to: '/playground', tone: 'blue'},
];

const STATS = [
  {n: '~60,000', l: 'CPU cycles per frame. Spend them on your game.'},
  {n: '10+', l: 'optimization passes, from STZ conversion to loop rotation.'},
  {n: '16 MB', l: 'of 24-bit address space, with near and far in the types.'},
  {n: 'MIT', l: 'licensed. Use it for open-source and commercial games.'},
];

function Hero() {
  return (
    <header className={styles.hero}>
      <img className={styles.heroBg} src="/img/design/platformer.png" alt="" />
      <div className={styles.heroShade} />
      <div className={styles.wrap}>
        <div className={styles.heroInner}>
          <span className={styles.pixLabel}>SNES · 65816 · WLA-DX</span>
          <h1 className={styles.heroTitle}>Build for the Super&nbsp;Nintendo in a modern language.</h1>
          <p className={styles.heroSub}>
            R65 brings structs, enums, traits and a type checker to the 65816,
            and compiles them to assembly you'd be happy to have written yourself.
          </p>
          <div className={styles.pills}>
            <Link className={styles.pillWhite} to="/docs/getting-started/setup">Get started</Link>
            <Link className={styles.pillOutline} to="/examples">Play the examples</Link>
          </div>
        </div>
      </div>
      <Link className={styles.heroCredit} to="/examples#platformer" data-noBrokenLinkCheck>
        <span className={styles.dot} /> Basic Platform · an R65 example ↗
      </Link>
    </header>
  );
}

function Reel() {
  const items = [...SHOTS, ...SHOTS];
  return (
    <div className={styles.reel} aria-label="Screenshots of ROMs built with R65">
      <div className={styles.reelTrack}>
        {items.map((s, i) => (
          <img key={i} src={s.img} alt={i < SHOTS.length ? s.title : ''} className={styles.reelImg} />
        ))}
      </div>
    </div>
  );
}

function Showcase() {
  const [kong, ...rest] = SHOTS;
  return (
    <section className={styles.dark}>
      <div className={styles.wrap}>
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Made with R65</h2>
          <Link className={styles.textLink} to="/examples">All examples →</Link>
        </div>
        <div className={styles.feature}>
          <img src={kong.img} alt="Classic Kong gameplay" className={styles.featureImg} />
          <div className={styles.featureBody}>
            <span className={styles.pixLabel}>Featured game</span>
            <h3>Classic Kong</h3>
            <p>
              Classic Kong Complete, originally written in C. The R65 port
              replaces every line with type-safe R65 and reproduces the
              original gameplay frame-for-frame: four stages, the cutscenes,
              and the game-over sequence.
            </p>
            <div className={styles.pills}>
              <Link className={styles.pillWhite} to={kong.href}>View the source</Link>
            </div>
          </div>
        </div>
        <div className={styles.tiles}>
          {rest.slice(0, 4).map((s) => (
            <Link key={s.id} to={s.href} className={styles.tile} data-noBrokenLinkCheck>
              <div className={styles.tileImgWrap}>
                <img src={s.img} alt={`${s.title} screenshot`} loading="lazy" />
                <span className={styles.tilePlay}>▶ Play in browser</span>
              </div>
              <span className={styles.pixSmall}>{s.kind}</span>
              <strong>{s.title}</strong>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Products() {
  return (
    <section className={styles.light}>
      <div className={styles.wrap}>
        <h2 className={styles.h2}>Everything you need to ship a cart</h2>
        <div className={styles.products}>
          {PRODUCTS.map((p) => (
            <Link key={p.tag} to={p.to} className={`${styles.product} ${styles[p.tone]}`}>
              <span className={styles.pixSmall}>{p.tag}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <span className={styles.more}>Learn more →</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function OneInstruction() {
  return (
    <section className={styles.light2}>
      <div className={styles.wrap}>
        <div className={styles.oneGrid}>
          <div>
            <span className={styles.bigNum}>1</span>
            <h2 className={styles.h2}>instruction per enemy.</h2>
            <p className={styles.sub}>
              Mark a struct <code>#[soa]</code> and every array of it is stored
              one array per field. A method call on an element compiles to a
              single indexed <code>DEC</code>: no stride multiply, no pointer.
            </p>
            <Link className={styles.textLinkDark} to="/docs/language/attributes#soa">How #[soa] works →</Link>
          </div>
          <div className={styles.codeStack}>
            <pre className={styles.codeCard}><span className={styles.codeLabel}>enemy.r65</span>{'\n'}<Code code={SOA.r65} lang="r65" styles={styles} /></pre>
            <pre className={`${styles.codeCard} ${styles.codeOut}`}><span className={styles.codeLabel}>r65c output</span>{'\n'}<Code code={SOA.asm} lang="asm" styles={styles} /></pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  return (
    <section className={styles.dark}>
      <div className={styles.wrap}>
        <div className={styles.stats}>
          {STATS.map((s) => (
            <div key={s.n} className={styles.stat}>
              <span className={styles.statN}>{s.n}</span>
              <span className={styles.statL}>{s.l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PressStart() {
  return (
    <section className={styles.start}>
      <div className={styles.wrap}>
        <h2 className={styles.startTitle}>PRESS START<span className={styles.caret} aria-hidden="true">▌</span></h2>
        <code className={styles.startCmd}>r65x init --platform snes my_game</code>
        <div className={styles.pills} style={{justifyContent: 'center'}}>
          <Link className={styles.pillWhite} to="/docs/getting-started/setup">Install R65</Link>
          <Link className={styles.pillOutline} to="/docs/getting-started/overview">Read the tour</Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Layout
      title="Home"
      description="R65 - A Rust-inspired language for the 65816 processor. Hardware-transparent programming for the SNES.">
      <main className={styles.page}>
        <Hero />
        <Reel />
        <Showcase />
        <Products />
        <OneInstruction />
        <Stats />
        <PressStart />
      </main>
    </Layout>
  );
}
