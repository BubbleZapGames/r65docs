import React, { useState, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { PyodideProvider } from '../components/Playground/PyodideProvider';
import { Toolbar } from '../components/Playground/Toolbar';
import { Editor } from '../components/Playground/Editor';
import { OutputPanel } from '../components/Playground/OutputPanel';
import { useCompiler } from '../components/Playground/useCompiler';
import { EXAMPLES } from '../components/Playground/examples';
import styles from './playground.module.css';

const DEFAULT_SOURCE = EXAMPLES[0].source;

function PlaygroundInner() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const { output, compiling, runCompile } = useCompiler();

  // Track source in a ref so the compile callback always has the latest
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const handleCompile = useCallback(() => {
    runCompile(sourceRef.current);
  }, [runCompile]);

  const handleSelectExample = useCallback((idx) => {
    const example = EXAMPLES[idx];
    if (example) {
      setSource(example.source);
    }
  }, []);

  return (
    <div className={styles.playground}>
      <Toolbar
        onCompile={handleCompile}
        onSelectExample={handleSelectExample}
        compiling={compiling}
      />
      <div className={styles.panels}>
        <div className={styles.editorPane}>
          <div className={styles.paneHeader}>R65 Source</div>
          <div className={styles.paneContent}>
            <Editor
              value={source}
              onChange={setSource}
              onCompile={handleCompile}
            />
          </div>
        </div>
        <div className={styles.outputPane}>
          <div className={styles.paneHeader}>WLA-DX Assembly</div>
          <div className={styles.paneContent}>
            <OutputPanel output={output} compiling={compiling} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <Layout title="Playground" description="R65 online compiler playground">
      <BrowserOnly fallback={<div className={styles.loading}>Loading playground...</div>}>
        {() => (
          <PyodideProvider>
            <PlaygroundInner />
          </PyodideProvider>
        )}
      </BrowserOnly>
    </Layout>
  );
}
