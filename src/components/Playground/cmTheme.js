// CodeMirror theme shared by the source editor and the assembly viewer.
//
// The site shows code as black cards in both colour modes, so the editors are
// dark in both too: One Dark's syntax colours on the site's own code
// background (--r65-code-bg in custom.css) instead of One Dark's blue-grey.
export async function r65EditorTheme() {
  const { EditorView } = await import('@codemirror/view');
  const { Prec } = await import('@codemirror/state');
  const { oneDark } = await import('@codemirror/theme-one-dark');

  const surface = EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--r65-code-bg)',
        color: '#e6e6e6',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--r65-code-bg)',
        color: '#5c5c5c',
        border: 'none',
      },
      '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        color: '#bdbdbd',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'rgba(232, 65, 44, 0.3)',
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ffffff' },
      '.cm-foldPlaceholder': {
        backgroundColor: '#1f1f1f',
        border: '1px solid #333',
        color: '#a3a3a3',
      },
      '.cm-tooltip, .cm-panels': {
        backgroundColor: '#1a1a1a',
        color: '#e6e6e6',
        border: '1px solid #262626',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'rgba(232, 65, 44, 0.35)',
      },
    },
    { dark: true },
  );

  return [oneDark, Prec.highest(surface)];
}
