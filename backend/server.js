require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { spawn } = require("child_process");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const XLSX = require("xlsx");
const { initDB, Assessment, AuthorizedCandidate } = require('./database');
const Groq = require("groq-sdk");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

class AsyncQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await task()); } catch (e) { reject(e); }
      });
      this.next();
    });
  }
  next() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    this.running++;
    const task = this.queue.shift();
    task().finally(() => {
      this.running--;
      this.next();
    });
  }
}

const aiQueue = new AsyncQueue(50); // 50 concurrent AI requests
const excelQueue = new AsyncQueue(1); // Serialized Excel writing
const execQueue = new AsyncQueue(10); // Throttle local OS processes

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });


const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const APTITUDE_SESSION_COUNT = 10;
const INTERVIEW_SESSION_COUNT = 5;

function shuffleInPlaceArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandomMCQs(bank, n) {
  const copy = bank.map((q) => ({ ...q, options: [...q.options] }));
  shuffleInPlaceArray(copy);
  return copy.slice(0, Math.min(n, copy.length)).map((q) => {
    const opts = [...q.options];
    shuffleInPlaceArray(opts);
    return { ...q, options: opts };
  });
}

function pickRandomStrings(bank, n) {
  const copy = [...bank];
  shuffleInPlaceArray(copy);
  return copy.slice(0, Math.min(n, copy.length));
}

function pickRandomObjects(bank, n) {
  const copy = bank.map((o) => ({ ...o }));
  shuffleInPlaceArray(copy);
  return copy.slice(0, Math.min(n, copy.length));
}

function scoreInterviewAnswerOutOf5(answerText) {
  const text = String(answerText || "").trim();
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;

  let score = 0;
  if (words >= 80) score = 4.5;
  else if (words >= 55) score = 4;
  else if (words >= 35) score = 3.5;
  else if (words >= 22) score = 3;
  else if (words >= 12) score = 2;
  else if (words >= 5) score = 1;

  const qualityTokens = [
    "example",
    "because",
    "learned",
    "result",
    "improved",
    "team",
    "challenge",
  ];
  const lower = text.toLowerCase();
  const qualityHits = qualityTokens.reduce(
    (acc, token) => acc + (lower.includes(token) ? 1 : 0),
    0
  );
  if (qualityHits >= 2) score += 0.5;

  return Math.max(0, Math.min(5, Number(score.toFixed(1))));
}

function evaluateInterviewRound(interviewAnswers) {
  const list = Array.isArray(interviewAnswers) ? interviewAnswers : [];
  if (!list.length) {
    return { scoredAnswers: [], interviewScoreOutOf10: 0 };
  }

  const scoredAnswers = list.map((item) => {
    const scoreOutOf5 =
      typeof item?.scoreOutOf5 === "number"
        ? Math.max(0, Math.min(5, item.scoreOutOf5))
        : scoreInterviewAnswerOutOf5(item?.answer);
    return { ...item, scoreOutOf5 };
  });

  const avgOutOf5 =
    scoredAnswers.reduce((acc, a) => acc + (a.scoreOutOf5 || 0), 0) /
    scoredAnswers.length;
  const interviewScoreOutOf10 = Number((avgOutOf5 * 2).toFixed(1));

  return { scoredAnswers, interviewScoreOutOf10 };
}

