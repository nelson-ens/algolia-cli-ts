import { promptUser } from '../utils/prompt';
import { generateUid } from '../utils/uuidUtils';

export async function generateUuid(): Promise<void> {
  console.log('🔑 Generate UUID from String');
  console.log('');

  try {
    const input = await promptUser('Enter a string to generate UUID from: ');
    
    if (!input) {
      console.log('❌ No input provided.');
      process.exit(0);
    }

    const generatedUuid = generateUid(input);
    
    console.log('');
    console.log('📈 Result:');
    console.log('━'.repeat(50));
    console.log(`📝 Input: ${input}`);
    console.log(`🔑 Generated UUID: ${generatedUuid}`);

  } catch (error) {
    console.error('❌ Error generating UUID:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}