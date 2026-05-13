const { spawn } = require("child_process");
const fsPromises = require("fs").promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");

async function runCodeLocally(language, code, stdinText, timeoutMs = 5000) {
  return new Promise(async (resolve) => {
    const rootTmp = os.tmpdir();
    const id = crypto.randomUUID().replace(/-/g, "");
    const workDir = path.join(rootTmp, `ai_eval_${id}`);
    await fsPromises.mkdir(workDir, { recursive: true });

    let cmd = ""; let args = []; let filePath = "";
    if (language === "python" || language === "python3") {
      filePath = path.join(workDir, "solution.py");
      cmd = "python"; args = ["-u", filePath];
    }

    try {
      await fsPromises.writeFile(filePath, code, "utf8");
      let stdout = ""; let stderr = "";
      const child = spawn(cmd, args, { cwd: workDir });

      let timer = setTimeout(() => { 
        child.kill("SIGKILL"); 
        resolve({ stdout, stderr: "Timed Out", code: 1 }); 
      }, timeoutMs);

      if (stdinText) { 
        child.stdin.write(String(stdinText)); 
        if (!String(stdinText).endsWith("\\n")) child.stdin.write("\\n");
        child.stdin.end(); // IMPORTANT: DID I MISS child.stdin.end() ???
      } else {
        child.stdin.end();
      }
      
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      
      child.on("close", async (exitCode) => {
        clearTimeout(timer);
        try { await fsPromises.rm(workDir, { recursive: true, force: true }); } catch (e) {}
        resolve({ stdout: stdout.replace(/\\r\\n/g, "\\n"), stderr: stderr.replace(/\\r\\n/g, "\\n"), code: exitCode });
      });

    } catch (err) {
      resolve({ stdout: "", stderr: err.message, code: 1 });
    }
  });
}

async function test() {
  const code = `
import sys
n_str = sys.stdin.readline().strip()
if n_str == n_str[::-1]:
    print("true")
else:
    print("false")
`;
  const result = await runCodeLocally("python", code, "121");
  console.log("STDOUT:", JSON.stringify(result.stdout));
  console.log("STDERR:", JSON.stringify(result.stderr));
}

test();
