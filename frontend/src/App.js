import React, { useState, Fragment } from "react";
import "./App.css";
import Registration from "./Registration";
import Aptitude from "./Aptitude";
import Coding from "./Coding";
import Interview from "./Interview";
import Result from "./Result";
import Admin from "./Admin";

const STEPS = [
  { id: 0, label: "Register" },
  { id: 1, label: "Aptitude" },
  { id: 2, label: "Coding" },
  { id: 3, label: "Interview" },
  { id: 4, label: "Results" },
];

function App() {
  const [step, setStep] = useState(0); // Start at Step 0: Registration
  const [isAdmin, setIsAdmin] = useState(window.location.pathname === "/admin");
  const [assessment, setAssessment] = useState({
    userName: "",
    rollNumber: "",
    startTime: null,
    endTime: null,
    aptitudeScore: 0,
    codingScore: 0,
    codingMaxScore: 30,
    codingResults: [],
    interviewAnswers: [],
    interviewScore: 0,
    resumeText: ""
  });

  // Persist questions across navigation
  const [aptitudeQuestions, setAptitudeQuestions] = useState([]);
  const [codingProblems, setCodingProblems] = useState([]);
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [interviewState, setInterviewState] = useState({
    timeLeft: 10 * 60,
    index: 0,
    transcript: "",
    feedback: "",
    allAnswers: [],
  });

  const [aptitudeState, setAptitudeState] = useState({
    time: 600,
    answers: {}
  });

  const [codingState, setCodingState] = useState(null);

  React.useEffect(() => {
    let triggered = false;
    const handleProctorViolation = () => {
      if (triggered) return;
      // Only trigger if in an active test round (step 1, 2, or 3)
      if (step > 0 && step < 4) {
        triggered = true;
        console.warn("Proctoring violation: Tab switch or window blur detected!");
        alert("Proctoring Violation: You left the test environment. Your assessment is being automatically submitted immediately.");
        
        // Save current progress and go directly to last page (Results/Step 4)
        finalizeAssessment({
          feedback: "Auto-submitted: Tab switch / minimization / focus loss detected (Proctoring Violation)."
        });
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        handleProctorViolation();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleProctorViolation);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleProctorViolation);
    };
  }, [step]);

  const handleNext = (data) => {
    let extraData = {};
    if (!data) {
       if (step === 1) { // Leaving Aptitude via Next Round
          let score = 0;
          aptitudeQuestions.forEach((q, i) => {
            if (aptitudeState.answers[i] === q.answer) score++;
          });
          const maxScore = 10;
          const finalScore = Math.round((score / (aptitudeQuestions.length || 1)) * maxScore);
          extraData = { aptitudeScore: finalScore };
       } else if (step === 2) { // Leaving Coding via Next Round
          if (codingState && codingState.sessionData) {
             const results = codingState.sessionData.map((d, i) => ({
                title: codingProblems[i]?.title || `Question ${i+1}`,
                passed: d.testResults?.passed || 0,
                total: d.testResults?.total || 10
             }));
             const totalPassed = results.reduce((acc, r) => acc + r.passed, 0);
             const totalMax = results.reduce((acc, r) => acc + r.total, 0);
             extraData = { codingScore: totalPassed, codingMaxScore: totalMax, codingResults: results };
          }
       }
    }

    const payload = { ...extraData, ...data };
    
    if (Object.keys(payload).length > 0) {
      setAssessment((prev) => ({ ...prev, ...payload }));
    }
    setStep((prev) => prev + 1);
  };

  const finalizeAssessment = (data) => {
    setAssessment((prev) => ({
      ...prev, 
      ...data, 
      endTime: new Date().toISOString() 
    }));
    setStep(4);
  };

  const getStepName = () => {
    const found = STEPS.find((s) => s.id === step);
    return found ? `${found.label}` : "";
  };

  if (isAdmin) {
    return (
      <div className="app wide-layout">
        <button 
          onClick={() => { setIsAdmin(false); window.history.pushState({}, "", "/"); }}
          style={{ position: 'fixed', top: '1rem', left: '1rem', background: '#30363d', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', zIndex: 1000 }}
        >
          Back to Interview
        </button>
        <Admin />
      </div>
    );
  }

  return (
    <div className={step === 2 || step === 3 ? "app wide-layout" : "app"}>
      <header className="app-header">
        <div className="app-header-inner" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="app-logo-mark" aria-hidden>AI</span>
            <div>
              <h1 className="app-title">Interview simulator</h1>
              <p className="app-tagline">Practice aptitude, coding, and an AI-led interview</p>
            </div>
          </div>
          <button 
             onClick={() => { setIsAdmin(true); window.history.pushState({}, "", "/admin"); }}
             style={{ background: 'transparent', color: '#8b949e', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer', height: 'fit-content', alignSelf: 'center', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
          >
            Admin View
          </button>
        </div>
      </header>

      {step > 0 && (
        <nav className="stepper" aria-label="Assessment progress">
          {STEPS.filter(s => s.id > 0).map((s, i) => {
            const done = step > s.id;
            const current = step === s.id;
            const prevId = i > 0 ? i : null;
            const connectorActive = prevId != null && step > prevId;

            return (
              <Fragment key={s.id}>
                {i > 0 && (
                  <div
                    className={[
                      "stepper-connector",
                      connectorActive ? "stepper-connector--active" : "",
                    ].filter(Boolean).join(" ")}
                    aria-hidden
                  />
                )}
                <div
                  className={[
                    "stepper-item",
                    current ? "stepper-item--current" : "",
                    done ? "stepper-item--done" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <span className="stepper-dot">{s.id}</span>
                  <span className="stepper-label">{s.label}</span>
                </div>
              </Fragment>
            );
          })}
        </nav>
      )}

      {step > 0 && step < 4 && <h2 className="step-heading" style={{ textAlign: 'center' }}>{getStepName()} Round</h2>}

      <div className={step === 2 || step === 3 ? "content-card ui-card wide-card" : "content-card ui-card"}>
        {step === 0 && <Registration onComplete={(data) => handleNext(data)} />}
        {step === 1 && <Aptitude 
            questions={aptitudeQuestions} 
            onQuestionsFetched={setAptitudeQuestions} 
            stateSnapshot={aptitudeState}
            onStateChange={setAptitudeState}
            onComplete={(score) => handleNext({ aptitudeScore: score })} 
        />}
        {step === 2 && <Coding 
            problems={codingProblems} 
            onProblemsFetched={setCodingProblems} 
            stateSnapshot={codingState}
            onStateChange={setCodingState}
            onComplete={(score, max, results) => handleNext({ codingScore: score, codingMaxScore: max, codingResults: results })} 
        />}
        {step === 3 && (
          <Interview
            questions={interviewQuestions}
            resumeText={assessment.resumeText}
            stateSnapshot={interviewState}
            onStateChange={(partial) =>
              setInterviewState((prev) => ({ ...prev, ...partial }))
            }
            onQuestionsFetched={setInterviewQuestions}
            onComplete={(answers, interviewScore) =>
              finalizeAssessment({ interviewAnswers: answers, interviewScore })
            }
          />
        )}
        {step === 4 && <Result assessment={assessment} />}
      </div>

      <div className="nav-actions">
        {step > 1 && step < 4 && (
          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={() => setStep(step - 1)}
          >
            Previous
          </button>
        )}
        {step > 0 && step < 3 && (
          <button
            type="button"
            className="ui-btn"
            onClick={() => handleNext()}
          >
            {step === 0 ? "Start" : "Next Round"}
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
