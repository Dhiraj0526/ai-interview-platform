import React, { useState, useCallback, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const socket = io(API);

const STARTERS = {
  python: `import sys\n\n# Read input from stdin\n# sample: for line in sys.stdin:\n#    print(line.strip()[::-1])\n\nprint("Hello!")`,
  java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // if (sc.hasNextLine()) System.out.println(sc.nextLine());\n\n        System.out.println("Hello!");\n    }\n}`,
};

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function Coding({ problems: persistentProblems, onProblemsFetched, onComplete, stateSnapshot, onStateChange }) {
  const [language, setLanguage] = useState(stateSnapshot?.language || "python");
  const [problems, setProblems] = useState(persistentProblems || []);
  const [qIdx, setQIdx] = useState(stateSnapshot?.qIdx || 0); 
  const [loading, setLoading] = useState(false);
  const [runningRaw, setRunningRaw] = useState(false);
  const [output, setOutput] = useState(stateSnapshot?.output || "");
  
  // Persistent state for each of the 3 questions
  const [sessionData, setSessionData] = useState(stateSnapshot?.sessionData || [
    { code: STARTERS.python, timeLeft: 1800, testResults: null, customInput: "", output: "" },
    { code: STARTERS.python, timeLeft: 1800, testResults: null, customInput: "", output: "" },
    { code: STARTERS.python, timeLeft: 1800, testResults: null, customInput: "", output: "" }
  ]);

  useEffect(() => {
    if (onStateChange) {
      onStateChange({ language, qIdx, output, sessionData });
    }
  }, [language, qIdx, output, sessionData, onStateChange]);

  const timerRef = useRef(null);

  useEffect(() => {
    if (persistentProblems && persistentProblems.length > 0) return;

    let cancelled = false;
    axios.get(`${API}/coding?t=${Date.now()}`).then((res) => {
      if (!cancelled && res.data && res.data.data) {
        setProblems(res.data.data);
        if (onProblemsFetched) onProblemsFetched(res.data.data);
      }
    }).catch(e => console.error(e));
    return () => { cancelled = true; };
  }, [persistentProblems, onProblemsFetched]);

  // Update current session data when language changes (for initial load or explicit switch)
  useEffect(() => {
    setSessionData(prev => prev.map((d, i) => {
       if (d.code === STARTERS.python || d.code === STARTERS.java || d.code === "") {
          return { ...d, code: STARTERS[language] };
       }
       return d;
    }));
  }, [language]);

  // Timer Countdown Logic: Only ticks for the active question
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      setSessionData(prev => {
        const newData = [...prev];
        const current = newData[qIdx];
        if (current.timeLeft <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return prev;
        }
        newData[qIdx] = { ...current, timeLeft: current.timeLeft - 1 };
        return newData;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [qIdx]);

  const handleAutoSubmit = () => {
    // Logic for auto-submit if needed
    console.log("Auto-submitting question", qIdx);
  };

  const updateCurrentWork = (updates) => {
    setSessionData(prev => {
      const newData = [...prev];
      newData[qIdx] = { ...newData[qIdx], ...updates };
      return newData;
    });
  };

  // Socket listener for interactive output
  useEffect(() => {
    const onOutput = (text) => {
      setOutput(prev => prev + text);
      updateCurrentWork({ output: (sessionData[qIdx].output || "") + text });
    };

    const onExit = (data) => {
      setRunningRaw(false);
      // setOutput(prev => prev + `\n=== Process Exited (code ${data.code}) ===\n`);
    };

    socket.on("output", onOutput);
    socket.on("exit", onExit);

    return () => {
      socket.off("output", onOutput);
      socket.off("exit", onExit);
    };
  }, [qIdx, sessionData]);

  const runCodeRaw = async () => {
    setRunningRaw(true);
    setOutput("");
    updateCurrentWork({ output: "", testResults: null });
    socket.emit("run-interactive", { language, code: sessionData[qIdx].code, initialInput: sessionData[qIdx].customInput });
  };

  const handleInputKeyDown = (e) => {
    if (runningRaw) {
      if (e.key === "Enter") {
        e.preventDefault();
        const inputLine = e.target.value + "\n";
        
        // Append input to terminal history immediately
        setOutput(prev => prev + inputLine);
        updateCurrentWork({ 
            output: (sessionData[qIdx].output || "") + inputLine,
            customInput: "" // Clear current input after sending
        });

        // Send to backend
        socket.emit("input-interactive", inputLine);
      }
    }
  };

  const handleEditorKeyDown = (e) => {
    const textarea = e.target;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    const setVal = (newVal, newStart, newEnd) => {
      updateCurrentWork({ code: newVal });
      // Use setTimeout to ensure the DOM has updated before setting selection
      setTimeout(() => {
        textarea.selectionStart = newStart;
        textarea.selectionEnd = newEnd;
      }, 0);
    };

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: Outdent
        const lines = value.substring(0, start).split("\n");
        const currentLine = lines[lines.length - 1];
        if (currentLine.startsWith("    ")) {
          const newVal = value.substring(0, start - 4) + value.substring(start);
          setVal(newVal, start - 4, end - 4);
        } else if (currentLine.startsWith("\t")) {
          const newVal = value.substring(0, start - 1) + value.substring(start);
          setVal(newVal, start - 1, end - 1);
        }
      } else {
        // Tab: Indent
        const newVal = value.substring(0, start) + "    " + value.substring(end);
        setVal(newVal, start + 4, start + 4);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const lines = value.substring(0, start).split("\n");
      const currentLine = lines[lines.length - 1];
      const indentation = currentLine.match(/^\s*/)[0];
      const prevChar = value[start - 1];
      const nextChar = value[start];

      let newIndentation = indentation;
      if (prevChar === "{" || prevChar === "(" || prevChar === "[") {
        newIndentation += "    ";
      }

      if ((prevChar === "{" && nextChar === "}") || (prevChar === "(" && nextChar === ")") || (prevChar === "[" && nextChar === "]")) {
        // Smart block expansion: { | } -> { \n    | \n }
        const newVal = value.substring(0, start) + "\n" + newIndentation + "\n" + indentation + value.substring(end);
        setVal(newVal, start + 1 + newIndentation.length, start + 1 + newIndentation.length);
      } else {
        const newVal = value.substring(0, start) + "\n" + newIndentation + value.substring(end);
        setVal(newVal, start + 1 + newIndentation.length, start + 1 + newIndentation.length);
      }
    } else if (e.key === "{" || e.key === "(" || e.key === "[" || e.key === "\"" || e.key === "'") {
      e.preventDefault();
      const pairs = { "{": "}", "(": ")", "[": "]", "\"": "\"", "'": "'" };
      const closer = pairs[e.key];
      const newVal = value.substring(0, start) + e.key + closer + value.substring(end);
      setVal(newVal, start + 1, start + 1);
    } else if (e.key === "Backspace") {
      const prevChar = value[start - 1];
      const nextChar = value[start];
      const pairs = { "{": "}", "(": ")", "[": "]", "\"": "\"", "'": "'" };
      if (pairs[prevChar] === nextChar) {
        e.preventDefault();
        const newVal = value.substring(0, start - 1) + value.substring(start + 1);
        setVal(newVal, start - 1, start - 1);
      }
    }
  };

  const submitCode = async () => {
    const problem = problems[qIdx];
    if (!problem) return;
    const current = sessionData[qIdx];
    
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/submit-code`, { language, code: current.code, testCases: problem.testCases });
      updateCurrentWork({ testResults: data });
    } catch (err) { setOutput("Submission Failed"); }
    finally { setLoading(false); }
  };

  const navigate = (newIdx) => {
    if (newIdx >= 0 && newIdx < 3) {
      setQIdx(newIdx);
      setOutput(sessionData[newIdx].output || "");
    }
  };

  const finishAssessment = () => {
    const results = sessionData.map((d, i) => ({
       title: problems[i]?.title || `Question ${i+1}`,
       passed: d.testResults?.passed || 0,
       total: d.testResults?.total || 10
    }));
    const totalPassed = results.reduce((acc, r) => acc + r.passed, 0);
    const totalMax = results.reduce((acc, r) => acc + r.total, 0);
    onComplete(totalPassed, totalMax, results);
  };

  const current = sessionData[qIdx];
  const problem = problems[qIdx];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', background: '#0d1117', color: '#c9d1d9', overflow: 'hidden' }}>
      
      {/* HEADER: Navigation, Language, Timer */}
      <div style={{ padding: '0.75rem 1.5rem', background: '#161b22', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #30363d' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={() => navigate(qIdx - 1)} 
            disabled={qIdx === 0}
            style={{ background: '#21262d', border: '1px solid #30363d', color: qIdx === 0 ? '#484f58' : '#fff', padding: '4px 12px', borderRadius: '4px', cursor: qIdx === 0 ? 'default' : 'pointer' }}
          >
            ← Previous
          </button>
          
          <span style={{ fontWeight: 'bold', minWidth: '100px', textAlign: 'center' }}>
            Question {qIdx + 1} of 3
          </span>

          <button 
            onClick={() => navigate(qIdx + 1)} 
            disabled={qIdx === 2}
            style={{ background: '#21262d', border: '1px solid #30363d', color: qIdx === 2 ? '#484f58' : '#fff', padding: '4px 12px', borderRadius: '4px', cursor: qIdx === 2 ? 'default' : 'pointer' }}
          >
            Next →
          </button>

          <span style={{ height: '20px', width: '1px', background: '#30363d', margin: '0 0.5rem' }}></span>
          
          <span style={{ color: current.timeLeft < 300 ? '#f85149' : '#e6edf3', fontSize: '1.2rem', fontFamily: 'monospace', fontWeight: 'bold', minWidth: '80px' }}>
            ⏳ {formatTime(current.timeLeft)}
          </span>

          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ background: '#21262d', color: '#fff', border: '1px solid #30363d', borderRadius: '4px', padding: '0.2rem 0.5rem' }}>
            <option value="python">Python 3</option>
            <option value="java">Java 22</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={runCodeRaw} disabled={runningRaw || loading} style={{ padding: '0.5rem 1rem', background: '#161b22', color: '#fff', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}>
            {runningRaw ? "..." : "Run Code"}
          </button>
          
          <button onClick={submitCode} disabled={loading} style={{ padding: '0.5rem 1.5rem', background: '#238636', color: '#fff', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {loading ? "Submitting..." : (!!current.testResults ? "Re-Submit & Grade" : "Submit & Grade")}
          </button>

          {qIdx === 2 && (
            <button onClick={finishAssessment} style={{ padding: '0.5rem 1.5rem', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Finalize Round →
            </button>
          )}
        </div>
      </div>

      {/* Main Split */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left: Editor & Description */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #30363d' }}>
          <div style={{ padding: '1rem', background: '#0d1117', borderBottom: '1px solid #30363d', overflowY: 'auto', maxHeight: '250px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#58a6ff' }}>{problem?.title || "Loading Challenge..." }</h3>
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: qIdx === 0 ? '#238636' : qIdx === 1 ? '#d29922' : '#f85149', color: '#fff', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {qIdx === 0 ? "Easy" : qIdx === 1 ? "Medium" : "Hard"}
                </span>
             </div>
             <p style={{ margin: 0, fontSize: '0.95rem', color: '#8b949e', lineHeight: '1.6' }}>{problem?.description}</p>
             {problem?.testCases && problem.testCases.length > 0 && (
               <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                 {problem.testCases.slice(0, 2).map((tc, idx) => (
                   <div key={idx} style={{ background: '#161b22', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #30363d', flex: 1, minWidth: '150px' }}>
                     <div style={{ fontSize: '0.8rem', color: '#58a6ff', marginBottom: '0.2rem', fontWeight: 'bold' }}>Sample {idx + 1}</div>
                     <div style={{ fontSize: '0.85rem', color: '#e6edf3', fontFamily: 'monospace' }}>
                       <div style={{ marginBottom: '2px' }}><span style={{ color: '#8b949e' }}>Input: </span> {tc.input}</div>
                       <div><span style={{ color: '#8b949e' }}>Output: </span> {tc.expectedOutput}</div>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
          <textarea
            value={current.code}
            onChange={(e) => updateCurrentWork({ code: e.target.value })}
            onKeyDown={handleEditorKeyDown}
            spellCheck={false}
            style={{ flex: 1, background: '#0d1117', color: '#e6edf3', border: 'none', padding: '1.5rem', fontFamily: '"JetBrains Mono", monospace', fontSize: '1rem', outline: 'none', resize: 'none' }}
          />
        </div>

        {/* Right: Console */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderBottom: '1px solid #30363d' }}>
            <div style={{ padding: '0.8rem 1rem', background: '#161b22', fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>
               Output
            </div>
            <div style={{ flex: 1, background: '#0d1117', padding: '1rem', overflowY: 'auto' }}>
               <pre style={{ margin: 0, color: '#e6edf3', fontSize: '0.95rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{current.output || output}</pre>
               
               {current.testResults && (
                   <div style={{ marginTop: '1rem', borderTop: '1px solid #30363d', paddingTop: '1rem' }}>
                      <div style={{ color: '#8b949e', fontSize: '0.9rem', marginBottom: '0.5rem' }}>=== Code Execution Successful ===</div>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Result: {current.testResults.passed} / {current.testResults.total} passed</div>
                      {current.testResults.results.map((r, i) => (
                          <div key={i} style={{ color: r.passed ? '#3fb950' : '#f85149', fontSize: '0.85rem' }}>
                             Case {r.testCaseIndex}: {r.passed ? "✓" : "✗"}
                          </div>
                      ))}
                   </div>
               )}

               <div style={{ marginTop: '1rem', borderTop: '1px solid #30363d', paddingTop: '1rem' }}>
                 <textarea
                   value={current.customInput}
                   onChange={(e) => updateCurrentWork({ customInput: e.target.value })}
                   onKeyDown={handleInputKeyDown}
                   placeholder={runningRaw ? "Type input and press Enter..." : "Prepare input (optional)..."}
                   spellCheck={false}
                   autoFocus={runningRaw}
                   style={{
                     width: '100%',
                     background: 'transparent',
                     color: '#e6edf3',
                     border: 'none',
                     outline: 'none',
                     resize: 'none',
                     fontFamily: 'monospace',
                     fontSize: '0.95rem',
                     padding: 0,
                     lineHeight: '1.4'
                   }}
                   onInput={(e) => {
                     e.target.style.height = 'auto';
                     e.target.style.height = e.target.scrollHeight + 'px';
                   }}
                 />
               </div>
            </div>
          </div>
          
        </div>

      </div>
    </div>
  );
}

export default Coding;
