const axios = require('axios');

async function test() {
  const payload = {
    language: "python",
    code: `import sys\nprint(sys.stdin.read().strip()[::-1])`,
    testCases: [
      { input: "hello", expectedOutput: "olleh" },
      { input: "world", expectedOutput: "dlrow" }
    ]
  };

  try {
    const res = await axios.post('http://localhost:5000/submit-code', payload);
    console.log(JSON.stringify(res.data, null, 2));
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}

test();
