import axios from "axios";
import React, { useState, useEffect } from "react";

const formatTime = (seconds) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

function Aptitude({ questions: persistentQuestions, onQuestionsFetched, onComplete, stateSnapshot, onStateChange }) {
  const [time, setTime] = useState(stateSnapshot?.time ?? 600);
  const [answers, setAnswers] = useState(stateSnapshot?.answers ?? {});
  const [questions, setQuestions] = useState(persistentQuestions || []);

  useEffect(() => {
    if (onStateChange) {
      onStateChange({ time, answers });
    }
  }, [time, answers, onStateChange]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime((t) => t - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (persistentQuestions && persistentQuestions.length > 0) return;

    axios.get(`${API}/aptitude`).then((res) => {
      try {
        const raw = res.data.data;
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        const finalData = Array.isArray(data) ? data : [];
        setQuestions(finalData);
        if (onQuestionsFetched) onQuestionsFetched(finalData);
      } catch {
        console.log("AI format issue, using fallback");
      }
    });
  }, [persistentQuestions, onQuestionsFetched]);

  const handleSelect = (i, opt) => {
    setAnswers({ ...answers, [i]: opt });
  };

  const handleSubmit = () => {
    if (questions.length === 0) return;
    let score = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.answer) score++;
    });
    
    // Scale score to /10 max for consistency
    const maxScore = 10;
    const finalScore = Math.round((score / questions.length) * maxScore);
    
    if (onComplete) {
      onComplete(finalScore);
    } else {
      alert(`Aptitude Score: ${finalScore}/10`);
    }
  };

  const urgent = time <= 60 && time > 0;
  const expired = time <= 0;

  return (
    <div className="aptitude">
      <div
        className="aptitude-timer"
        style={{
          borderColor: expired
            ? "var(--danger)"
            : urgent
              ? "var(--warning)"
              : "var(--border-strong)",
          background: expired
            ? "rgba(248, 113, 113, 0.12)"
            : urgent
              ? "rgba(251, 191, 36, 0.1)"
              : "var(--bg-elevated)",
        }}
      >
        <span className="aptitude-timer-label">Time remaining</span>
        <strong className="aptitude-timer-value">
          {expired ? "0:00" : formatTime(time)}
        </strong>
      </div>

      {questions.length === 0 ? (
        <div className="ui-loading" role="status">
          Loading questions…
        </div>
      ) : (
        <ul className="aptitude-list">
          {questions.map((q, i) => (
            <li key={i} className="aptitude-q ui-card">
              <p className="aptitude-q-text">
                <span className="aptitude-q-num">{i + 1}.</span> {q.question}
              </p>
              <div className="aptitude-options">
                {q.options.map((opt, idx) => {
                  const selected = answers[i] === opt;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={
                        "aptitude-opt" + (selected ? " aptitude-opt--on" : "")
                      }
                      onClick={() => handleSelect(i, opt)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      {questions.length > 0 && (
        <div className="aptitude-actions">
          <button type="button" className="ui-btn" onClick={handleSubmit}>
            Submit answers
          </button>
        </div>
      )}
    </div>
  );
}

export default Aptitude;
