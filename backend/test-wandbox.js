const axios = require('axios');

async function testWandbox() {
  try {
    const res = await axios.post('https://wandbox.org/api/compile.json', {
      compiler: "cpython-3.10.2",
      code: "import sys\nprint(sys.stdin.read().strip()[::-1])",
      stdin: "hello"
    });
    console.log("Wandbox Success:", res.data);
  } catch (err) {
    console.error("Wandbox Error:", err.message);
  }
}

testWandbox();
