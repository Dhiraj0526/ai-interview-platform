import React, { useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

function Registration({ onComplete }) {
  const [name, setName] = useState("");
  const [roll, setRoll] = useState("");
  const [password, setPassword] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== "application/pdf") {
        setError("Only PDF resumes are accepted.");
        setResumeFile(null);
      } else if (file.size > 5 * 1024 * 1024) {
        setError("File size exceeds the 5MB limit.");
        setResumeFile(null);
      } else {
        setError("");
        setResumeFile(file);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !roll.trim() || !password.trim()) {
      setError("Please enter Name, Roll Number, and Password.");
      return;
    }
    if (!resumeFile) {
      setError("Resume upload is mandatory. You cannot proceed without uploading your PDF resume.");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("rollNumber", roll.trim());
    formData.append("password", password.trim());
    formData.append("resume", resumeFile);

    try {
      const response = await axios.post(`${API}/verify-candidate`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      
      if (response.data.authorized) {
        onComplete({ 
          userName: name.trim(), 
          rollNumber: roll.trim(), 
          startTime: new Date().toISOString(),
          resumeText: response.data.resumeText
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || "Invalid Credentials or Not Authorized");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '3rem 2rem', textAlign: 'center', background: '#0d1117', color: '#c9d1d9', borderRadius: '12px', border: '1px solid #30363d', maxWidth: '500px', margin: '2rem auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.75rem', color: '#58a6ff', marginBottom: '0.5rem' }}>Candidate Registration</h2>
        <p style={{ color: '#8b949e', fontSize: '0.9rem' }}>Please provide your details and upload your resume to begin.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold', color: '#8b949e' }}>FULL NAME</label>
          <input
            type="text"
            placeholder="e.g. John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '0.8rem', color: '#fff', outline: 'none' }}
            required
          />
        </div>

        <div style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold', color: '#8b949e' }}>ROLL NUMBER / ID</label>
          <input
            type="text"
            placeholder="e.g. 2024CS101"
            value={roll}
            onChange={(e) => setRoll(e.target.value)}
            style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '0.8rem', color: '#fff', outline: 'none' }}
            required
          />
        </div>

        <div style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold', color: '#8b949e' }}>PASSWORD</label>
          <input
            type="password"
            placeholder="Enter your assigned password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '0.8rem', color: '#fff', outline: 'none' }}
            required
          />
        </div>

        <div style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 'bold', color: '#8b949e' }}>UPLOAD RESUME (PDF ONLY, MAX 5MB)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            style={{ width: '100%', background: '#161b22', border: '1px dashed #30363d', borderRadius: '6px', padding: '1rem', color: '#fff', outline: 'none', cursor: 'pointer' }}
            required
          />
          {resumeFile && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#3fb950' }}>
              ✓ Selected: {resumeFile.name} ({(resumeFile.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          )}
        </div>

        {error && (
          <div style={{ color: '#f85149', fontSize: '0.9rem', textAlign: 'left', padding: '0.5rem', background: 'rgba(248, 81, 73, 0.1)', borderRadius: '6px', border: '1px solid rgba(248, 81, 73, 0.4)' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: '1rem', padding: '1rem', background: loading ? '#30363d' : '#238636', color: '#fff', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
        >
          {loading ? "Verifying & Parsing..." : "Start Assessment →"}
        </button>
      </form>
      
      <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#484f58' }}>
        Note: Once you start, the timer will begin. Ensure a stable connection.
      </p>
    </div>
  );
}

export default Registration;
