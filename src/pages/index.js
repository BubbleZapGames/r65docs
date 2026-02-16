import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <p className={styles.heroDescription}>
          Hardware-transparent programming for the SNES and 65816, with
          Rust-inspired syntax and compile-time type safety.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/language-overview">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

function CodeExample() {
  return (
    <section className={styles.codeExample}>
      <div className="container">
        <div className="row">
          <div className={clsx('col col--6')}>
            <Heading as="h2">Write for the hardware</Heading>
            <p>
              R65 gives you direct access to CPU registers, memory banks, and
              processor modes &mdash; with the safety of a modern type system.
              No runtime overhead, no hidden abstractions.
            </p>
            <p>
              Compiles to clean WLA-DX assembly that reads like hand-written code.
            </p>
          </div>
          <div className={clsx('col col--6')}>
            <pre className={styles.codeBlock}>
              <code>{`#[interrupt(nmi)]
fn vblank_handler() {
    dma_transfer(VRAM_BUFFER, 0x0000, 256);
    FRAME_COUNTER++;
}

fn update_sprite(id @ A: u8, x @ X: u16) {
    let offset = (id as u16) * 4;
    OAM_BUFFER[offset] = x as u8;
}`}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Home"
      description="R65 - A Rust-inspired language for the 65816 processor. Hardware-transparent programming for the SNES.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <CodeExample />
      </main>
    </Layout>
  );
}
