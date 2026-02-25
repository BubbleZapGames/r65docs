import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { Editor } from '../components/Playground/Editor';
import styles from './examples.module.css';

const SOURCE_CACHE = {};

function PreviewOverlay({ smcUrl, exampleName, onClose }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Set EmulatorJS globals before loading the script
    window.EJS_player = '#ejs-game';
    window.EJS_core = 'snes';
    window.EJS_gameName = exampleName;
    window.EJS_color = '#0064ff';
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
    window.EJS_gameUrl = smcUrl;
    window.EJS_VirtualGamepadSettings = [
      { type: "button", text: "Y", id: "y", location: "right", left: 40, bold: true, input_value: 9 },
      { type: "button", text: "X", id: "X", location: "right", top: 40, bold: true, input_value: 1 },
      { type: "button", text: "B", id: "b", location: "right", left: 81, top: 40, bold: true, input_value: 8 },
      { type: "button", text: "A", id: "a", location: "right", left: 40, top: 80, bold: true, input_value: 0 },
      { type: "zone", location: "left", left: "50%", top: "50%", joystickInput: true, color: "blue", inputValues: [19, 18, 17, 16] },
      { type: "dpad", location: "left", left: "50%", right: "50%", joystickInput: false, inputValues: [4, 5, 6, 7] },
      { type: "button", text: "Start", id: "start", location: "center", left: 60, fontSize: 15, block: true, input_value: 3 },
      { type: "button", text: "Select", id: "select", location: "center", left: -5, fontSize: 15, block: true, input_value: 2 },
    ];

    const script = document.createElement('script');
    script.src = 'https://cdn.emulatorjs.org/stable/data/loader.js';
    container.appendChild(script);

    return () => {
      // Clean up EmulatorJS globals and DOM
      delete window.EJS_player;
      delete window.EJS_core;
      delete window.EJS_gameName;
      delete window.EJS_color;
      delete window.EJS_pathtodata;
      delete window.EJS_gameUrl;
      delete window.EJS_VirtualGamepadSettings;
      // EmulatorJS creates an iframe and other elements — clearing the container removes them
      container.innerHTML = '<div id="ejs-game"></div>';
    };
  }, [smcUrl, exampleName]);

  return (
    <div className={styles.previewOverlay} onClick={onClose}>
      <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <span>{exampleName}</span>
          <button className={styles.previewClose} onClick={onClose}>
            &#x2715;
          </button>
        </div>
        <div className={styles.previewBody} ref={containerRef}>
          <div id="ejs-game"></div>
        </div>
      </div>
    </div>
  );
}

function ExamplesInner() {
  const [categories, setCategories] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [activeMeta, setActiveMeta] = useState(null);
  const [source, setSource] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [showPreview, setShowPreview] = useState(false);

  // Fetch manifest on mount and auto-select first example
  useEffect(() => {
    fetch('/examples/manifest.json')
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories);
        // Auto-select from hash or first example
        const hash = window.location.hash.replace('#', '');
        let found = null;
        for (const cat of data.categories) {
          for (const ex of cat.examples) {
            if (hash && ex.id === hash) {
              found = ex;
              break;
            }
          }
          if (found) break;
        }
        if (!found) {
          found = data.categories[0]?.examples[0];
        }
        if (found) {
          setActiveId(found.id);
          setActiveMeta(found);
          window.history.replaceState(null, '', '#' + found.id);
          fetch('/examples/' + found.file)
            .then((r) => r.text())
            .then((text) => {
              SOURCE_CACHE[found.file] = text;
              setSource(text);
            });
        }
      });
  }, []);

  // Listen for hash changes
  useEffect(() => {
    function onHashChange() {
      if (!categories) return;
      const hash = window.location.hash.replace('#', '');
      if (!hash || hash === activeId) return;
      for (const cat of categories) {
        for (const ex of cat.examples) {
          if (ex.id === hash) {
            selectExample(ex);
            return;
          }
        }
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [categories, activeId]);

  const selectExample = useCallback((example) => {
    setActiveId(example.id);
    setActiveMeta(example);
    setShowPreview(false);
    window.history.replaceState(null, '', '#' + example.id);

    if (SOURCE_CACHE[example.file]) {
      setSource(SOURCE_CACHE[example.file]);
      return;
    }

    fetch('/examples/' + example.file)
      .then((r) => r.text())
      .then((text) => {
        SOURCE_CACHE[example.file] = text;
        setSource(text);
      });
  }, []);

  const toggleCategory = useCallback((name) => {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  // no-op for onChange — editor is editable but we don't persist changes
  const handleSourceChange = useCallback((val) => {
    setSource(val);
  }, []);

  if (!categories) {
    return <div className={styles.loading}>Loading examples...</div>;
  }

  return (
    <div className={styles.examples}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>Examples</div>
        {categories.map((cat) => (
          <div key={cat.name} className={styles.category}>
            <button
              className={styles.categoryHeader}
              onClick={() => toggleCategory(cat.name)}
            >
              <span
                className={`${styles.chevron} ${
                  !collapsed[cat.name] ? styles.chevronOpen : ''
                }`}
              >
                &#9654;
              </span>
              {cat.name}
            </button>
            {!collapsed[cat.name] && (
              <ul className={styles.exampleList}>
                {cat.examples.map((ex) => (
                  <li key={ex.id}>
                    <button
                      className={`${styles.exampleItem} ${
                        activeId === ex.id ? styles.exampleItemActive : ''
                      }`}
                      onClick={() => selectExample(ex)}
                    >
                      {ex.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className={styles.mainPane}>
        {activeMeta ? (
          <>
            <div className={styles.editorHeader}>
              <div className={styles.editorTitleRow}>
                <div className={styles.editorTitle}>{activeMeta.name}</div>
                <button
                  className={styles.previewButton}
                  onClick={() => setShowPreview(true)}
                >
                  Preview
                </button>
              </div>
              <div className={styles.editorDescription}>
                {activeMeta.description}
              </div>
            </div>
            <div className={styles.editorContent}>
              <Editor value={source} onChange={handleSourceChange} />
            </div>
            {showPreview && (
              <PreviewOverlay
                smcUrl={'/examples/' + activeMeta.file.replace(/\.r65$/, '.smc')}
                exampleName={activeMeta.name}
                onClose={() => setShowPreview(false)}
              />
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            Select an example from the sidebar
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExamplesPage() {
  return (
    <Layout title="Examples" description="R65 code examples">
      <BrowserOnly
        fallback={<div className={styles.loading}>Loading examples...</div>}
      >
        {() => <ExamplesInner />}
      </BrowserOnly>
    </Layout>
  );
}