const APTITUDE_QUESTION_BANK = [
  // S1
  { question: "What is the unit digit of 3^4?", options: ["1", "3", "7", "9"], answer: "1" }, // Number System
  { question: "What is the prime factorization of 60?", options: ["2^2 x 3 x 5", "2 x 3^2 x 5", "3 x 4 x 5", "2 x 3 x 10"], answer: "2^2 x 3 x 5" }, // Prime Factorization
  { question: "Which of the following fractions is the largest?", options: ["1/2", "3/4", "2/3", "4/5"], answer: "4/5" }, // Fractions
  { question: "What is the square root of 144?", options: ["10", "12", "14", "16"], answer: "12" }, // Roots
  { question: "What is the LCM of 12 and 15?", options: ["30", "45", "60", "90"], answer: "60" }, // LCM & HCF
  
  // S2
  { question: "What is 20% of 150?", options: ["20", "25", "30", "35"], answer: "30" }, // Percentage
  { question: "If a pen is bought for $10 and sold for $12, what is the profit percentage?", options: ["10%", "15%", "20%", "25%"], answer: "20%" }, // Profit & Loss
  { question: "What is the simple interest on $1000 at 5% per annum for 2 years?", options: ["$50", "$100", "$150", "$200"], answer: "$100" }, // SI & CI
  { question: "What is the average of 10, 20, 30, 40, and 50?", options: ["20", "30", "40", "50"], answer: "30" }, // Average
  { question: "If the ratio of boys to girls is 3:2 and there are 30 boys, how many girls are there?", options: ["10", "15", "20", "25"], answer: "20" }, // Ratios
  { question: "The sum of ages of a father and son is 50. If the father is 30 years older than the son, how old is the son?", options: ["10", "15", "20", "25"], answer: "10" }, // Ages
  { question: "A and B invest in a business in the ratio 3:2. If total profit is $500, what is B's share?", options: ["$100", "$200", "$300", "$400"], answer: "$200" }, // Partnership
  { question: "If 5 men can complete a work in 10 days, how many days will 10 men take?", options: ["2", "5", "10", "12"], answer: "5" }, // Time & Work
  { question: "A train running at 60 km/h crosses a pole in 9 seconds. What is the length of the train (in meters)?", options: ["100m", "150m", "200m", "250m"], answer: "150m" }, // Time & Distance
  { question: "In a 40L mixture, milk and water are 3:1. How much water is in the mixture?", options: ["10L", "20L", "30L", "40L"], answer: "10L" }, // Mixtures
  { question: "If A is the brother of B, and B is the sister of C, how is A related to C?", options: ["Brother", "Sister", "Cousin", "Cannot be determined"], answer: "Brother" }, // Blood Relations
  { question: "A person goes North, turns right, then turns right again. Which direction is he facing?", options: ["North", "South", "East", "West"], answer: "South" }, // Directions
  { question: "What is the angle between hands of a clock at 3:00?", options: ["60 degrees", "90 degrees", "120 degrees", "180 degrees"], answer: "90 degrees" }, // Clocks
  { question: "If today is Monday, what day will it be after 15 days?", options: ["Monday", "Tuesday", "Wednesday", "Thursday"], answer: "Tuesday" }, // Calendars

  // S3
  { question: "If CAT is coded as 3-1-20, how is DOG coded?", options: ["4-15-7", "5-16-8", "3-14-6", "4-14-7"], answer: "4-15-7" }, // Coding & Decoding
  { question: "What is the next number in the series: 2, 4, 8, 16, ...?", options: ["20", "24", "32", "64"], answer: "32" }, // Series & Sequence
  { question: "Which relates to: Dogs, Pets, Animals?", options: ["Intersecting circles", "One inside other", "Dogs inside Pets inside Animals", "Disjoint circles"], answer: "Dogs inside Pets inside Animals" }, // Venn Diagrams
  { question: "A, B, C, D sit in a row. A is next to B, C is next to D. If A is at the left end, who is at the right end?", options: ["B", "C", "C or D", "D"], answer: "C or D" } // Arrangement
];

const INTERVIEW_QUESTION_POOL = [
  "Tell me about yourself.", "What are your greatest strengths?", "Why should we hire you?", "Describe a challenging project.",
  "How do you handle deadlines?", "Where do you see yourself in five years?", "Why are you interested in this role?"
];

