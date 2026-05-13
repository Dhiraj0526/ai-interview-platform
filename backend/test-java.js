const { spawn } = require('child_process');
const fs = require('fs');

const code = `
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.nextLine();
        System.out.println("Got: " + s);
    }
}
`;

fs.writeFileSync('Main.java', code);

const child = spawn('java', ['Main.java']);
let stdout = '', stderr = '';

child.stdout.on('data', d => stdout += d.toString());
child.stderr.on('data', d => stderr += d.toString());

// Write WITHOUT newline
child.stdin.write('hello');
child.stdin.end();

child.on('close', () => {
  console.log('STDOUT:', stdout);
  console.log('STDERR:', stderr);
});
