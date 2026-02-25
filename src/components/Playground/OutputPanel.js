import React, { useEffect, useRef } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import styles from './OutputPanel.module.css';

export function OutputPanel({ output, compiling }) {
  if (compiling) {
    return (
      <div className={styles.panel}>
        <pre className={styles.output}>
          <span className={styles.muted}>Compiling...</span>
        </pre>
      </div>
    );
  }

  if (!output) {
    return (
      <div className={styles.panel}>
        <pre className={styles.output}>
          <span className={styles.muted}>
            Press Compile or Ctrl+Enter to compile.
          </span>
        </pre>
      </div>
    );
  }

  if (output.success) {
    return (
      <div className={styles.panel}>
        <AsmViewer code={output.output} />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <pre className={styles.output}>
        <ErrorDisplay text={output.error} />
      </pre>
    </div>
  );
}

function AsmViewer({ code }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const { colorMode } = useColorMode();

  useEffect(() => {
    let destroyed = false;

    async function setup() {
      const { EditorView, lineNumbers } = await import('@codemirror/view');
      const { EditorState } = await import('@codemirror/state');
      const { StreamLanguage, codeFolding, foldGutter, foldEffect, foldService } = await import('@codemirror/language');
      const { wladx65816 } = await import('./wladx-mode');
      const { oneDark } = await import('@codemirror/theme-one-dark');

      if (destroyed || !containerRef.current) return;

      const FOLD_LINES = 30;

      // Fold service that offers to fold lines 1-30 as a single region
      const headerFold = foldService.of((state, lineStart) => {
        if (state.doc.lineAt(lineStart).number === 1 && state.doc.lines > FOLD_LINES) {
          const endLine = state.doc.line(FOLD_LINES);
          return { from: state.doc.line(1).to, to: endLine.to };
        }
        return null;
      });

      const extensions = [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        StreamLanguage.define(wladx65816),
        lineNumbers(),
        headerFold,
        codeFolding(),
        foldGutter(),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-gutters': { border: 'none' },
        }),
      ];

      if (colorMode === 'dark') {
        extensions.push(oneDark);
      }

      // Destroy previous instance
      if (viewRef.current) {
        viewRef.current.destroy();
      }

      containerRef.current.innerHTML = '';

      const state = EditorState.create({ doc: code, extensions });
      viewRef.current = new EditorView({
        state,
        parent: containerRef.current,
      });

      // Auto-fold the first 30 lines
      if (code.split('\n').length > FOLD_LINES) {
        const endLine = state.doc.line(FOLD_LINES);
        viewRef.current.dispatch({
          effects: foldEffect.of({ from: state.doc.line(1).to, to: endLine.to }),
        });
      }
    }

    setup();

    return () => {
      destroyed = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [code, colorMode]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}

function ErrorDisplay({ text }) {
  if (!text) return <span className={styles.errorText}>Unknown error</span>;

  const lines = text.split('\n');
  return lines.map((line, i) => {
    const key = i;
    if (line.startsWith('error:') || line.startsWith('error[')) {
      return <span key={key} className={styles.errorText}>{line}{'\n'}</span>;
    }
    if (line.startsWith('hint:')) {
      return <span key={key} className={styles.hintText}>{line}{'\n'}</span>;
    }
    if (line.startsWith('warning:')) {
      return <span key={key} className={styles.warningText}>{line}{'\n'}</span>;
    }
    if (line.match(/^\s*-->/)) {
      return <span key={key} className={styles.locationText}>{line}{'\n'}</span>;
    }
    if (line.match(/^\s*\d+\s*\|/) || line.match(/^\s*\|/)) {
      const caretMatch = line.match(/^(\s*\|)(\s*)([\^~]+)(.*)/);
      if (caretMatch) {
        return (
          <span key={key} className={styles.muted}>
            {caretMatch[1]}{caretMatch[2]}
            <span className={styles.errorText}>{caretMatch[3]}</span>
            <span className={styles.errorText}>{caretMatch[4]}</span>
            {'\n'}
          </span>
        );
      }
      return <span key={key} className={styles.sourceLine}>{line}{'\n'}</span>;
    }
    return <span key={key}>{line}{'\n'}</span>;
  });
}