const CODING_FALLBACK_BANK = [
  { title: "Easy: Reverse Integer", description: "Given an integer N, reverse its digits. If N is negative, the reversed result should also be negative.", testCases: [{ input: "123", expectedOutput: "321" }, { input: "-456", expectedOutput: "-654" }, { input: "1000", expectedOutput: "1" }, { input: "0", expectedOutput: "0" }, { input: "7", expectedOutput: "7" }, { input: "-1", expectedOutput: "-1" }, { input: "123456789", expectedOutput: "987654321" }, { input: "42", expectedOutput: "24" }, { input: "-90", expectedOutput: "-9" }, { input: "101", expectedOutput: "101" }] },
  { title: "Medium: Count Trailing Zeroes", description: "Given an integer N, calculate the number of trailing zeroes in the decimal representation of N!. (Hint: count factors of 5).", testCases: [{ input: "5", expectedOutput: "1" }, { input: "10", expectedOutput: "2" }, { input: "25", expectedOutput: "6" }, { input: "100", expectedOutput: "24" }, { input: "0", expectedOutput: "0" }, { input: "1", expectedOutput: "0" }, { input: "125", expectedOutput: "31" }, { input: "4", expectedOutput: "0" }, { input: "12", expectedOutput: "2" }, { input: "50", expectedOutput: "12" }] },
  { title: "Hard: Smallest Multiple with 0 and 1", description: "Find the smallest positive integer X that is a multiple of N and contains only digits 0 and 1.", testCases: [{ input: "2", expectedOutput: "10" }, { input: "3", expectedOutput: "111" }, { input: "7", expectedOutput: "1001" }, { input: "9", expectedOutput: "111111111" }, { input: "1", expectedOutput: "1" }, { input: "4", expectedOutput: "100" }, { input: "5", expectedOutput: "10" }, { input: "10", expectedOutput: "10" }, { input: "6", expectedOutput: "1110" }, { input: "8", expectedOutput: "1000" }] },
  { title: "Easy: Palindrome Number", description: "Given an integer N, print true if it is a palindrome number, otherwise false.", testCases: [{ input: "121", expectedOutput: "true" }, { input: "123", expectedOutput: "false" }, { input: "7", expectedOutput: "true" }, { input: "10", expectedOutput: "false" }, { input: "1221", expectedOutput: "true" }, { input: "1001", expectedOutput: "true" }, { input: "99", expectedOutput: "true" }, { input: "909", expectedOutput: "true" }, { input: "1010", expectedOutput: "false" }, { input: "0", expectedOutput: "true" }] },
  { title: "Medium: Sum of Subarray Minimums (Small N)", description: "Given an array of up to 25 integers, compute the sum of minimum values of all subarrays.", testCases: [{ input: "3 1 2 4", expectedOutput: "17" }, { input: "11 81 94 43 3", expectedOutput: "444" }, { input: "1", expectedOutput: "1" }, { input: "2 2", expectedOutput: "6" }, { input: "5 4 3 2 1", expectedOutput: "35" }, { input: "1 2 3", expectedOutput: "10" }, { input: "4 4 4", expectedOutput: "24" }, { input: "7 6", expectedOutput: "19" }, { input: "9 8 7", expectedOutput: "46" }, { input: "2 1 2", expectedOutput: "8" }] },
  { title: "Hard: K-th Symbol Grammar", description: "Given N and K, return the K-th symbol in N-th row of grammar sequence.", testCases: [{ input: "1 1", expectedOutput: "0" }, { input: "2 1", expectedOutput: "0" }, { input: "2 2", expectedOutput: "1" }, { input: "4 5", expectedOutput: "1" }, { input: "4 8", expectedOutput: "1" }, { input: "5 16", expectedOutput: "0" }, { input: "5 1", expectedOutput: "0" }, { input: "6 32", expectedOutput: "0" }, { input: "3 3", expectedOutput: "1" }, { input: "3 4", expectedOutput: "0" }] },
  { title: "Easy: Count Vowels", description: "Count vowels (a,e,i,o,u) in a line of text, case-insensitive.", testCases: [{ input: "hello", expectedOutput: "2" }, { input: "AEIOU", expectedOutput: "5" }, { input: "rhythm", expectedOutput: "0" }, { input: "Interview", expectedOutput: "3" }, { input: "coding round", expectedOutput: "4" }, { input: "a", expectedOutput: "1" }, { input: "bbb", expectedOutput: "0" }, { input: "Queue", expectedOutput: "4" }, { input: "sky", expectedOutput: "0" }, { input: "Education", expectedOutput: "5" }] },
  { title: "Medium: Product of Array Except Self", description: "Given space-separated integers, output product array except self (without division).", testCases: [{ input: "1 2 3 4", expectedOutput: "24 12 8 6" }, { input: "2 3 4 5", expectedOutput: "60 40 30 24" }, { input: "1 1 1 1", expectedOutput: "1 1 1 1" }, { input: "3 0 2", expectedOutput: "0 6 0" }, { input: "0 0 4", expectedOutput: "0 0 0" }, { input: "5", expectedOutput: "1" }, { input: "9 2", expectedOutput: "2 9" }, { input: "10 10 10", expectedOutput: "100 100 100" }, { input: "8 1 2 3", expectedOutput: "6 48 24 16" }, { input: "4 5 1", expectedOutput: "5 4 20" }] },
  { title: "Hard: Longest Valid Parentheses", description: "Given a parentheses string, find the length of the longest valid (well-formed) substring.", testCases: [{ input: "(()", expectedOutput: "2" }, { input: ")()())", expectedOutput: "4" }, { input: "", expectedOutput: "0" }, { input: "()(())", expectedOutput: "6" }, { input: "(((((", expectedOutput: "0" }, { input: "()(()", expectedOutput: "2" }, { input: "((()))", expectedOutput: "6" }, { input: "())((())", expectedOutput: "4" }, { input: "()()()", expectedOutput: "6" }, { input: "(()())", expectedOutput: "6" }] }
];

