import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
const INTERVIEW_TOTAL_SECONDS = 10 * 60;

function formatTimer(seconds) {
  const safe = Math.max(0, seconds);
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function Interview({
  questions: persistentQuestions,
  resumeText,
  stateSnapshot,
  onStateChange,
  onQuestionsFetched,
  onComplete,
}) {
  const videoRef = useRef(null);
  const snapshot = stateSnapshot || {};
  const [questions, setQuestions] = useState(persistentQuestions || []);
  const [index, setIndex] = useState(snapshot.index ?? 0);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState(snapshot.transcript ?? "");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [feedback, setFeedback] = useState(snapshot.feedback ?? "");
  const [allAnswers, setAllAnswers] = useState(snapshot.allAnswers || []);
  const [timeLeft, setTimeLeft] = useState(
    snapshot.timeLeft ?? INTERVIEW_TOTAL_SECONDS
  );
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const finishedRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        index,
        transcript,
        feedback,
        allAnswers,
        timeLeft,
      });
    }
  }, [index, transcript, feedback, allAnswers, timeLeft]);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let currentTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (err) => console.error("Speech Recognition Error:", err);
      recognition.onend = () => {
        if (isListeningRef.current && !finishedRef.current) recognition.start();
      };
      recognitionRef.current = recognition;
    }
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => console.error("Media Error:", err));

    if (persistentQuestions && persistentQuestions.length > 0) {
      setLoading(false);
      if (persistentQuestions[index]) {
        speak(persistentQuestions[index]);
      }
    } else {
      axios.post(`${API}/interview`, { resumeText }).then((res) => {
        setQuestions(res.data.data);
        if (onQuestionsFetched) onQuestionsFetched(res.data.data);
        setLoading(false);
        const startIndex = Math.min(index, Math.max(res.data.data.length - 1, 0));
        if (res.data.data[startIndex]) speak(res.data.data[startIndex]);
      }).catch(err => {
        console.error("Fetch interview questions error:", err);
        setLoading(false);
      });
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
      window.speechSynthesis.cancel();
      const stream = videoRef.current?.srcObject;
      if (stream && typeof stream.getTracks === "function") {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [persistentQuestions, onQuestionsFetched]);

  useEffect(() => {
    if (timeLeft === 0 && !finishedRef.current) {
      finishInterview(true);
    }
  }, [timeLeft]);

  const toggleListening = async () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      
      // Fetch Real-time Feedback from Groq
      if (transcript.length > 5) {
        try {
          const res = await axios.post(`${API}/interview/feedback`, {
            question: questions[index],
            transcript: transcript
          });
          setFeedback(res.data.feedback);
          speak(res.data.feedback);
        } catch (err) {
          console.error("Feedback error:", err);
        }
      }
    } else {
      setTranscript("");
      setFeedback("");
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };


  const speak = (text) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*_`#]/g, "");
    const speech = new SpeechSynthesisUtterance(cleanText);
    
    // Choose voice for robot tone
    const voices = window.speechSynthesis.getVoices();
    const roboticVoice = voices.find(v => 
      v.name.includes("Google US English") || 
      v.name.includes("Zira") || 
      v.name.includes("Natural") || 
      v.lang.startsWith("en-")
    );
    if (roboticVoice) speech.voice = roboticVoice;
    
    speech.pitch = 0.5; // monotone classic robotic voice tone
    speech.rate = 0.85;  // steady clear pacing
    
    speech.onstart = () => setIsSpeaking(true);
    speech.onend = () => setIsSpeaking(false);
    speech.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(speech);
  };

  const stopLiveInputs = () => {
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
    window.speechSynthesis.cancel();
  };

  const finishInterview = (includeCurrentAnswer, baseAnswers = allAnswers) => {
    if (finishedRef.current) return;
    stopLiveInputs();

    let finalAnswers = baseAnswers;
    if (includeCurrentAnswer && questions[index]) {
      const words = (transcript || "").trim().split(/\s+/).filter(Boolean).length;
      let scoreOutOf5 = 0;
      if (words >= 60) scoreOutOf5 = 5;
      else if (words >= 35) scoreOutOf5 = 4;
      else if (words >= 20) scoreOutOf5 = 3;
      else if (words >= 10) scoreOutOf5 = 2;
      else if (words >= 3) scoreOutOf5 = 1;

      finalAnswers = [
        ...baseAnswers,
        {
          question: questions[index],
          answer: transcript,
          feedback: feedback,
          scoreOutOf5,
        },
      ];
      setAllAnswers(finalAnswers);
    }

    const totalQuestions = Math.max(finalAnswers.length, 1);
    const sumOutOf5 = finalAnswers.reduce(
      (acc, ans) => acc + (typeof ans.scoreOutOf5 === "number" ? ans.scoreOutOf5 : 0),
      0
    );
    const scaledOutOf10 = Math.round((sumOutOf5 / totalQuestions) * 2);

    if (onComplete) {
      onComplete(finalAnswers, scaledOutOf10);
    }
  };

  const nextQuestion = () => {
    const wordCount = (transcript || "").trim().split(/\s+/).filter(Boolean).length;
    let scoreOutOf5 = 0;
    if (wordCount >= 60) scoreOutOf5 = 5;
    else if (wordCount >= 35) scoreOutOf5 = 4;
    else if (wordCount >= 20) scoreOutOf5 = 3;
    else if (wordCount >= 10) scoreOutOf5 = 2;
    else if (wordCount >= 3) scoreOutOf5 = 1;

    const currentEntry = {
      question: questions[index],
      answer: transcript,
      feedback: feedback,
      scoreOutOf5,
    };
    const updatedAnswers = [...allAnswers, currentEntry];
    setAllAnswers(updatedAnswers);

    if (index < questions.length - 1) {
      const newIndex = index + 1;
      setIndex(newIndex);
      setTranscript("");
      setFeedback("");
      speak(questions[newIndex]);
    } else {
      finishInterview(false, updatedAnswers);
    }
  };


  const currentQ = questions[index];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', background: '#0d1117', color: '#c9d1d9', padding: '1rem' }}>
      
      <div style={{ display: 'flex', flex: 1, gap: '2rem', alignItems: 'stretch' }}>
        
        {/* BIG VIDEO PANEL */}
        <div style={{ flex: 1.5, position: 'relative', background: '#000', borderRadius: '12px', overflow: 'hidden', border: '2px solid #30363d', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: '#f85149', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px' }}>
             <span style={{ width: '8px', height: '8px', background: '#fff', borderRadius: '50%', display: 'inline-block' }}></span> LIVE
          </div>
          <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: timeLeft <= 60 ? '#f85149' : 'rgba(13, 17, 23, 0.9)', color: '#fff', padding: '0.35rem 0.8rem', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 'bold', zIndex: 10, border: '1px solid #30363d' }}>
             ⏳ {formatTimer(timeLeft)}
          </div>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            autoPlay
            playsInline
            muted
            disablePictureInPicture={true}
          />
          <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', background: 'rgba(0,0,0,0.6)', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.9rem', backdropFilter: 'blur(4px)' }}>
             Candidate View
          </div>
        </div>

        {/* NEW ROBO & QUESTION PANEL */}
        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', background: '#161b22', borderRadius: '12px', border: '1px solid #30363d', overflow: 'hidden' }}>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '2rem', position: 'relative' }}>
            
             {/* ROBO AVATAR */}
             <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div 
                  className={isSpeaking ? "robo-avatar speaking" : "robo-avatar idle"}
                  style={{ 
                    width: '100px', 
                    height: '100px', 
                    borderRadius: '50%', 
                    background: '#0d1117', 
                    border: '2px solid #58a6ff', 
                    overflow: 'hidden', 
                    flexShrink: 0, 
                    boxShadow: '0 0 20px rgba(88, 166, 255, 0.2)',
                    transition: 'all 0.3s ease'
                  }}
                >
                   <img src="/robot.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Robo" />
                </div>
                <div style={{ flex: 1 }}>
                   <span style={{ color: '#58a6ff', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                     AI Interviewer
                   </span>
                   {isSpeaking && (
                     <div style={{ display: 'flex', gap: '3px', alignItems: 'center', marginTop: '4px' }}>
                       <div className="audio-bar" style={{ animationDelay: '0.1s' }}></div>
                       <div className="audio-bar" style={{ animationDelay: '0.3s' }}></div>
                       <div className="audio-bar" style={{ animationDelay: '0.5s' }}></div>
                       <div className="audio-bar" style={{ animationDelay: '0.2s' }}></div>
                       <div className="audio-bar" style={{ animationDelay: '0.4s' }}></div>
                       <span style={{ fontSize: '0.8rem', color: '#3fb950', marginLeft: '6px', fontWeight: '500' }}>Speaking...</span>
                     </div>
                   )}
                   <p style={{ margin: '0.5rem 0 0', fontSize: '1.1rem', color: '#fff', fontStyle: 'italic', lineHeight: '1.4' }}>
                      "{loading ? "Wait a second, let me check the files..." : currentQ}"
                   </p>
                   {feedback && (
                     <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'rgba(88, 166, 255, 0.1)', borderRadius: '8px', borderLeft: '3px solid #58a6ff', animation: 'fadeIn 0.5s ease-out' }}>
                        <span style={{ fontSize: '0.8rem', color: '#58a6ff', fontWeight: 'bold' }}>FEEDBACK:</span>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', color: '#e6edf3' }}>{feedback}</p>
                     </div>
                   )}
                </div>
             </div>

            {/* TRANSCRIPTION BUBBLE (STT) */}
            <div style={{ flex: 1, background: '#0d1117', borderRadius: '12px', border: '1px solid #30363d', padding: '1.5rem', position: 'relative', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                   <span style={{ color: '#8b949e', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Candidate's Response</span>
                   {isListening && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                         <div className="pulse-red" style={{ width: '8px', height: '8px', background: '#f85149', borderRadius: '50%' }}></div>
                         <span style={{ color: '#f85149', fontSize: '0.75rem', fontWeight: 'bold' }}>Listening...</span>
                      </div>
                   )}
                </div>
                <p style={{ margin: 0, fontSize: '1rem', color: transcript ? '#e6edf3' : '#484f58', lineHeight: '1.6' }}>
                   {transcript || (isListening ? "(Silence...)" : "Press 'Start Response' and speak into your mic.")}
                </p>
            </div>

          </div>

          <div style={{ padding: '1.5rem 2rem', background: '#0d1117', display: 'flex', gap: '1rem', borderTop: '1px solid #30363d' }}>
            <button
              onClick={toggleListening}
              disabled={timeLeft === 0 || loading}
              style={{ flex: 1, padding: '1rem', background: isListening ? '#f85149' : '#238636', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
            >
              {isListening ? "Stop Response" : "Start Response"}
            </button>
            <button
              onClick={nextQuestion}
              disabled={loading || !questions.length || timeLeft === 0}
              style={{ flex: 1, padding: '1rem', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
            >
              {index >= questions.length - 1 ? "Finish Assessment →" : "Next Question"}
            </button>
          </div>
        </div>

      </div>

      <div style={{ marginTop: '1.5rem', textAlign: 'center', color: '#8b949e', fontSize: '0.85rem' }}>
          Tip: Speak clearly into your microphone. The AI is listening for content and tone.
      </div>

      <style>{`
        @keyframes pulse-red {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(248, 81, 73, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(248, 81, 73, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(248, 81, 73, 0); }
        }
        .pulse-red {
          animation: pulse-red 2s infinite;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .robo-avatar.idle {
          /* completely static */
        }
        .robo-avatar.speaking {
          border-color: #3fb950 !important;
          box-shadow: 0 0 25px rgba(63, 185, 80, 0.5) !important;
        }
        
        @keyframes bounce-bar {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
        .audio-bar {
          width: 3px;
          height: 4px;
          background: #3fb950;
          border-radius: 2px;
          animation: bounce-bar 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default Interview;
