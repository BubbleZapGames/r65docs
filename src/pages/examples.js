import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { Editor } from '../components/Playground/Editor';
import styles from './examples.module.css';

const SOURCE_CACHE = {};

function ExamplesInner() {
  const [categories, setCategories] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [activeMeta, setActiveMeta] = useState(null);
  const [source, setSource] = useState('');
  const [collapsed, setCollapsed] = useState({});

  // Fetch manifest on mount
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
          selectExample(found);
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
              <div className={styles.editorTitle}>{activeMeta.name}</div>
              <div className={styles.editorDescription}>
                {activeMeta.description}
              </div>
            </div>
            <div className={styles.editorContent}>
              <Editor value={source} onChange={handleSourceChange} />
            </div>
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