let lastCodingFallbackSignature = "";

function getDifferentFallbackSet(count) {
  const maxTry = 10;
  for (let i = 0; i < maxTry; i++) {
    const chosen = pickRandomObjects(CODING_FALLBACK_BANK, count);
    const signature = chosen.map((q) => q.title).sort().join("|");
    if (signature !== lastCodingFallbackSignature || CODING_FALLBACK_BANK.length <= count) {
      lastCodingFallbackSignature = signature;
      return chosen;
    }
  }
  return pickRandomObjects(CODING_FALLBACK_BANK, count);
}

function updateExcelReport(assessment) {
  excelQueue.add(() => {
    return new Promise((resolve) => {
      try {
        const EXCEL_PATH = path.join(__dirname, "assessment_results.xlsx");
        let workbook;
        let worksheet;
        let data = [];
        
        if (fs.existsSync(EXCEL_PATH)) {
          workbook = XLSX.readFile(EXCEL_PATH);
          worksheet = workbook.Sheets[workbook.SheetNames[0]];
          data = XLSX.utils.sheet_to_json(worksheet);
        } else {
          workbook = XLSX.utils.book_new();
        }

        const newRow = {
          "S.No": data.length + 1,
          "Candidate Name": assessment.userName || "N/A",
          "Roll Number": assessment.rollNumber || "N/A",
          "Date": new Date(assessment.createdAt).toLocaleDateString(),
          "Aptitude": assessment.aptitudeScore,
          "Coding": assessment.codingScore,
          "Start Time": assessment.startTime ? new Date(assessment.startTime).toLocaleTimeString() : "N/A",
          "End Time": assessment.endTime ? new Date(assessment.endTime).toLocaleTimeString() : "N/A",
          "Interview Score": assessment.interviewScore,
          "Total Score": (assessment.aptitudeScore || 0) + (assessment.codingScore || 0) + (assessment.interviewScore || 0)
        };

        data.push(newRow);
        const newSheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, newSheet, "Results", true);
        if (workbook.SheetNames.length > 1) {
          workbook.SheetNames = ["Results"];
          workbook.Sheets = { "Results": newSheet };
        }
        XLSX.writeFile(workbook, EXCEL_PATH);
      } catch (err) {
        console.error("Excel write error:", err);
      } finally {
        resolve();
      }
    });
  });
}

async function runCodeLocally(language, code, stdinText, timeoutMs = 5000) {
  return execQueue.add(() => new Promise(async (resolve) => {
    const rootTmp = os.tmpdir();
    const id = crypto.randomUUID().replace(/-/g, "");
    const workDir = path.join(rootTmp, `ai_eval_${id}`);
    await fsPromises.mkdir(workDir, { recursive: true });

    let cmd = ""; let args = []; let filePath = "";
    if (language === "python" || language === "python3") {
      filePath = path.join(workDir, "solution.py");
      cmd = "python"; args = ["-u", filePath];
    } else if (language === "java") {
      filePath = path.join(workDir, "Main.java");
      cmd = "java"; args = [filePath];
    } else {
      return resolve({ stdout: "", stderr: "Unsupported language", code: 1 });
    }

    try {
      await fsPromises.writeFile(filePath, code, "utf8");
      let stdout = ""; let stderr = "";
      const child = spawn(cmd, args, { cwd: workDir });

      child.on("error", (err) => {
        console.error(`[Local Runner] Spawn Error for ${cmd}:`, err.message);
        clearTimeout(timer);
        resolve({ stdout: "", stderr: `Execution environment error: ${err.message}. Please check if ${cmd} is installed.`, code: 1 });
      });

      child.stdin.on("error", (err) => {
        console.warn("[Local Runner] Child stdin write error (EPIPE):", err.message);
      });

      let timer = setTimeout(() => { 
        child.kill("SIGKILL"); 
        resolve({ stdout, stderr: "Timed Out", code: 1 }); 
      }, timeoutMs);

      if (stdinText) { 
        child.stdin.write(String(stdinText)); 
        if (!String(stdinText).endsWith("\n")) child.stdin.write("\n");
      }
      child.stdin.end();
      
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      
      child.on("close", async (exitCode) => {
        clearTimeout(timer);
        try { await fsPromises.rm(workDir, { recursive: true, force: true }); } catch (e) {}
        resolve({ stdout: stdout.replace(/\r\n/g, "\n"), stderr: stderr.replace(/\r\n/g, "\n"), code: exitCode });
      });
      
      child.on("error", async (err) => {
        clearTimeout(timer);
        try { await fsPromises.rm(workDir, { recursive: true, force: true }); } catch (e) {}
        resolve({ stdout: "", stderr: err.message, code: 1 });
      });

    } catch (err) {
      resolve({ stdout: "", stderr: err.message, code: 1 });
    }
  }));
}

