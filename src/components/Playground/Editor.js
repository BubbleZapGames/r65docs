import React, { useEffect, useRef } from 'react';
import { useColorMode } from '@docusaurus/theme-common';

export function Editor({ value, onChange, onCompile }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const { colorMode } = useColorMode();

  // Track latest callbacks in refs so the keymap doesn't go stale
  const onCompileRef = useRef(onCompile);
  onCompileRef.current = onCompile;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let destroyed = false;

    async function setup() {
      const { EditorView, keymap } = await import('@codemirror/view');
      const { EditorState, Prec } = await import('@codemirror/state');
      const { basicSetup } = await import('codemirror');
      const { rust } = await import('@codemirror/lang-rust');
      const { oneDark } = await import('@codemirror/theme-one-dark');

      if (destroyed || !containerRef.current) return;

      const isDark = colorMode === 'dark';

      const extensions = [
        basicSetup,
        rust(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        Prec.highest(keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onCompileRef.current();
              return true;
            },
          },
        ])),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ];

      if (isDark) {
        extensions.push(oneDark);
      }

      const state = EditorState.create({
        doc: value,
        extensions,
      });

      // Clear container in case of re-init
      containerRef.current.innerHTML = '';

      viewRef.current = new EditorView({
        state,
        parent: containerRef.current,
      });
    }

    setup();

    return () => {
      destroyed = true;
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
    // Re-create editor when theme changes
  }, [colorMode]);

  // Update editor content when value changes externally (e.g. example selection)
  const valueRef = useRef(value);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc && value !== valueRef.current) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
    valueRef.current = value;
  }, [value]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}
