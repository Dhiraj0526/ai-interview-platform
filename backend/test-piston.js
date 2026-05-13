const axios = require("axios");

async function test() {
  const code = `
import sys
a = input()
print(a[::-1])
`;
  const stdinText = "123\n";
  const res = await axios.post("https://emkc.org/api/v2/piston/execute", {
      language: "python",
      version: "3.10.0",
      files: [{ content: code }],
      stdin: stdinText
    });
  console.log("STDOUT:", JSON.stringify(res.data.run.stdout));
  console.log("STDERR:", JSON.stringify(res.data.run.stderr));
}

test();