app.get("/aptitude", (req, res) => {
  res.json({ data: pickRandomMCQs(APTITUDE_QUESTION_BANK, APTITUDE_SESSION_COUNT) });
});

function generateLocalQuestionsFromResume(resumeText) {
  const text = resumeText.toLowerCase();
  const questions = [];

  // Find sentences/bullet points containing actions or technologies
  const sentences = resumeText
    .split(/[.!?\n•*;]/)
    .map(s => s.trim())
    .filter(s => s.length > 25 && s.length < 250);

  // 1. Projects and Achievements Parsing
  const projectIndicators = ["project", "developed", "built", "implemented", "created", "designed", "architected", "system", "led", "managed"];
  const projectSentences = sentences.filter(s => 
    projectIndicators.some(ind => s.toLowerCase().includes(ind))
  );

  if (projectSentences.length > 0) {
    const cleanProj1 = projectSentences[0].replace(/^[-\d\s•*+]+/, "");
    questions.push(`Can you walk me through the architecture of your project where you ${cleanProj1.charAt(0).toLowerCase() + cleanProj1.slice(1)}? What were your primary technical choices?`);
    
    if (projectSentences.length > 1) {
      const cleanProj2 = projectSentences[1].replace(/^[-\d\s•*+]+/, "");
      questions.push(`In your resume, you mention: "${cleanProj2}". What was the most complex engineering challenge you solved here, and how did you resolve it?`);
    }
  }

  // 2. Skill/Technology-specific Probe
  const techKeywords = {
    "react": "React.js frontend development, components lifecycle, or state management",
    "node": "Node.js, Express, asynchronous handlers, or RESTful API design",
    "python": "Python programming, backend scripts, or data handling pipelines",
    "javascript": "modern JavaScript (ES6+), event loops, promises, or async/await architecture",
    "typescript": "TypeScript compilation, type definitions, safety benefits, or design interfaces",
    "java": "Java platform development, multi-threading patterns, object-oriented principles, or frameworks like Spring",
    "sql": "relational database design, query optimization, indexing strategies, or normalization in SQL",
    "mongodb": "NoSQL schemas, data model optimization, indexing, or document structures in MongoDB",
    "aws": "AWS deployment architecture, cloud compute services (EC2/Lambda), or pipeline setups",
    "docker": "container virtualization, microservice boundaries, or orchestration using Docker/Kubernetes",
    "machine learning": "machine learning pipelines, feature engineering, training metrics, or model performance checks"
  };

  const matchedTechs = [];
  for (const [key, details] of Object.entries(techKeywords)) {
    if (text.includes(key)) {
      matchedTechs.push({ name: key, details });
    }
  }

  matchedTechs.forEach(tech => {
    if (questions.length < 5) {
      questions.push(`Your resume highlights extensive experience with ${tech.name.toUpperCase()}. Could you explain a critical scenario where you had to troubleshoot or design a system leveraging ${tech.details}?`);
    }
  });

  // 3. Fallback to highly-detailed custom role questions based on general resume analysis
  const deepCustomFallbacks = [
    "What key technical metrics did you monitor or target to measure the success of your primary development projects?",
    "Could you describe how you managed system scale and performance optimization in your technical contributions?",
    "How do you design, test, and document your codebase to ensure maintenance efficiency and seamless team collaboration?",
    "Walk me through your development workflow from receiving a feature requirement to writing, reviewing, and deploying the code."
  ];

  while (questions.length < 5) {
    const fallbackQuestion = deepCustomFallbacks[questions.length % deepCustomFallbacks.length];
    questions.push(fallbackQuestion);
  }

  return questions.slice(0, 5);
}

