import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const PyodideContext = createContext(null);

export function usePyodide() {
  return useContext(PyodideContext);
}

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js';

export function PyodideProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [statusText, setStatusText] = useState('Loading Pyodide runtime...');
  const pyodideRef = useRef(null);
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    async function init() {
      try {
        // 1. Load Pyodide script
        setStatusText('Loading Pyodide runtime...');
        await loadScript(PYODIDE_CDN);

        // 2. Initialize Pyodide
        const pyodide = await window.loadPyodide();

        // 3. Install lark from PyPI
        setStatusText('Installing parser...');
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        await micropip.install('lark');

        // 4. Install R65 compiler from local wheel
        setStatusText('Loading R65 compiler...');
        const wheelUrl = `${window.location.origin}/pyodide/r65-0.1.0-py3-none-any.whl`;
        await micropip.install(wheelUrl);

        // 5. Import compiler
        pyodide.runPython(`
from r65.compiler.main import compile_string
from r65.compiler.errors import CompilerError, format_error
`);

        pyodideRef.current = pyodide;
        setStatus('ready');
        setStatusText('Ready');
      } catch (err) {
        console.error('Pyodide init failed:', err);
        setStatus('error');
        setStatusText(`Failed to load: ${err.message}`);
      }
    }

    init();
  }, []);

  const compile = useCallback((source) => {
    const pyodide = pyodideRef.current;
    if (!pyodide) {
      return { success: false, output: null, error: 'Compiler not loaded yet' };
    }

    try {
      // Set source in Python, avoiding JS string escaping issues
      pyodide.globals.set('_playground_source', source);

      const resultProxy = pyodide.runPython(`
try:
    _output = compile_string(_playground_source, "playground.r65")
    _result = {"success": True, "output": _output, "error": None}
except CompilerError as e:
    _formatted = format_error(
        e.message,
        source_loc=e.source_loc,
        source_text=_playground_source,
        hint=getattr(e, 'hint', None),
        error_type="error"
    )
    _result = {"success": False, "output": None, "error": _formatted}
except Exception as e:
    _result = {"success": False, "output": None, "error": str(e)}
_result
`);

      const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
      resultProxy.destroy();
      return result;
    } catch (err) {
      return { success: false, output: null, error: err.message };
    }
  }, []);

  const value = { status, statusText, compile };

  return (
    <PyodideContext.Provider value={value}>
      {children}
    </PyodideContext.Provider>
  );
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.loadPyodide) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
