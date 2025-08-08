import * as readline from 'readline';

export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

export async function promptUser(message: string): Promise<string> {
  const rl = createReadlineInterface();
  
  return new Promise((resolve) => {
    rl.question(message, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}