app.post("/interview", async (req, res) => {
  const { resumeText } = req.body;
  if (!resumeText || !resumeText.trim()) {
    return res.json({ data: pickRandomStrings(INTERVIEW_QUESTION_POOL, INTERVIEW_SESSION_COUNT) });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  try {
    const prompt = `You are an expert technical interviewer. Given the candidate's resume text below, generate exactly ${INTERVIEW_SESSION_COUNT} professional, role-relevant, and experience-level-appropriate interview questions.
    The questions must probe their projects, skills, and experience mentioned in the resume. Keep the questions direct and concise. Do not use markdown inside the questions.
    
    Resume content:
    """
    ${resumeText.slice(0, 8000)}
    """
    
    Format the output as a clean JSON array of strings. Example:
    ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"]
    
    Return ONLY the raw JSON array of strings.`;

    const response = await aiQueue.add(() => axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    ));

    let text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (text.includes("[") && text.includes("]")) {
      text = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    }
    const questions = JSON.parse(text.trim());
    if (Array.isArray(questions) && questions.length > 0) {
      console.log(`[AI Interview] Generated personalized questions based on resume.`);
      return res.json({ data: questions });
    }
    throw new Error("Invalid output format");
  } catch (err) {
    console.warn("[AI Interview] API error or Quota Exceeded. Activating advanced offline resume parsing engine...", err.message);
    const offlineQuestions = generateLocalQuestionsFromResume(resumeText);
    console.log(`[AI Interview] Successfully generated ${offlineQuestions.length} custom offline questions based on candidate's resume.`);
    res.json({ data: offlineQuestions });
  }
});

