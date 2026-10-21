/**
 * Ejected from @docusaurus/theme-classic 3.9.2 (NotFound/Content).
 *
 * R65 change: a "game over" screen in the site's Cartridge style.
 */
import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

const CONTINUES = [
  {label: 'Home', to: '/'},
  {label: 'Docs', to: '/docs/getting-started/overview'},
  {label: 'Examples', to: '/examples'},
  {label: 'Blog', to: '/blog'},
];

export default function NotFoundContent({className}) {
  return (
    <main className={clsx(styles.screen, className)}>
      <div className={styles.inner}>
        <span className={clsx('pixel-label', styles.code)}>Error 404</span>
        <h1 className={styles.title}>GAME OVER</h1>
        <p className={styles.sub}>
          That page isn't on this cartridge. It may have moved, or the link
          that brought you here is broken.
        </p>
        <p className={styles.cont}>
          CONTINUE?<span className={styles.caret} aria-hidden="true">▌</span>
        </p>
        <nav className={styles.options} aria-label="Where to next">
          {CONTINUES.map((c) => (
            <Link key={c.to} to={c.to} className={styles.option}>
              {c.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
