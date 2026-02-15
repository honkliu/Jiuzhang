#!/usr/bin/env node
import { renderMessage } from './renderer.js';

console.log('Testing for potential errors in renderer...\n');

let passed = 0;
let failed = 0;

function testCase(name, input, expectNoError = true) {
  try {
    const result = renderMessage(input);
    if (expectNoError) {
      console.log(`✓ ${name}`);
      passed++;
      return result;
    }
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${err.message}`);
    console.error(`  Stack: ${err.stack.split('\n')[1]}`);
    failed++;
  }
}

// Test cases that might reveal errors
console.log('1. Error Handling Tests:\n');
testCase('Null input', null);
testCase('Undefined input', undefined);
testCase('Empty string', '');
testCase('Number input', 123);
testCase('Object input', {});

console.log('\n2. Regex Edge Cases:\n');
testCase('Nested brackets', '[[]]');
testCase('Unmatched brackets', '[ incomplete');
testCase('Special regex chars', '.*+?^${}()|[]\\');
testCase('Very long text', 'a'.repeat(100000));

console.log('\n3. LaTeX Edge Cases:\n');
testCase('Invalid LaTeX command', '\\unknowncommand');
testCase('Empty LaTeX', '[ ]');
testCase('Just backslash', '\\');
testCase('Multiple backslashes', '\\\\\\\\');

console.log('\n4. Unicode Issues:\n');
testCase('Emoji', '🎉🚀💻');
testCase('Chinese text', '你好世界');
testCase('Mixed Unicode', 'Hello 世界 🌍');

console.log('\n5. Real-world message simulation:\n');
const realMessage = "Sorry, I'm having trouble responding right now.";
const result = testCase('Error message from Wa', realMessage);
console.log(`  Result: "${result}"`);

console.log(`\n${'='.repeat(60)}`);
console.log(`Total tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\n❌ ERRORS FOUND! These could cause issues.');
  process.exit(1);
} else {
  console.log('\n✅ No errors found in renderer.');
}
