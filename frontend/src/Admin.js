import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

function Admin() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [creds, setCreds] = useState({ id: "", pass: "" });
  
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  // States for clearing data
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearCreds, setClearCreds] = useState({ id: "", pass: "" });

  // States for filtering and sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [cutoffScore, setCutoffScore] = useState("");

  // States for uploaded candidates viewer
  const [candidates, setCandidates] = useState([]);
  const [showCandidatesModal, setShowCandidatesModal] = useState(false);
  const [candidatesSearchQuery, setCandidatesSearchQuery] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const handleViewCandidates = async () => {
    setShowCandidatesModal(true);
    setLoadingCandidates(true);
    try {
      const res = await axios.get(`${API}/admin/candidates`);
      setCandidates(res.data);
    } catch (err) {
      alert("Failed to load candidates: " + (err.response?.data?.error || err.message));
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (creds.id === "admin123" && creds.pass === "1234567890") {
      setIsLoggedIn(true);
      fetchResults();
    } else {
      alert("Invalid ID or Password");
    }
  };

  const fetchResults = () => {
    setLoading(true);
    axios.get(`${API}/admin/results`)
      .then(res => {
        setResults(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const handleClearData = async (e) => {
    e.preventDefault();
    if (clearCreds.id === "admin123" && clearCreds.pass === "1234567890") {
      if (window.confirm("ARE YOU ABSOLUTELY SURE? This will delete all database records and the Excel file forever.")) {
        try {
          await axios.delete(`${API}/admin/clear`, { data: clearCreds });
          alert("All data cleared successfully.");
          setResults([]);
          setShowClearConfirm(false);
          setClearCreds({ id: "", pass: "" });
        } catch (err) {
          alert("Error clearing data: " + (err.response?.data?.error || err.message));
        }
      }
    } else {
      alert("Invalid Credentials for clearing data.");
    }
  };

  const downloadExcel = () => {
    window.open(`${API}/admin/download-excel`, "_blank");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
      try {
        const res = await axios.post(`${API}/admin/upload-candidates`, { fileBase64: base64 });
        alert(res.data.message);
      } catch (err) {
        alert("Upload failed: " + (err.response?.data?.error || err.message));
      } finally {
        setUploading(false);
        e.target.value = null; // reset
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0d1117' }}>
        <form onSubmit={handleLogin} style={{ background: '#161b22', padding: '3rem', borderRadius: '12px', border: '1px solid #30363d', width: '400px', textAlign: 'center' }}>
          <h2 style={{ color: '#58a6ff', marginBottom: '2rem' }}>Admin Secure Access</h2>
          <input 
            type="text" 
            placeholder="Admin ID" 
            value={creds.id}
            onChange={(e) => setCreds({ ...creds, id: e.target.value })}
            style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '4px' }}
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={creds.pass}
            onChange={(e) => setCreds({ ...creds, pass: e.target.value })}
            style={{ width: '100%', padding: '0.8rem', marginBottom: '2rem', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '4px' }}
          />
          <button type="submit" style={{ width: '100%', padding: '1rem', background: '#238636', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            Enter Dashboard
          </button>
        </form>
      </div>
    );
  }

  const filteredResults = results
    .filter(r => 
      (r.userName && r.userName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.rollNumber && r.rollNumber.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .filter(r => {
      if (cutoffScore === "") return true;
      const total = (r.aptitudeScore || 0) + (r.codingScore || 0) + (r.interviewScore || 0);
      return total >= Number(cutoffScore);
    })
    .sort((a, b) => {
      if (!sortOrder) return 0;
      const totalA = (a.aptitudeScore || 0) + (a.codingScore || 0) + (a.interviewScore || 0);
      const totalB = (b.aptitudeScore || 0) + (b.codingScore || 0) + (b.interviewScore || 0);
      return sortOrder === "asc" ? totalA - totalB : totalB - totalA;
    });

  return (
    <div style={{ padding: '2rem', background: '#0d1117', minHeight: '100vh', color: '#c9d1d9' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #30363d', paddingBottom: '1rem' }}>
        <div>
           <h1 style={{ margin: 0 }}>Master Candidate Dashboard</h1>
           <p style={{ margin: '0.5rem 0 0', color: '#8b949e', fontSize: '0.9rem' }}>Secure Results for Academic Assessment</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => setShowClearConfirm(true)}
            style={{ background: 'transparent', color: '#f85149', border: '1px solid #f85149', padding: '0.75rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Clear All Data
          </button>
          <button 
            onClick={downloadExcel}
            style={{ background: '#238636', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Download Master Excel
          </button>
          <button 
            onClick={handleViewCandidates}
            style={{ background: '#8a63d2', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Check Uploaded Candidates
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ background: '#1f6feb', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '6px', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            {uploading ? "Uploading..." : "Upload Candidates"}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".xlsx, .xls" 
            style={{ display: 'none' }} 
          />
        </div>
      </header>

      {/* FILTER AND SEARCH CONTROLS */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <input 
          type="text" 
          placeholder="Search by Name or Roll Number..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, padding: '0.8rem', background: '#161b22', border: '1px solid #30363d', color: '#fff', borderRadius: '6px' }}
        />
        <input 
          type="number" 
          placeholder="Min Total Score (Cutoff)" 
          value={cutoffScore}
          onChange={(e) => setCutoffScore(e.target.value)}
          style={{ padding: '0.8rem', background: '#161b22', border: '1px solid #30363d', color: '#fff', borderRadius: '6px', width: '220px' }}
        />
        <select 
          value={sortOrder} 
          onChange={(e) => setSortOrder(e.target.value)}
          style={{ padding: '0.8rem', background: '#161b22', border: '1px solid #30363d', color: '#fff', borderRadius: '6px' }}
        >
          <option value="">Sort by Total Score: Default</option>
          <option value="desc">Total Score: High to Low</option>
          <option value="asc">Total Score: Low to High</option>
        </select>
      </div>

      {/* CLEAR CONFIRMATION MODAL */}
      {showClearConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
           <form onSubmit={handleClearData} style={{ background: '#161b22', padding: '2rem', borderRadius: '12px', border: '1px solid #f85149', width: '350px', textAlign: 'center' }}>
              <h3 style={{ color: '#f85149', marginBottom: '1rem' }}>Danger Zone</h3>
              <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem', color: '#8b949e' }}>Enter Admin Credentials to confirm total data reset.</p>
              <input 
                type="text" 
                placeholder="Admin ID" 
                value={clearCreds.id}
                onChange={(e) => setClearCreds({ ...clearCreds, id: e.target.value })}
                style={{ width: '100%', padding: '0.7rem', marginBottom: '0.75rem', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '4px' }}
              />
              <input 
                type="password" 
                placeholder="Password" 
                value={clearCreds.pass}
                onChange={(e) => setClearCreds({ ...clearCreds, pass: e.target.value })}
                style={{ width: '100%', padding: '0.7rem', marginBottom: '1.5rem', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '4px' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                 <button type="submit" style={{ flex: 1, padding: '0.7rem', background: '#da3633', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>CLEAR ALL</button>
                 <button type="button" onClick={() => setShowClearConfirm(false)} style={{ flex: 1, padding: '0.7rem', background: '#30363d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              </div>
           </form>
         </div>
      )}
      {/* UPLOADED CANDIDATES VIEWER MODAL */}
      {showCandidatesModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
          <div style={{ background: '#161b22', padding: '2rem', borderRadius: '12px', border: '1px solid #30363d', width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: '#58a6ff', margin: 0 }}>Uploaded Authorized Candidates</h2>
              <button 
                onClick={() => { setShowCandidatesModal(false); setCandidatesSearchQuery(""); }}
                style={{ background: '#da3633', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Close
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <input 
                type="text" 
                placeholder="Search candidates by Name or Roll Number..." 
                value={candidatesSearchQuery}
                onChange={(e) => setCandidatesSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '0.8rem', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '6px' }}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #30363d', borderRadius: '6px' }}>
              {loadingCandidates ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>Loading candidates...</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#21262d', color: '#c9d1d9' }}>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid #30363d' }}>S.No</th>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid #30363d' }}>Name</th>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid #30363d' }}>Roll Number</th>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid #30363d' }}>Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates
                      .filter(c => 
                        (c.name && c.name.toLowerCase().includes(candidatesSearchQuery.toLowerCase())) ||
                        (c.rollNumber && c.rollNumber.toLowerCase().includes(candidatesSearchQuery.toLowerCase()))
                      )
                      .map((c, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '0.75rem', color: '#8b949e' }}>{idx + 1}</td>
                          <td style={{ padding: '0.75rem', color: '#f0f6fc', fontWeight: 'bold' }}>{c.name}</td>
                          <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#c9d1d9' }}>{c.rollNumber}</td>
                          <td style={{ padding: '0.75rem', color: '#8b949e' }}>{c.password}</td>
                        </tr>
                      ))}
                    {candidates.filter(c => 
                      (c.name && c.name.toLowerCase().includes(candidatesSearchQuery.toLowerCase())) ||
                      (c.rollNumber && c.rollNumber.toLowerCase().includes(candidatesSearchQuery.toLowerCase()))
                    ).length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>No matching candidates found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#161b22', borderRadius: '8px', overflow: 'hidden', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#21262d', textAlign: 'left' }}>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d' }}>S.No</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d' }}>Candidate Name</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d' }}>Roll Number</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d' }}>Date</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d' }}>Aptitude</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d' }}>Coding</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d' }}>Start Time</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d' }}>End Time</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d', textAlign: 'center' }}>Interview Score</th>
              <th style={{ padding: '1rem', borderBottom: '1px solid #30363d', textAlign: 'center' }}>Total Score</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
               <tr><td colSpan="8" style={{ padding: '3rem', textAlign: 'center' }}>Loading results...</td></tr>
            ) : filteredResults.map((r, index) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #30363d', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#1b2128'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '1rem', color: '#8b949e', fontWeight: 'bold' }}>{index + 1}</td>
                <td style={{ padding: '1rem', fontWeight: 'bold', color: '#f0f6fc' }}>{r.userName || "N/A"}</td>
                <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{r.rollNumber || "N/A"}</td>
                <td style={{ padding: '1rem', fontSize: '0.8rem' }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "N/A"}</td>
                <td style={{ padding: '1rem' }}>{r.aptitudeScore} / 10</td>
                <td style={{ padding: '1rem' }}>{r.codingScore} / {r.codingMaxScore}</td>
                <td style={{ padding: '1rem', fontSize: '0.8rem' }}>{r.startTime ? new Date(r.startTime).toLocaleTimeString() : "N/A"}</td>
                <td style={{ padding: '1rem', fontSize: '0.8rem' }}>{r.endTime ? new Date(r.endTime).toLocaleTimeString() : "N/A"}</td>
                <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: '#3fb950' }}>{r.interviewScore}/10</td>
                <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold', color: '#e3b341' }}>{(r.aptitudeScore || 0) + (r.codingScore || 0) + (r.interviewScore || 0)}/50</td>
              </tr>
            ))}
            {!loading && filteredResults.length === 0 && (
              <tr>
                <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>No matching results found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Admin;
