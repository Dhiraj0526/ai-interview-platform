import React, { useEffect, useState, useRef } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

function Result({ assessment }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const evaluatedRef = useRef(false);

  useEffect(() => {
    // Only send if the assessment is truly finished (has endTime)
    if (!assessment.endTime) return;
    if (evaluatedRef.current) return;
    evaluatedRef.current = true;

    console.log("Sending Final Assessment Payload:", assessment);

    axios
      .post(`${API}/evaluate`, assessment)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error("Evaluation error:", err);
        setError("Failed to save or evaluate your assessment.");
      });
  }, [assessment]);

  if (error) return <div style={{ padding: '2rem', color: '#f85149' }}>{error}</div>;

  if (!data) {
    return (
      <div className="ui-loading" style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>
        <div style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Finalizing Assessment...</div>
        <div style={{ color: '#58a6ff' }}>AI is analyzing your coding patterns and interview answers.</div>
      </div>
    );
  }

  return (
    <div className="result" style={{ padding: '2rem', background: '#0d1117', color: '#c9d1d9', borderRadius: '8px', textAlign: 'center' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '2rem', borderBottom: '1px solid #30363d', paddingBottom: '1rem' }}>Assessment Complete</h2>
      
      <div style={{ background: '#161b22', padding: '3rem', borderRadius: '8px', border: '1px solid #30363d', marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.5rem', color: '#58a6ff', marginBottom: '1rem' }}>Thank you for completing the interview!</h3>
        <p style={{ fontSize: '1.1rem', color: '#8b949e', lineHeight: '1.6', maxWidth: '600px', margin: '0 auto' }}>
          Your responses and code have been successfully submitted.<br/> 
          The administration team will review your results and get back to you shortly.
        </p>
        <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
          <blockquote style={{ margin: 0, fontStyle: 'italic', color: '#c9d1d9', borderLeft: '4px solid #58a6ff', paddingLeft: '1rem', textAlign: 'left', maxWidth: '500px' }}>
            "The only way to do great work is to love what you do."<br/>
            <span style={{ fontSize: '0.9rem', color: '#8b949e', display: 'block', marginTop: '0.5rem' }}>— Steve Jobs</span>
          </blockquote>
        </div>
      </div>

      <div style={{ marginTop: '3rem', textAlign: 'center' }}>
          <button 
            onClick={() => window.location.reload()}
            style={{ background: '#1f6feb', color: '#fff', border: 'none', padding: '0.8rem 2rem', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}
          >
            Retake Assessment
          </button>
      </div>
    </div>
  );
}

export default Result;
