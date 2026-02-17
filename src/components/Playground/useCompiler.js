import { useState, useCallback } from 'react';
import { usePyodide } from './PyodideProvider';

export function useCompiler() {
  const { status, compile } = usePyodide();
  const [output, setOutput] = useState(null);
  const [compiling, setCompiling] = useState(false);

  const runCompile = useCallback((source) => {
    if (status !== 'ready' || compiling) return;

    setCompiling(true);
    // Use setTimeout to let React render the "compiling" state before blocking
    setTimeout(() => {
      const result = compile(source);
      setOutput(result);
      setCompiling(false);
    }, 10);
  }, [status, compile, compiling]);

  return { output, compiling, runCompile };
}
