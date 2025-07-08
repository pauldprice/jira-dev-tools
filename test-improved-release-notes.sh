#!/bin/bash

# Test the improved release notes generator on APP-4308

echo "Testing improved release notes generator on APP-4308..."
echo "This will generate release notes with the improved parsing logic."
echo ""

./toolbox release-notes \
  --repo /Users/paul/code/gather/webapp \
  --source origin/next \
  --target origin/test \
  --tickets APP-4308 \
  --ai-model sonnet \
  --output test-APP-4308-improved.html

echo ""
echo "Done! Check test-APP-4308-improved.html for the results."
echo "Look for the 'Key Testing Points' section to see if the notes are complete."