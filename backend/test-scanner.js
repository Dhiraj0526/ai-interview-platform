const { spawn } = require('child_process');
const fs = require('fs');

const code = `
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println("Starting...");
        if (sc.hasNextLine()) {
            String s = sc.nextLine();
            System.out.println("Got: " + s);
        } else {
            System.out.println("No input found!");
        }
    }
}
`;

fs.writeFileSync('Main.java', code);

function executeTest(inputString) {
  return new Promise((resolve) => {
    const child = spawn('java', ['Main.java']);
    let stdout = '', stderr = '';

    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    if (inputString) {
      child.stdin.write(inputString.endsWith("\n") ? inputString : inputString + "\n");
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

async function run() {
  console.log("Empty Input Test:");
  console.log(await executeTest(""));

  console.log("\nWith Input Test:");
  console.log(await executeTest("hello"));
}

run();