app.get("/coding", async (req, res) => {
  const count = 3;
  const timestamp = Date.now();
  const seed = crypto.randomUUID().slice(0, 8);
  const topics = ["Arrays", "Strings", "Math", "Recursion", "Searching", "Bit Manipulation"];
  const shuffledDom = shuffleInPlaceArray([...topics]);
  
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  
  try {
    const prompt = `Generate ${count} coding challenges on Math/Programming. 
    Seed: ${seed}-${timestamp}.
    1 Easy, 1 Medium, 1 Hard.
    Topics: [${shuffledDom.join(", ")}]. 
    Format: competitive programming.
    JSON: [{title, description, testCases:[{input, expectedOutput}]}] (10 test cases each). 
    Return ONLY JSON. (no extra text)`;

    const response = await aiQueue.add(() => axios.post(
      `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    ));
    let text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    const questions = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    console.log(`[AI] Questions Generated: ${questions.map(q => q.title).join(", ")}`);
    res.json({ data: questions });
  } catch (err) {
    console.error("AI FAIL: Fallback selected.", err.message);
    const chosen = getDifferentFallbackSet(count);
    console.log(`[OFFLINE] Using Backup: ${chosen.map(q => q.title).join(", ")}`);
    res.json({ data: chosen });
  }
});


app.post("/interview/feedback", async (req, res) => {
  const { question, transcript } = req.body;
  
  if (!transcript || transcript.length < 5) {
    return res.json({ feedback: "I'm listening. Please share your thoughts on this question." });
  }

  try {
    const chatCompletion = await aiQueue.add(() => groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are a professional AI interviewer. Provide a very brief (max 2 sentences), encouraging, and professional reaction to the candidate's last answer. Be specific to what they said." 
        },
        { 
          role: "user", 
          content: `Question: ${question}\nCandidate Answer: ${transcript}` 
        }
      ],
      model: "llama-3.1-8b-instant",
    }));

    const feedback = chatCompletion.choices[0]?.message?.content || "Interesting point. Let's move on.";
    res.json({ feedback });
  } catch (err) {
    console.error("Groq Error:", err);
    res.json({ feedback: "That's a valid perspective. Let's continue." });
  }
});


app.post("/run-code", async (req, res) => {
  const { language, code, stdin = "" } = req.body;
  const result = await runCodeLocally(language, code, String(stdin));
  res.json({ stdout: result.stdout, stderr: result.stderr, status: result.code === 0 ? "Accepted" : "Runtime Error" });
});

app.post("/submit-code", async (req, res) => {
  const { language, code, testCases } = req.body;
  
  const executionPromises = testCases.map(async (tc, i) => {
    const result = await runCodeLocally(language, code, String(tc.input));
    const passed = (result.stdout || "").trim() === (tc.expectedOutput || "").trim();
    return { testCaseIndex: i + 1, input: tc.input, expected: tc.expectedOutput, actual: result.stdout, passed };
  });

  const results = await Promise.all(executionPromises);
  const passedCount = results.filter(r => r.passed).length;
  
  res.json({ total: testCases.length, passed: passedCount, results });
});

app.post("/evaluate", async (req, res) => {
  const {
    userName,
    rollNumber,
    startTime,
    endTime,
    aptitudeScore,
    codingScore,
    codingResults,
    codingMaxScore,
    interviewAnswers,
  } = req.body;
  const {
    scoredAnswers,
    interviewScoreOutOf10,
  } = evaluateInterviewRound(interviewAnswers);
  
  let aiFeedback = "AI interview completed.";
  
  // Use Gemini for Deep Analysis
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const prompt = `Analyze this candidate's performance. 
    Aptitude: ${aptitudeScore}/10. 
    Coding: ${codingScore}/${codingMaxScore}. 
    Interview Answers: ${JSON.stringify(scoredAnswers)}.
    Provide a professional summary and 3 key areas of improvement.`;

    const response = await aiQueue.add(() => axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    ));
    aiFeedback = response.data.candidates?.[0]?.content?.parts?.[0]?.text || aiFeedback;
  } catch (err) {
    console.error("Gemini Evaluation Fail:", err);
  }

  const record = await Assessment.create({
    userName,
    rollNumber,
    startTime,
    endTime,
    aptitudeScore,
    codingScore,
    codingMaxScore: 30,
    codingDetails: JSON.stringify(codingResults),
    interviewAnswers: JSON.stringify(scoredAnswers),
    interviewScore: interviewScoreOutOf10,
    feedback: aiFeedback 
  });
  
  updateExcelReport(record);
  res.json({ 
    id: record.id, 
    aptitude: record.aptitudeScore, 
    coding: record.codingScore, 
    codingMax: 30, 
    interview: record.interviewScore,
    interviewAnswers: scoredAnswers,
    feedback: aiFeedback 
  });
});


app.get("/admin/results", async (req, res) => { res.json(await Assessment.findAll({ order: [['createdAt', 'DESC']] })); });
app.get("/admin/candidates", async (req, res) => {
  try {
    const list = await AuthorizedCandidate.findAll({ order: [['name', 'ASC']] });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch candidates list" });
  }
});
app.get("/admin/download-excel", (req, res) => { res.download(path.join(__dirname, "assessment_results.xlsx")); });
app.delete("/admin/clear", async (req, res) => {
  const { id, pass } = req.body;
  if (id === "admin123" && pass === "1234567890") {
    await Assessment.destroy({ where: {}, truncate: true });
    if (fs.existsSync(path.join(__dirname, "assessment_results.xlsx"))) fs.unlinkSync(path.join(__dirname, "assessment_results.xlsx"));
    res.json({ message: "Cleared" });
  } else res.status(401).send();
});

app.post("/admin/upload-candidates", async (req, res) => {
  const { fileBase64 } = req.body;
  if (!fileBase64) return res.status(400).json({ error: "No file provided" });

  try {
    const workbook = XLSX.read(fileBase64, { type: "base64" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const candidatesToInsert = data.map(row => {
      let name = "";
      let rollNumber = "";
      let password = "";
      for (const [key, val] of Object.entries(row)) {
        const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (k.includes("name")) name = String(val);
        else if (k.includes("roll") || k.includes("id")) rollNumber = String(val);
        else if (k.includes("pass")) password = String(val);
      }
      return {
        name: name.trim(),
        rollNumber: rollNumber.trim(),
        password: password.trim()
      };
    }).filter(c => c.name && c.rollNumber && c.password);

    if (candidatesToInsert.length === 0) {
      return res.status(400).json({ error: "No valid candidates found in Excel file. Ensure columns are Name, RollNumber, Password." });
    }

    await AuthorizedCandidate.destroy({ where: {}, truncate: true });
    await AuthorizedCandidate.bulkCreate(candidatesToInsert);

    res.json({ message: `Successfully uploaded ${candidatesToInsert.length} candidates.` });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: "Failed to process Excel file" });
  }
});

app.post("/verify-candidate", (req, res) => {
  upload.single("resume")(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ authorized: false, error: err.message || "File upload error" });
    }

    const { name, rollNumber, password } = req.body;
    if (!name || !rollNumber || !password) {
      return res.status(400).json({ authorized: false, error: "Name, Roll Number, and Password are required." });
    }

    if (!req.file) {
      return res.status(400).json({ authorized: false, error: "Resume upload is mandatory. You cannot proceed without uploading your PDF resume." });
    }

    try {
      const candidate = await AuthorizedCandidate.findOne({
        where: { name: name.trim(), rollNumber: rollNumber.trim(), password: password.trim() }
      });
      
      if (!candidate) {
        return res.status(401).json({ authorized: false, error: "Invalid Credentials or Not Authorized" });
      }

      // Check file signature (magic number for PDF: %PDF- is 0x25 0x50 0x44 0x46)
      const buffer = req.file.buffer;
      if (buffer.length < 4 || buffer.toString('utf8', 0, 4) !== '%PDF') {
        return res.status(400).json({ authorized: false, error: "Security check failed: Uploaded file is not a valid PDF." });
      }

      // Safe Text Extraction
      let resumeText = "";
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        resumeText = parsed.text || "";
      } catch (pdfErr) {
        console.error("PDF Parse error:", pdfErr);
        return res.status(400).json({ authorized: false, error: "Failed to parse PDF resume. Please ensure it is a valid, uncorrupted PDF file." });
      } finally {
        await parser.destroy();
      }

      if (!resumeText.trim()) {
        return res.status(400).json({ authorized: false, error: "Empty resume content. Please upload a resume containing selectable text." });
      }

      res.json({ authorized: true, resumeText });
    } catch (dbErr) {
      console.error("Verification Error:", dbErr);
      res.status(500).json({ error: "Server error during verification" });
    }
  });
});

// Interactive execution map
const activeProcesses = new Map();

io.on("connection", (socket) => {
  socket.on("run-interactive", async (data) => {
    const { language, code, initialInput } = data;
    const rootTmp = os.tmpdir();
    const id = crypto.randomUUID().replace(/-/g, "");
    const workDir = path.join(rootTmp, `ai_interact_${id}`);
    await fsPromises.mkdir(workDir, { recursive: true });

    let cmd = ""; let args = []; let filePath = "";
    if (language === "python") {
      filePath = path.join(workDir, "solution.py");
      cmd = "python"; args = ["-u", filePath]; // -u for unbuffered output
    } else if (language === "java") {
      filePath = path.join(workDir, "Main.java");
      cmd = "java"; args = [filePath];
    } else {
      socket.emit("output", "Unsupported language\n");
      return;
    }

    try {
        await fsPromises.writeFile(filePath, code, "utf8");
        const child = spawn(cmd, args, { cwd: workDir });
        activeProcesses.set(socket.id, child);

        if (initialInput) {
            child.stdin.write(initialInput);
            if (!initialInput.endsWith("\n")) child.stdin.write("\n");
        }

        child.stdout.on("data", (d) => socket.emit("output", d.toString()));
        child.stderr.on("data", (d) => socket.emit("output", d.toString()));

        child.on("close", async (exitCode) => {
          socket.emit("exit", { code: exitCode });
          activeProcesses.delete(socket.id);
          try { await fsPromises.rm(workDir, { recursive: true, force: true }); } catch (e) {}
        });

        child.on("error", (err) => {
          socket.emit("output", `Execution Error: ${err.message}\n`);
          activeProcesses.delete(socket.id);
        });

        const timer = setTimeout(() => {
          if (activeProcesses.has(socket.id)) {
            child.kill("SIGKILL");
            socket.emit("output", "\nProcess Timed Out (30s)\n");
          }
        }, 30000);

        socket.on("disconnect", () => {
          if (activeProcesses.has(socket.id)) {
            child.kill("SIGKILL");
            activeProcesses.delete(socket.id);
          }
        });
    } catch (err) {
        socket.emit("output", `Server Error: ${err.message}\n`);
    }
  });

  socket.on("input-interactive", (text) => {
    const child = activeProcesses.get(socket.id);
    if (child && !child.killed) {
      child.stdin.write(text);
    }
  });
});

const PORT = process.env.PORT || 5000;
initDB().then(() => server.listen(PORT, () => console.log(`Server listening on port ${PORT} 🚀 (Interactive Enabled)`)));
