import React from 'react';
import { usePyodide } from './PyodideProvider';
import { EXAMPLES } from './examples';
import styles from './Toolbar.module.css';

export function Toolbar({ onCompile, onSelectExample, compiling }) {
  const { status, statusText } = usePyodide();
  const isReady = status === 'ready';

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <button
          className={styles.compileButton}
          onClick={onCompile}
          disabled={!isReady || compiling}
          title="Compile (Ctrl+Enter)"
        >
          {compiling ? 'Compiling...' : '\u25B6 Compile'}
        </button>
        <select
          className={styles.exampleSelect}
          onChange={(e) => {
            const idx = parseInt(e.target.value, 10);
            if (!isNaN(idx)) {
              onSelectExample(idx);
            }
          }}
          defaultValue=""
        >
          <option value="" disabled>
            Examples...
          </option>
          {EXAMPLES.map((ex, i) => (
            <option key={i} value={i}>
              {ex.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.right}>
        <span className={styles.status}>
          <span
            className={styles.statusDot}
            data-status={status}
          />
          {statusText}
        </span>
      </div>
    </div>
  );
}
